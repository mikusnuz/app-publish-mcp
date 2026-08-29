import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { AppleApiError, AppleClient } from './client.js';

// Helper to define a tool
interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  handler: (client: AppleClient, args: any) => Promise<any>;
}

const releaseTypeSchema = z.enum(['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED']);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const calendarDateSchema = z.string().date();

function validateVersionReleaseSchedule(args: {
  releaseType?: string;
  earliestReleaseDate?: string | null;
}, partialUpdate = false): void {
  if (
    typeof args.earliestReleaseDate === 'string'
    && !isoDateTimeSchema.safeParse(args.earliestReleaseDate).success
  ) {
    throw new Error('earliestReleaseDate must be a valid ISO 8601 date-time with a timezone');
  }
  if (args.releaseType === 'SCHEDULED') {
    if (!partialUpdate && typeof args.earliestReleaseDate !== 'string') {
      throw new Error('SCHEDULED releases require earliestReleaseDate');
    }
    if (partialUpdate && args.earliestReleaseDate === null) {
      throw new Error('releaseType=SCHEDULED cannot be combined with earliestReleaseDate=null');
    }
  } else if (
    typeof args.earliestReleaseDate === 'string'
    && (!partialUpdate || args.releaseType !== undefined)
  ) {
    throw new Error('earliestReleaseDate is only valid when releaseType is SCHEDULED');
  }
}

function validateCalendarDate(value: unknown, fieldName: string): void {
  if (typeof value === 'string' && !calendarDateSchema.safeParse(value).success) {
    throw new Error(`${fieldName} must be a valid calendar date in YYYY-MM-DD format`);
  }
}

function assertOfficialAppleApiUrl(value: string): void {
  const url = new URL(value);
  if (url.origin !== 'https://api.appstoreconnect.apple.com') {
    throw new Error('Apple pagination URL must use the official App Store Connect API origin');
  }
  if (!/^\/v\d+\//.test(url.pathname)) {
    throw new Error('Apple pagination URL must use a versioned App Store Connect API path');
  }
}

async function getAllApplePages(
  client: AppleClient,
  path: string,
  params?: Record<string, string>,
): Promise<any> {
  const first = await client.request(path, params ? { params } : undefined);
  const data = Array.isArray(first.data) ? [...first.data] : [];
  const included = Array.isArray(first.included) ? [...first.included] : [];
  const visited = new Set<string>();
  let next = first.links?.next as string | undefined;

  while (next) {
    assertOfficialAppleApiUrl(next);
    if (visited.has(next)) throw new Error('Apple pagination returned a repeated next URL');
    visited.add(next);
    const page = await client.request(next);
    if (Array.isArray(page.data)) data.push(...page.data);
    if (Array.isArray(page.included)) included.push(...page.included);
    next = page.links?.next;
  }

  return {
    ...first,
    data,
    ...(included.length > 0 ? { included } : {}),
    links: { ...first.links, next: undefined },
    meta: {
      ...first.meta,
      paging: { ...first.meta?.paging, total: data.length },
    },
  };
}

async function getFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDefinitiveAppleMutationError(error: unknown): boolean {
  return error instanceof AppleApiError
    && error.status >= 400
    && error.status < 500
    && ![408, 409, 429].includes(error.status);
}

async function cleanupBuildUploadReservation(
  client: AppleClient,
  buildUploadId: string,
): Promise<string> {
  try {
    await client.request(`/buildUploads/${buildUploadId}`, { method: 'DELETE' });
    return 'reservation cleanup succeeded';
  } catch (error) {
    return `reservation cleanup failed: ${errorDetail(error)}`;
  }
}

async function getBuildUploadStatus(client: AppleClient, buildUploadId: string): Promise<any> {
  return client.request(`/buildUploads/${buildUploadId}`, {
    params: {
      include: 'build',
      'fields[builds]': 'version,processingState,usesNonExemptEncryption',
    },
  });
}

async function getBuildUploadFileStatus(
  client: AppleClient,
  buildUploadFileId: string,
): Promise<any> {
  return client.request(`/buildUploadFiles/${buildUploadFileId}`, {
    params: {
      'fields[buildUploadFiles]':
        'assetDeliveryState,sourceFileChecksums,fileName,fileSize',
    },
  });
}

async function throwBuildUploadFailure(
  client: AppleClient,
  buildUploadId: string,
  details: unknown,
): Promise<never> {
  const cleanupResult = await cleanupBuildUploadReservation(client, buildUploadId);
  throw new Error(
    `Apple build upload ${buildUploadId} failed: ${JSON.stringify(details ?? [])}; ${cleanupResult}`,
  );
}

async function reconcileBuildUploadFileCommit(
  client: AppleClient,
  buildUploadId: string,
  buildUploadFileId: string,
  commitBody: any,
  initialCommitError: unknown,
): Promise<any> {
  let commitError = initialCommitError;

  for (let observation = 0; observation < 2; observation += 1) {
    const [fileResult, uploadResult] = await Promise.allSettled([
      getBuildUploadFileStatus(client, buildUploadFileId),
      getBuildUploadStatus(client, buildUploadId),
    ]);
    if (fileResult.status === 'rejected' || uploadResult.status === 'rejected') {
      const fileDetail = fileResult.status === 'rejected'
        ? errorDetail(fileResult.reason)
        : 'status read succeeded';
      const uploadDetail = uploadResult.status === 'rejected'
        ? errorDetail(uploadResult.reason)
        : 'status read succeeded';
      throw new Error(
        `Apple build upload ${buildUploadId} file ${buildUploadFileId} commit outcome is ambiguous; no cleanup was attempted. Commit error: ${errorDetail(commitError)}. Reconciliation failed (file: ${fileDetail}; upload: ${uploadDetail})`,
      );
    }

    const fileResponse = fileResult.value;
    const uploadResponse = uploadResult.value;
    const fileState = fileResponse.data?.attributes?.assetDeliveryState?.state;
    const uploadState = uploadResponse.data?.attributes?.state?.state;

    if (fileState === 'FAILED' || uploadState === 'FAILED') {
      await throwBuildUploadFailure(client, buildUploadId, {
        file: fileResponse.data?.attributes?.assetDeliveryState?.errors ?? [],
        buildUpload: uploadResponse.data?.attributes?.state?.errors ?? [],
      });
    }

    if (
      fileState === 'UPLOAD_COMPLETE'
      || fileState === 'COMPLETE'
      || uploadState === 'PROCESSING'
      || uploadState === 'COMPLETE'
    ) {
      return fileResponse;
    }

    if (fileState === 'AWAITING_UPLOAD' && uploadState === 'AWAITING_UPLOAD') {
      if (observation === 0) {
        try {
          return await client.request(`/buildUploadFiles/${buildUploadFileId}`, {
            method: 'PATCH',
            body: commitBody,
          });
        } catch (error) {
          commitError = error;
          continue;
        }
      }

      throw new Error(
        `Apple build upload ${buildUploadId} file ${buildUploadFileId} commit outcome is ambiguous; retained for reconciliation and no cleanup was attempted. Both resources remained AWAITING_UPLOAD after an idempotent commit retry. ${errorDetail(commitError)}`,
      );
    }

    throw new Error(
      `Apple build upload ${buildUploadId} file ${buildUploadFileId} commit outcome is ambiguous; no cleanup was attempted. Commit error: ${errorDetail(commitError)}. Observed file state ${String(fileState)} and upload state ${String(uploadState)}`,
    );
  }

  throw new Error(
    `Apple build upload ${buildUploadId} file ${buildUploadFileId} commit outcome is ambiguous; no cleanup was attempted`,
  );
}

async function waitForBuildUploadStatus(
  client: AppleClient,
  buildUploadId: string,
  timeoutSeconds: number,
  pollIntervalSeconds: number,
): Promise<any> {
  const deadline = Date.now() + timeoutSeconds * 1_000;

  while (true) {
    const response = await getBuildUploadStatus(client, buildUploadId);
    const state = response.data?.attributes?.state?.state;
    if (state === 'COMPLETE') return response;
    if (state === 'FAILED') {
      const details = response.data?.attributes?.state?.errors;
      await throwBuildUploadFailure(client, buildUploadId, details);
    }
    if (state !== 'AWAITING_UPLOAD' && state !== 'PROCESSING') {
      throw new Error(
        `Apple build upload ${buildUploadId} returned an unknown state: ${String(state)}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutSeconds} seconds waiting for Apple build upload ${buildUploadId}; last state: ${state}`,
      );
    }

    const remainingMs = Math.max(0, deadline - Date.now());
    await new Promise(resolve => setTimeout(
      resolve,
      Math.min(pollIntervalSeconds * 1_000, remainingMs),
    ));
  }
}

// ═══════════════════════════════════════════
// 1. App Management
// ═══════════════════════════════════════════

const listApps: ToolDef = {
  name: 'apple_list_apps',
  description: 'List all apps in App Store Connect',
  schema: z.object({
    limit: z.number().optional().describe('Max results (default 100)'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.limit) params['limit'] = String(args.limit);
    return client.request('/apps', { params });
  },
};

const getNextPage: ToolDef = {
  name: 'apple_get_next_page',
  description: 'Fetch the next App Store Connect page using the exact links.next URL returned by another Apple list tool',
  schema: z.object({
    nextUrl: z.string().url().describe('The links.next URL from a previous Apple API response'),
  }),
  handler: async (client, args) => {
    const url = new URL(args.nextUrl);
    assertOfficialAppleApiUrl(url.toString());
    return client.request(url.toString());
  },
};

const getApp: ToolDef = {
  name: 'apple_get_app',
  description: 'Get detailed info about an app including latest version state',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/apps/${args.appId}`, {
      params: { 'include': 'appStoreVersions,appInfos' },
    });
  },
};

const updateApp: ToolDef = {
  name: 'apple_update_app',
  description:
    'Update app-level submission settings: the content-rights declaration and primary locale',
  schema: z.object({
    appId: z.string().min(1).describe('App ID'),
    contentRightsDeclaration: z.enum([
      'DOES_NOT_USE_THIRD_PARTY_CONTENT',
      'USES_THIRD_PARTY_CONTENT',
    ]).nullable().optional(),
    primaryLocale: z.string().min(1).nullable().optional(),
  }),
  handler: async (client, args) => {
    const { appId, ...values } = args;
    const attributes = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(attributes).length === 0) {
      throw new Error('At least one app attribute must be provided');
    }

    return client.request(`/apps/${appId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'apps',
          id: appId,
          attributes,
        },
      },
    });
  },
};

const getAppInfo: ToolDef = {
  name: 'apple_get_app_info',
  description: 'Get app info (categories, age rating, etc)',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    const res = await client.request(`/apps/${args.appId}/appInfos`);
    return res;
  },
};

const updateAppInfoCategory: ToolDef = {
  name: 'apple_update_category',
  description: 'Update app primary/secondary category',
  schema: z.object({
    appInfoId: z.string().describe('AppInfo ID'),
    primaryCategoryId: z.string().optional().describe('Primary category ID (e.g. SOCIAL_NETWORKING)'),
    secondaryCategoryId: z.string().optional().describe('Secondary category ID'),
  }),
  handler: async (client, args) => {
    const relationships: any = {};
    if (args.primaryCategoryId) {
      relationships.primaryCategory = {
        data: { type: 'appCategories', id: args.primaryCategoryId },
      };
    }
    if (args.secondaryCategoryId) {
      relationships.secondaryCategory = {
        data: { type: 'appCategories', id: args.secondaryCategoryId },
      };
    }
    return client.request(`/appInfos/${args.appInfoId}`, {
      method: 'PATCH',
      body: { data: { type: 'appInfos', id: args.appInfoId, relationships } },
    });
  },
};

// ═══════════════════════════════════════════
// 2. Bundle IDs
// ═══════════════════════════════════════════

const listBundleIds: ToolDef = {
  name: 'apple_list_bundle_ids',
  description: 'List registered bundle IDs',
  schema: z.object({
    limit: z.number().optional(),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.limit) params['limit'] = String(args.limit);
    return client.request('/bundleIds', { params });
  },
};

const createBundleId: ToolDef = {
  name: 'apple_create_bundle_id',
  description: 'Register a new bundle ID',
  schema: z.object({
    identifier: z.string().describe('Bundle ID (e.g. com.example.app)'),
    name: z.string().describe('Display name'),
    platform: z.enum(['IOS', 'MAC_OS', 'UNIVERSAL']),
  }),
  handler: async (client, args) => {
    return client.request('/bundleIds', {
      method: 'POST',
      body: {
        data: {
          type: 'bundleIds',
          attributes: {
            identifier: args.identifier,
            name: args.name,
            platform: args.platform,
          },
        },
      },
    });
  },
};

// ═══════════════════════════════════════════
// 3. Versions & Localizations
// ═══════════════════════════════════════════

const listVersions: ToolDef = {
  name: 'apple_list_versions',
  description: 'List all App Store versions for an app',
  schema: z.object({
    appId: z.string().describe('App ID'),
    platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).optional(),
    state: z.string().optional().describe('Filter by current appVersionState (e.g. PREPARE_FOR_SUBMISSION, READY_FOR_DISTRIBUTION)'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.platform) params['filter[platform]'] = args.platform;
    if (args.state) params['filter[appVersionState]'] = args.state;
    return client.request(`/apps/${args.appId}/appStoreVersions`, { params });
  },
};

const createVersion: ToolDef = {
  name: 'apple_create_version',
  description: 'Create a new App Store version for submission',
  schema: z.object({
    appId: z.string().min(1).describe('App ID'),
    versionString: z.string().min(1).describe('Version (e.g. 1.0.0)'),
    platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).default('IOS'),
    releaseType: releaseTypeSchema.optional(),
    earliestReleaseDate: isoDateTimeSchema.optional()
      .describe('ISO 8601 date-time with timezone; required only for SCHEDULED releases'),
    copyright: z.string().optional(),
  }),
  handler: async (client, args) => {
    validateVersionReleaseSchedule(args);
    const attributes: any = {
      versionString: args.versionString,
      platform: args.platform,
    };
    if (args.releaseType !== undefined) attributes.releaseType = args.releaseType;
    if (args.earliestReleaseDate !== undefined) {
      attributes.earliestReleaseDate = args.earliestReleaseDate;
    }
    if (args.copyright !== undefined) attributes.copyright = args.copyright;

    return client.request('/appStoreVersions', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreVersions',
          attributes,
          relationships: {
            app: { data: { type: 'apps', id: args.appId } },
          },
        },
      },
    });
  },
};

const updateVersion: ToolDef = {
  name: 'apple_update_version',
  description:
    'Update an existing App Store version\'s version, copyright, or release timing',
  schema: z.object({
    versionId: z.string().min(1).describe('App Store Version ID'),
    versionString: z.string().min(1).optional(),
    copyright: z.string().nullable().optional(),
    releaseType: releaseTypeSchema.optional(),
    earliestReleaseDate: isoDateTimeSchema.nullable().optional()
      .describe('ISO 8601 date-time with timezone; required for SCHEDULED releases'),
  }),
  handler: async (client, args) => {
    validateVersionReleaseSchedule(args, true);
    const { versionId, ...values } = args;
    const attributes = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(attributes).length === 0) {
      throw new Error('At least one App Store version attribute must be provided');
    }

    return client.request(`/appStoreVersions/${versionId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appStoreVersions',
          id: versionId,
          attributes,
        },
      },
    });
  },
};

const listVersionLocalizations: ToolDef = {
  name: 'apple_list_version_localizations',
  description: 'List all localizations for a version',
  schema: z.object({
    versionId: z.string().describe('App Store Version ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/appStoreVersions/${args.versionId}/appStoreVersionLocalizations`);
  },
};

const createVersionLocalization: ToolDef = {
  name: 'apple_create_version_localization',
  description: 'Create a new localization for a version',
  schema: z.object({
    versionId: z.string().describe('App Store Version ID'),
    locale: z.string().describe('Locale code (e.g. ko, en-US, ja)'),
    description: z.string().optional(),
    keywords: z.string().optional().describe('Comma-separated keywords'),
    whatsNew: z.string().optional(),
    promotionalText: z.string().optional(),
    marketingUrl: z.string().optional(),
    supportUrl: z.string().optional(),
  }),
  handler: async (client, args) => {
    const attributes: any = { locale: args.locale };
    if (args.description) attributes.description = args.description;
    if (args.keywords) attributes.keywords = args.keywords;
    if (args.whatsNew) attributes.whatsNew = args.whatsNew;
    if (args.promotionalText) attributes.promotionalText = args.promotionalText;
    if (args.marketingUrl) attributes.marketingUrl = args.marketingUrl;
    if (args.supportUrl) attributes.supportUrl = args.supportUrl;

    return client.request('/appStoreVersionLocalizations', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreVersionLocalizations',
          attributes,
          relationships: {
            appStoreVersion: {
              data: { type: 'appStoreVersions', id: args.versionId },
            },
          },
        },
      },
    });
  },
};

const updateVersionLocalization: ToolDef = {
  name: 'apple_update_version_localization',
  description: 'Update localization fields (description, keywords, whatsNew, etc)',
  schema: z.object({
    localizationId: z.string().describe('Localization ID'),
    description: z.string().optional(),
    keywords: z.string().optional().describe('Comma-separated keywords'),
    whatsNew: z.string().optional(),
    promotionalText: z.string().optional(),
    marketingUrl: z.string().optional(),
    supportUrl: z.string().optional(),
  }),
  handler: async (client, args) => {
    const attributes: any = {};
    if (args.description !== undefined) attributes.description = args.description;
    if (args.keywords !== undefined) attributes.keywords = args.keywords;
    if (args.whatsNew !== undefined) attributes.whatsNew = args.whatsNew;
    if (args.promotionalText !== undefined) attributes.promotionalText = args.promotionalText;
    if (args.marketingUrl !== undefined) attributes.marketingUrl = args.marketingUrl;
    if (args.supportUrl !== undefined) attributes.supportUrl = args.supportUrl;

    return client.request(`/appStoreVersionLocalizations/${args.localizationId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appStoreVersionLocalizations',
          id: args.localizationId,
          attributes,
        },
      },
    });
  },
};

// ═══════════════════════════════════════════
// 4. Screenshots
// ═══════════════════════════════════════════

const listScreenshotSets: ToolDef = {
  name: 'apple_list_screenshot_sets',
  description: 'List screenshot sets for a localization',
  schema: z.object({
    localizationId: z.string().describe('Version Localization ID'),
  }),
  handler: async (client, args) => {
    return client.request(
      `/appStoreVersionLocalizations/${args.localizationId}/appScreenshotSets`,
      { params: { 'include': 'appScreenshots' } },
    );
  },
};

const createScreenshotSet: ToolDef = {
  name: 'apple_create_screenshot_set',
  description: 'Create a screenshot set for a specific display type',
  schema: z.object({
    localizationId: z.string().describe('Version Localization ID'),
    displayType: z.string().describe('Display type (e.g. APP_IPHONE_67, APP_IPHONE_65, APP_IPAD_PRO_129, APP_IPAD_PRO_3GEN_129)'),
  }),
  handler: async (client, args) => {
    return client.request('/appScreenshotSets', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: args.displayType },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: 'appStoreVersionLocalizations', id: args.localizationId },
            },
          },
        },
      },
    });
  },
};

const uploadScreenshot: ToolDef = {
  name: 'apple_upload_screenshot',
  description: 'Upload and commit a screenshot while preserving its ID for safe recovery after ambiguous failures',
  schema: z.object({
    screenshotSetId: z.string().describe('Screenshot Set ID'),
    filePath: z.string().describe('Local path to the screenshot image'),
    fileName: z.string().describe('File name (e.g. screen1.png)'),
    fileSize: z.number().int().positive().optional().describe('Expected file size in bytes; the actual file size is always used'),
  }),
  handler: async (client, args) => {
    const actualFileSize = statSync(args.filePath).size;
    if (args.fileSize !== undefined && args.fileSize !== actualFileSize) {
      throw new Error(
        `Screenshot fileSize mismatch: expected ${args.fileSize}, actual ${actualFileSize}`,
      );
    }
    const sourceFileChecksum = createHash('md5')
      .update(readFileSync(args.filePath))
      .digest('hex');

    // Step 1: Reserve screenshot
    const reservation = await client.request('/appScreenshots', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshots',
          attributes: {
            fileName: args.fileName,
            fileSize: actualFileSize,
          },
          relationships: {
            appScreenshotSet: {
              data: { type: 'appScreenshotSets', id: args.screenshotSetId },
            },
          },
        },
      },
    });

    const screenshot = reservation.data;
    const screenshotId = screenshot?.id;
    if (typeof screenshotId !== 'string' || screenshotId.length === 0) {
      throw new Error(
        'Apple screenshot reservation succeeded but no screenshotId was returned; automatic cleanup is not possible',
      );
    }

    const cleanupReservation = async (): Promise<string> => {
      try {
        await client.request(`/appScreenshots/${screenshotId}`, { method: 'DELETE' });
        return 'reservation cleanup succeeded';
      } catch (error) {
        return `reservation cleanup failed: ${errorDetail(error)}`;
      }
    };
    const getDeliveryStatus = async (): Promise<any> => client.request(
      `/appScreenshots/${screenshotId}`,
      {
        params: {
          'fields[appScreenshots]':
            'assetDeliveryState,sourceFileChecksum,fileName,fileSize',
        },
      },
    );

    // Apple returns pre-signed upload operations with their own request headers.
    const operations = screenshot?.attributes?.uploadOperations;
    if (!Array.isArray(operations) || operations.length === 0) {
      const cleanupResult = await cleanupReservation();
      throw new Error(
        `Apple screenshot ${screenshotId} reservation did not include upload operations; ${cleanupResult}`,
      );
    }
    try {
      for (const operation of operations) {
        await client.uploadOperation(operation, args.filePath);
      }
    } catch (error) {
      const cleanupResult = await cleanupReservation();
      throw new Error(
        `Apple screenshot ${screenshotId} failed before commit; ${cleanupResult}. ${errorDetail(error)}`,
      );
    }

    const commitBody = {
      data: {
        type: 'appScreenshots',
        id: screenshotId,
        attributes: {
          uploaded: true,
          sourceFileChecksum,
        },
      },
    };
    const commit = (): Promise<any> => client.request(`/appScreenshots/${screenshotId}`, {
      method: 'PATCH',
      body: commitBody,
    });

    try {
      await commit();
    } catch (initialCommitError) {
      if (isDefinitiveAppleMutationError(initialCommitError)) {
        const cleanupResult = await cleanupReservation();
        throw new Error(
          `Apple screenshot ${screenshotId} commit was rejected; ${cleanupResult}. ${errorDetail(initialCommitError)}`,
        );
      }

      let commitError = initialCommitError;
      let committed = false;
      for (let observation = 0; observation < 2; observation += 1) {
        let statusResponse: any;
        try {
          statusResponse = await getDeliveryStatus();
        } catch (statusError) {
          throw new Error(
            `Apple screenshot ${screenshotId} commit outcome is ambiguous; screenshot was retained and no cleanup was attempted. Commit error: ${errorDetail(commitError)}. Status read failed: ${errorDetail(statusError)}`,
          );
        }

        const deliveryState = statusResponse.data?.attributes?.assetDeliveryState;
        const state = deliveryState?.state;
        if (state === 'UPLOAD_COMPLETE' || state === 'COMPLETE') {
          committed = true;
          break;
        }
        if (state === 'FAILED') {
          const cleanupResult = await cleanupReservation();
          throw new Error(
            `Apple screenshot ${screenshotId} delivery failed: ${JSON.stringify(deliveryState?.errors ?? [])}; ${cleanupResult}. Commit error: ${errorDetail(commitError)}`,
          );
        }
        if (state !== 'AWAITING_UPLOAD') {
          throw new Error(
            `Apple screenshot ${screenshotId} commit outcome is ambiguous; screenshot was retained and no cleanup was attempted. Commit error: ${errorDetail(commitError)}. Observed assetDeliveryState ${String(state)}`,
          );
        }
        if (observation === 1) {
          throw new Error(
            `Apple screenshot ${screenshotId} commit outcome is ambiguous; screenshot was retained and no cleanup was attempted. It remained AWAITING_UPLOAD after an idempotent commit retry. ${errorDetail(commitError)}`,
          );
        }

        try {
          await commit();
          committed = true;
          break;
        } catch (retryError) {
          commitError = retryError;
        }
      }

      if (!committed) {
        throw new Error(
          `Apple screenshot ${screenshotId} commit outcome is ambiguous; screenshot was retained and no cleanup was attempted`,
        );
      }
    }

    return { success: true, screenshotId };
  },
};

const deleteScreenshot: ToolDef = {
  name: 'apple_delete_screenshot',
  description: 'Delete a screenshot',
  schema: z.object({
    screenshotId: z.string().describe('Screenshot ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/appScreenshots/${args.screenshotId}`, { method: 'DELETE' });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 5. Builds
// ═══════════════════════════════════════════

const listBuilds: ToolDef = {
  name: 'apple_list_builds',
  description: 'List builds uploaded to App Store Connect',
  schema: z.object({
    appId: z.string().describe('App ID'),
    limit: z.number().optional(),
    preReleaseVersion: z.string().optional().describe('Filter by version string'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {
      'filter[app]': args.appId,
      'sort': '-uploadedDate',
    };
    if (args.limit) params['limit'] = String(args.limit);
    if (args.preReleaseVersion) params['filter[preReleaseVersion.version]'] = args.preReleaseVersion;
    return client.request('/builds', { params });
  },
};

const getBuildUpload: ToolDef = {
  name: 'apple_get_build_upload',
  description:
    'Get the current state of a Build Uploads API operation, including the imported build when available',
  schema: z.object({
    buildUploadId: z.string().min(1).describe('Build Upload ID'),
  }),
  handler: async (client, args) => {
    return getBuildUploadStatus(client, args.buildUploadId);
  },
};

const deleteBuildUpload: ToolDef = {
  name: 'apple_delete_build_upload',
  description:
    'Explicitly discard an AWAITING_UPLOAD or FAILED Build Upload after checking it with apple_get_build_upload; do not use for PROCESSING or COMPLETE uploads',
  schema: z.object({
    buildUploadId: z.string().min(1).describe('Build Upload ID to discard'),
  }),
  handler: async (client, args) => {
    const status = await getBuildUploadStatus(client, args.buildUploadId);
    const state = status.data?.attributes?.state?.state;
    if (state !== 'AWAITING_UPLOAD' && state !== 'FAILED') {
      throw new Error(
        `Apple build upload ${args.buildUploadId} cannot be deleted in state ${String(state)}; only AWAITING_UPLOAD or FAILED reservations can be discarded`,
      );
    }

    await client.request(`/buildUploads/${args.buildUploadId}`, { method: 'DELETE' });
    return {
      success: true,
      buildUploadId: args.buildUploadId,
      previousState: state,
    };
  },
};

const waitForBuildUpload: ToolDef = {
  name: 'apple_wait_for_build_upload',
  description:
    'Wait until a Build Uploads API operation completes or fails, returning the imported build relationship on success',
  schema: z.object({
    buildUploadId: z.string().min(1).describe('Build Upload ID'),
    timeoutSeconds: z.number().int().min(1).max(7200).default(1800),
    pollIntervalSeconds: z.number().int().min(1).max(60).default(10),
  }),
  handler: async (client, args) => {
    return waitForBuildUploadStatus(
      client,
      args.buildUploadId,
      args.timeoutSeconds,
      args.pollIntervalSeconds,
    );
  },
};

const uploadBuild: ToolDef = {
  name: 'apple_upload_build',
  description:
    'Upload a signed IPA through the App Store Connect Build Uploads API: reserve the upload and file, send every presigned range, commit its SHA-256 checksum, and optionally wait for import',
  schema: z.object({
    appId: z.string().min(1).describe('App ID'),
    filePath: z.string().min(1).describe('Local path to a signed .ipa file'),
    versionString: z.string().min(1).describe('CFBundleShortVersionString, e.g. 1.2.0'),
    buildNumber: z.string().min(1).describe('CFBundleVersion, e.g. 42'),
    platform: z.enum(['IOS', 'TV_OS', 'VISION_OS']).default('IOS'),
    expectedFileSize: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional()
      .describe('Optional expected IPA size in bytes; checked locally before any API request'),
    expectedSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional()
      .describe('Optional expected SHA-256 hex digest; checked locally before any API request'),
    waitForProcessing: z.boolean().default(true)
      .describe('Wait for the Build Upload to reach COMPLETE or FAILED'),
    timeoutSeconds: z.number().int().min(1).max(7200).default(1800),
    pollIntervalSeconds: z.number().int().min(1).max(60).default(10),
  }),
  handler: async (client, args) => {
    if (extname(args.filePath).toLowerCase() !== '.ipa') {
      throw new Error('Apple build upload requires a .ipa file');
    }

    const fileStats = statSync(args.filePath);
    if (!fileStats.isFile()) {
      throw new Error('Apple build upload path must point to a regular file');
    }
    const fileSize = fileStats.size;
    if (!Number.isSafeInteger(fileSize) || fileSize < 1) {
      throw new Error(`Apple build upload file has an invalid size: ${fileSize}`);
    }
    if (args.expectedFileSize !== undefined && args.expectedFileSize !== fileSize) {
      throw new Error(
        `IPA fileSize mismatch: expected ${args.expectedFileSize}, actual ${fileSize}`,
      );
    }

    const sha256 = await getFileSha256(args.filePath);
    if (
      args.expectedSha256 !== undefined
      && args.expectedSha256.toLowerCase() !== sha256
    ) {
      throw new Error(
        `IPA SHA-256 mismatch: expected ${args.expectedSha256.toLowerCase()}, actual ${sha256}`,
      );
    }

    const buildUpload = await client.request('/buildUploads', {
      method: 'POST',
      body: {
        data: {
          type: 'buildUploads',
          attributes: {
            cfBundleShortVersionString: args.versionString,
            cfBundleVersion: args.buildNumber,
            platform: args.platform,
          },
          relationships: {
            app: { data: { type: 'apps', id: args.appId } },
          },
        },
      },
    });
    const buildUploadId = buildUpload.data?.id;
    if (typeof buildUploadId !== 'string' || buildUploadId.length === 0) {
      throw new Error('Apple API response did not include a Build Upload ID');
    }

    const fileName = basename(args.filePath);
    let buildUploadFileId: string;
    try {
      const buildUploadFile = await client.request('/buildUploadFiles', {
        method: 'POST',
        body: {
          data: {
            type: 'buildUploadFiles',
            attributes: {
              assetType: 'ASSET',
              fileName,
              fileSize,
              uti: 'com.apple.ipa',
            },
            relationships: {
              buildUpload: { data: { type: 'buildUploads', id: buildUploadId } },
            },
          },
        },
      });
      buildUploadFileId = buildUploadFile.data?.id;
      if (typeof buildUploadFileId !== 'string' || buildUploadFileId.length === 0) {
        throw new Error('Apple API response did not include a Build Upload File ID');
      }
      const operations = buildUploadFile.data?.attributes?.uploadOperations;
      if (!Array.isArray(operations) || operations.length === 0) {
        throw new Error('Apple API response did not include build upload operations');
      }

      const ranges = operations.map((operation: any) => {
        const offset = operation.offset ?? 0;
        const length = operation.length ?? fileSize - offset;
        if (!Number.isSafeInteger(offset) || offset < 0) {
          throw new Error(`Apple build upload operation has an invalid offset: ${offset}`);
        }
        if (!Number.isSafeInteger(length) || length < 1 || offset + length > fileSize) {
          throw new Error(
            `Apple build upload operation has an invalid range: offset ${offset}, length ${length}, fileSize ${fileSize}`,
          );
        }
        return { offset, length };
      }).sort((left: any, right: any) => left.offset - right.offset);

      let nextOffset = 0;
      for (const range of ranges) {
        if (range.offset !== nextOffset) {
          throw new Error(
            `Apple build upload operations do not cover the IPA exactly at byte ${nextOffset}`,
          );
        }
        nextOffset += range.length;
      }
      if (nextOffset !== fileSize) {
        throw new Error(
          `Apple build upload operations cover ${nextOffset} of ${fileSize} IPA bytes`,
        );
      }

      for (const operation of operations) {
        await client.uploadOperation(operation, args.filePath);
      }
    } catch (error) {
      const cleanupResult = await cleanupBuildUploadReservation(client, buildUploadId);
      throw new Error(
        `Apple build upload ${buildUploadId} failed before processing; ${cleanupResult}. ${errorDetail(error)}`,
      );
    }

    const commitBody = {
      data: {
        type: 'buildUploadFiles',
        id: buildUploadFileId,
        attributes: {
          sourceFileChecksums: {
            file: {
              hash: sha256,
              algorithm: 'SHA_256',
            },
          },
          uploaded: true,
        },
      },
    };
    let committedFile: any;
    try {
      committedFile = await client.request(`/buildUploadFiles/${buildUploadFileId}`, {
        method: 'PATCH',
        body: commitBody,
      });
    } catch (error) {
      if (isDefinitiveAppleMutationError(error)) {
        const cleanupResult = await cleanupBuildUploadReservation(client, buildUploadId);
        throw new Error(
          `Apple build upload ${buildUploadId} file ${buildUploadFileId} commit was rejected; ${cleanupResult}. ${errorDetail(error)}`,
        );
      }
      committedFile = await reconcileBuildUploadFileCommit(
        client,
        buildUploadId,
        buildUploadFileId,
        commitBody,
        error,
      );
    }

    const status = args.waitForProcessing === false
      ? await getBuildUploadStatus(client, buildUploadId)
      : await waitForBuildUploadStatus(
          client,
          buildUploadId,
          args.timeoutSeconds,
          args.pollIntervalSeconds,
        );
    const statusState = status.data?.attributes?.state?.state;
    if (statusState === 'FAILED') {
      const details = status.data?.attributes?.state?.errors;
      await throwBuildUploadFailure(client, buildUploadId, details);
    }
    if (!['AWAITING_UPLOAD', 'PROCESSING', 'COMPLETE'].includes(statusState)) {
      throw new Error(
        `Apple build upload ${buildUploadId} returned an unknown state: ${String(statusState)}`,
      );
    }

    return {
      success: true,
      completed: statusState === 'COMPLETE',
      buildUploadId,
      buildUploadFileId,
      fileName,
      fileSize,
      sha256,
      buildUploadFile: {
        id: committedFile?.data?.id ?? buildUploadFileId,
        assetDeliveryState: committedFile?.data?.attributes?.assetDeliveryState,
        sourceFileChecksums: committedFile?.data?.attributes?.sourceFileChecksums,
      },
      status,
    };
  },
};

const setBuildEncryption: ToolDef = {
  name: 'apple_set_build_encryption',
  description:
    'Set a processed build\'s usesNonExemptEncryption answer before submission; true may also require an app encryption declaration or supporting export-compliance documentation',
  schema: z.object({
    buildId: z.string().min(1).describe('Build ID'),
    usesNonExemptEncryption: z.boolean(),
  }),
  handler: async (client, args) => {
    const response = await client.request(`/builds/${args.buildId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'builds',
          id: args.buildId,
          attributes: {
            usesNonExemptEncryption: args.usesNonExemptEncryption,
          },
        },
      },
    });
    if (!args.usesNonExemptEncryption) return response;
    return {
      ...response,
      exportComplianceNote:
        'Apple may require an app encryption declaration or supporting export-compliance documentation for this build.',
    };
  },
};

const assignBuild: ToolDef = {
  name: 'apple_assign_build',
  description: 'Assign a build to an App Store version',
  schema: z.object({
    versionId: z.string().describe('App Store Version ID'),
    buildId: z.string().describe('Build ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/appStoreVersions/${args.versionId}/relationships/build`, {
      method: 'PATCH',
      body: {
        data: { type: 'builds', id: args.buildId },
      },
    });
  },
};

// ═══════════════════════════════════════════
// 6. Age Rating & Review Info
// ═══════════════════════════════════════════

const ageRatingFrequency = z.enum([
  'NONE',
  'INFREQUENT',
  'FREQUENT',
  // Apple still accepts these legacy values, but deprecated them in API 4.1.
  'INFREQUENT_OR_MILD',
  'FREQUENT_OR_INTENSE',
]);

const getAgeRating: ToolDef = {
  name: 'apple_get_age_rating',
  description: 'Get age rating declaration for an app info',
  schema: z.object({
    appInfoId: z.string().describe('AppInfo ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/appInfos/${args.appInfoId}/ageRatingDeclaration`);
  },
};

const updateAgeRating: ToolDef = {
  name: 'apple_update_age_rating',
  description: 'Update the current App Store age-rating questionnaire. Prefer NONE, INFREQUENT, or FREQUENT for frequency fields; legacy values remain accepted by Apple for compatibility.',
  schema: z.object({
    ageRatingId: z.string().describe('Age Rating Declaration ID'),
    advertising: z.boolean().nullable().optional(),
    alcoholTobaccoOrDrugUseOrReferences: ageRatingFrequency.nullable().optional(),
    contests: ageRatingFrequency.nullable().optional(),
    gambling: z.boolean().nullable().optional(),
    gamblingSimulated: ageRatingFrequency.nullable().optional(),
    gunsOrOtherWeapons: ageRatingFrequency.nullable().optional(),
    healthOrWellnessTopics: z.boolean().nullable().optional(),
    kidsAgeBand: z.enum(['FIVE_AND_UNDER', 'SIX_TO_EIGHT', 'NINE_TO_ELEVEN']).nullable().optional(),
    lootBox: z.boolean().nullable().optional(),
    medicalOrTreatmentInformation: ageRatingFrequency.nullable().optional(),
    messagingAndChat: z.boolean().nullable().optional(),
    parentalControls: z.boolean().nullable().optional(),
    profanityOrCrudeHumor: ageRatingFrequency.nullable().optional(),
    ageAssurance: z.boolean().nullable().optional(),
    sexualContentGraphicAndNudity: ageRatingFrequency.nullable().optional(),
    sexualContentOrNudity: ageRatingFrequency.nullable().optional(),
    socialMedia: z.boolean().nullable().optional(),
    socialMediaAgeRestricted: z.boolean().nullable().optional(),
    horrorOrFearThemes: ageRatingFrequency.nullable().optional(),
    matureOrSuggestiveThemes: ageRatingFrequency.nullable().optional(),
    unrestrictedWebAccess: z.boolean().nullable().optional(),
    userGeneratedContent: z.boolean().nullable().optional(),
    violenceCartoonOrFantasy: ageRatingFrequency.nullable().optional(),
    violenceRealisticProlongedGraphicOrSadistic: ageRatingFrequency.nullable().optional(),
    violenceRealistic: ageRatingFrequency.nullable().optional(),
    ageRatingOverrideV2: z.enum(['NONE', 'NINE_PLUS', 'THIRTEEN_PLUS', 'SIXTEEN_PLUS', 'EIGHTEEN_PLUS', 'UNRATED']).nullable().optional(),
    koreaAgeRatingOverride: z.enum(['NONE', 'FIFTEEN_PLUS', 'NINETEEN_PLUS']).nullable().optional(),
    developerAgeRatingInfoUrl: z.string().url().nullable().optional(),
  }),
  handler: async (client, args) => {
    const { ageRatingId, ...attributes } = args;
    return client.request(`/ageRatingDeclarations/${ageRatingId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'ageRatingDeclarations',
          id: ageRatingId,
          attributes,
        },
      },
    });
  },
};

const updateReviewDetail: ToolDef = {
  name: 'apple_update_review_detail',
  description: 'Update app review info (contact info, notes, demo account for reviewer)',
  schema: z.object({
    versionId: z.string().describe('App Store Version ID'),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    contactFirstName: z.string().optional(),
    contactLastName: z.string().optional(),
    demoAccountName: z.string().optional(),
    demoAccountPassword: z.string().optional(),
    demoAccountRequired: z.boolean().optional(),
    notes: z.string().optional().describe('Notes for the reviewer'),
  }),
  handler: async (client, args) => {
    // A version without review details returns 404; that is the create case.
    let existing: any = null;
    try {
      existing = await client.request(
        `/appStoreVersions/${args.versionId}/appStoreReviewDetail`,
      );
    } catch (error) {
      if (!(error instanceof AppleApiError) || error.status !== 404) throw error;
    }

    const reviewDetailId = existing?.data?.id;
    const { versionId, ...attributes } = args;

    if (reviewDetailId) {
      return client.request(`/appStoreReviewDetails/${reviewDetailId}`, {
        method: 'PATCH',
        body: {
          data: {
            type: 'appStoreReviewDetails',
            id: reviewDetailId,
            attributes,
          },
        },
      });
    }

    // Create new
    return client.request('/appStoreReviewDetails', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreReviewDetails',
          attributes,
          relationships: {
            appStoreVersion: {
              data: { type: 'appStoreVersions', id: versionId },
            },
          },
        },
      },
    });
  },
};

// ═══════════════════════════════════════════
// 7. Submission
// ═══════════════════════════════════════════

const submittedReviewStates = new Set([
  'WAITING_FOR_REVIEW',
  'IN_REVIEW',
  'UNRESOLVED_ISSUES',
  'COMPLETING',
  'COMPLETE',
]);

function relatedResourceId(response: any, relationship: string, type: string): string | undefined {
  const relationshipId = response.data?.relationships?.[relationship]?.data?.id;
  if (typeof relationshipId === 'string') return relationshipId;
  const included = response.included?.find((resource: any) => resource.type === type);
  return typeof included?.id === 'string' ? included.id : undefined;
}

async function getAppStoreVersionContext(
  client: AppleClient,
  versionId: string,
): Promise<any> {
  return client.request(`/appStoreVersions/${versionId}`, {
    params: {
      include: 'app',
      'fields[appStoreVersions]': 'platform,app',
    },
  });
}

function assertAppStoreVersionContext(
  response: any,
  versionId: string,
  appId: string,
  platform: string,
): void {
  const actualAppId = relatedResourceId(response, 'app', 'apps');
  const actualPlatform = response.data?.attributes?.platform;
  if (response.data?.id !== versionId || actualAppId !== appId || actualPlatform !== platform) {
    throw new Error(
      `App Store version ${versionId} does not match app ${appId} and platform ${platform}; received app ${String(actualAppId)} and platform ${String(actualPlatform)}`,
    );
  }
}

async function getReviewSubmission(
  client: AppleClient,
  submissionId: string,
): Promise<any> {
  return client.request(`/reviewSubmissions/${submissionId}`, {
    params: {
      include: 'app',
      'fields[reviewSubmissions]': 'platform,state,app',
    },
  });
}

function assertReviewSubmissionContext(
  response: any,
  submissionId: string,
  appId: string,
  platform: string,
): string {
  const actualAppId = relatedResourceId(response, 'app', 'apps');
  const actualPlatform = response.data?.attributes?.platform;
  const state = response.data?.attributes?.state;
  if (
    response.data?.id !== submissionId
    || actualAppId !== appId
    || actualPlatform !== platform
  ) {
    throw new Error(
      `Review submission ${submissionId} does not match app ${appId} and platform ${platform}; received app ${String(actualAppId)} and platform ${String(actualPlatform)}`,
    );
  }
  return String(state);
}

async function listReadyReviewSubmissions(
  client: AppleClient,
  appId: string,
  platform: string,
): Promise<any> {
  return getAllApplePages(client, '/reviewSubmissions', {
    'filter[app]': appId,
    'filter[platform]': platform,
    'filter[state]': 'READY_FOR_REVIEW',
    'fields[reviewSubmissions]': 'platform,state,app',
    limit: '200',
  });
}

async function getReviewSubmissionItems(
  client: AppleClient,
  submissionId: string,
): Promise<any> {
  return getAllApplePages(client, `/reviewSubmissions/${submissionId}/items`, {
    include: 'appStoreVersion',
    'fields[reviewSubmissionItems]': 'state,appStoreVersion',
    'fields[appStoreVersions]': 'platform',
    limit: '200',
  });
}

function attachedAppStoreVersionIds(itemsResponse: any): string[] {
  return (Array.isArray(itemsResponse.data) ? itemsResponse.data : [])
    .map((item: any) => item.relationships?.appStoreVersion?.data?.id)
    .filter((id: unknown): id is string => typeof id === 'string');
}

async function cancelReviewSubmissionBestEffort(
  client: AppleClient,
  submissionId: string,
): Promise<string> {
  try {
    await client.request(`/reviewSubmissions/${submissionId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'reviewSubmissions',
          id: submissionId,
          attributes: { canceled: true },
        },
      },
    });
    return 'new submission cleanup succeeded';
  } catch (error) {
    return `new submission cleanup failed: ${errorDetail(error)}`;
  }
}

function submissionRetryHint(submissionId: string): string {
  return `Retained review submission ${submissionId}; retry apple_submit_for_review with submissionId=${submissionId}.`;
}

function exportComplianceHint(error: unknown): string {
  return errorDetail(error).includes('usesNonExemptEncryption')
    ? ' Set the build export-compliance answer with apple_set_build_encryption, then retry.'
    : '';
}

const submitForReview: ToolDef = {
  name: 'apple_submit_for_review',
  description:
    'Create or resume an App Store review submission, attach the version idempotently, and submit it while preserving the submission ID for safe recovery',
  schema: z.object({
    appId: z.string().min(1).describe('App ID'),
    versionId: z.string().min(1).describe('App Store Version ID to submit'),
    platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).default('IOS').describe('Platform of the version being submitted'),
    submissionId: z.string().min(1).optional()
      .describe('Existing READY_FOR_REVIEW submission ID to resume after an interrupted call'),
  }),
  handler: async (client, args) => {
    let versionContext: any;
    try {
      versionContext = await getAppStoreVersionContext(client, args.versionId);
      assertAppStoreVersionContext(
        versionContext,
        args.versionId,
        args.appId,
        args.platform,
      );
    } catch (error) {
      const prefix = args.submissionId
        ? `Review submission ${args.submissionId} cannot be resumed.`
        : `Cannot create a review submission for app ${args.appId}, platform ${args.platform}.`;
      throw new Error(`${prefix} ${errorDetail(error)}`);
    }

    let submissionId = args.submissionId as string | undefined;
    let createdThisCall = false;
    let selectedFromPreflight = false;
    let submissionState = 'READY_FOR_REVIEW';

    if (submissionId) {
      let existingSubmission: any;
      try {
        existingSubmission = await getReviewSubmission(client, submissionId);
        submissionState = assertReviewSubmissionContext(
          existingSubmission,
          submissionId,
          args.appId,
          args.platform,
        );
      } catch (error) {
        throw new Error(
          `Review submission ${submissionId} cannot be resumed. ${errorDetail(error)}`,
        );
      }
      if (submissionState !== 'READY_FOR_REVIEW' && !submittedReviewStates.has(submissionState)) {
        throw new Error(
          `Review submission ${submissionId} cannot be resumed from state ${submissionState}`,
        );
      }
    } else {
      let readyIdsBeforeCreate: string[];
      try {
        const beforeCreate = await listReadyReviewSubmissions(client, args.appId, args.platform);
        const beforeIds: string[] = (Array.isArray(beforeCreate.data) ? beforeCreate.data : [])
          .map((resource: any) => resource.id)
          .filter((id: unknown): id is string => typeof id === 'string');
        readyIdsBeforeCreate = [...new Set<string>(beforeIds)];
      } catch (error) {
        throw new Error(
          `Cannot safely create a review submission for app ${args.appId}, platform ${args.platform}: READY_FOR_REVIEW preflight failed; no submission was created. ${errorDetail(error)}`,
        );
      }

      if (readyIdsBeforeCreate.length > 1) {
        throw new Error(
          `Multiple READY_FOR_REVIEW submissions exist for app ${args.appId}, platform ${args.platform}: ${readyIdsBeforeCreate.join(', ')}. Retry with an explicit submissionId`,
        );
      }

      if (readyIdsBeforeCreate.length === 1) {
        [submissionId] = readyIdsBeforeCreate;
        selectedFromPreflight = true;
        try {
          const existingSubmission = await getReviewSubmission(client, submissionId);
          submissionState = assertReviewSubmissionContext(
            existingSubmission,
            submissionId,
            args.appId,
            args.platform,
          );
        } catch (error) {
          throw new Error(
            `Review submission ${submissionId} was found during preflight but could not be resumed. ${errorDetail(error)}`,
          );
        }
        if (submissionState !== 'READY_FOR_REVIEW') {
          throw new Error(
            `Review submission ${submissionId} changed to state ${submissionState} during preflight; retry after checking its status`,
          );
        }
      } else {
        try {
          const submission = await client.request('/reviewSubmissions', {
            method: 'POST',
            body: {
              data: {
                type: 'reviewSubmissions',
                attributes: { platform: args.platform },
                relationships: {
                  app: { data: { type: 'apps', id: args.appId } },
                },
              },
            },
          });
          const createdId = submission.data?.id;
          if (typeof createdId !== 'string' || createdId.length === 0) {
            throw new Error('Apple create response did not include a review submission ID');
          }
          submissionId = createdId;
          createdThisCall = true;
        } catch (createError) {
          let candidates: string[] = [];
          if (!isDefinitiveAppleMutationError(createError)) {
            try {
              const afterCreate = await listReadyReviewSubmissions(
                client,
                args.appId,
                args.platform,
              );
              const afterIds: string[] = (
                Array.isArray(afterCreate.data) ? afterCreate.data : []
              )
                .map((resource: any) => resource.id)
                .filter((id: unknown): id is string => typeof id === 'string');
              candidates = [...new Set<string>(afterIds)];
            } catch {
              candidates = [];
            }
          }

          if (candidates.length > 0) {
            throw new Error(
              `Review submission creation outcome is ambiguous for app ${args.appId}, platform ${args.platform}; READY_FOR_REVIEW candidate IDs: ${candidates.join(', ')}. No item was attached. Retry with an explicit submissionId after verifying the candidate. ${errorDetail(createError)}`,
            );
          }
          throw new Error(
            `Review submission creation failed for app ${args.appId}, platform ${args.platform}; no submission ID could be identified safely. ${errorDetail(createError)}`,
          );
        }
      }
    }

    if (!submissionId) {
      throw new Error(
        `Review submission creation failed for app ${args.appId}, platform ${args.platform}; no submission ID was returned`,
      );
    }
    if (selectedFromPreflight) {
      throw new Error(
        `READY_FOR_REVIEW submission ${submissionId} already exists for app ${args.appId}, platform ${args.platform}. No item was attached or submitted; retry with submissionId=${submissionId} to explicitly resume it`,
      );
    }

    let itemsBeforeAttach: any;
    try {
      itemsBeforeAttach = await getReviewSubmissionItems(client, submissionId);
    } catch (error) {
      throw new Error(
        `Unable to inspect items for review submission ${submissionId}; no attach was attempted. ${submissionRetryHint(submissionId)} ${errorDetail(error)}`,
      );
    }

    const attachedVersionIds = attachedAppStoreVersionIds(itemsBeforeAttach);
    let versionAttached = attachedVersionIds.includes(args.versionId);
    if (!versionAttached && attachedVersionIds.length > 0) {
      throw new Error(
        `Review submission ${submissionId} already contains App Store version ${attachedVersionIds.join(', ')} instead of ${args.versionId}; submission was retained`,
      );
    }

    if (submittedReviewStates.has(submissionState)) {
      if (!versionAttached) {
        throw new Error(
          `Review submission ${submissionId} is already in state ${submissionState} but does not contain App Store version ${args.versionId}`,
        );
      }
      return {
        success: true,
        reconciled: true,
        submissionId,
        state: submissionState,
      };
    }

    if (!versionAttached) {
      try {
        await client.request('/reviewSubmissionItems', {
          method: 'POST',
          body: {
            data: {
              type: 'reviewSubmissionItems',
              relationships: {
                reviewSubmission: {
                  data: { type: 'reviewSubmissions', id: submissionId },
                },
                appStoreVersion: {
                  data: { type: 'appStoreVersions', id: args.versionId },
                },
              },
            },
          },
        });
        versionAttached = true;
      } catch (attachError) {
        let attachedAfterError = false;
        let itemCheckError: unknown;
        try {
          const itemsAfterError = await getReviewSubmissionItems(client, submissionId);
          attachedAfterError = attachedAppStoreVersionIds(itemsAfterError)
            .includes(args.versionId);
        } catch (error) {
          itemCheckError = error;
        }

        if (attachedAfterError) {
          versionAttached = true;
        } else if (isDefinitiveAppleMutationError(attachError)) {
          const cleanupResult = createdThisCall
            ? await cancelReviewSubmissionBestEffort(client, submissionId)
            : 'resumed submission retained';
          throw new Error(
            `Review submission ${submissionId} item attach was rejected; ${cleanupResult}. ${errorDetail(attachError)}${exportComplianceHint(attachError)}`,
          );
        } else {
          const checkDetail = itemCheckError
            ? ` Item reconciliation failed: ${errorDetail(itemCheckError)}.`
            : ' The version item was not visible after the error.';
          throw new Error(
            `Review submission ${submissionId} item attach outcome is ambiguous.${checkDetail} ${submissionRetryHint(submissionId)}${exportComplianceHint(attachError)} Initial error: ${errorDetail(attachError)}`,
          );
        }
      }
    }

    if (!versionAttached) {
      throw new Error(
        `Review submission ${submissionId} does not contain App Store version ${args.versionId}; ${submissionRetryHint(submissionId)}`,
      );
    }

    try {
      return await client.request(`/reviewSubmissions/${submissionId}`, {
        method: 'PATCH',
        body: {
          data: {
            type: 'reviewSubmissions',
            id: submissionId,
            attributes: { submitted: true },
          },
        },
      });
    } catch (submitError) {
      let currentSubmission: any;
      try {
        currentSubmission = await getReviewSubmission(client, submissionId);
      } catch (statusError) {
        throw new Error(
          `Review submission ${submissionId} submit outcome is ambiguous and status could not be read; submission was retained. ${submissionRetryHint(submissionId)} Initial error: ${errorDetail(submitError)}. Status error: ${errorDetail(statusError)}`,
        );
      }

      let currentState: string;
      try {
        currentState = assertReviewSubmissionContext(
          currentSubmission,
          submissionId,
          args.appId,
          args.platform,
        );
      } catch (contextError) {
        throw new Error(
          `Review submission ${submissionId} submit outcome could not be reconciled; submission was retained. ${errorDetail(contextError)}`,
        );
      }
      if (submittedReviewStates.has(currentState)) {
        return {
          ...currentSubmission,
          success: true,
          reconciled: true,
          submissionId,
        };
      }
      if (currentState === 'READY_FOR_REVIEW') {
        throw new Error(
          `Review submission ${submissionId} remains READY_FOR_REVIEW after the submit error. ${submissionRetryHint(submissionId)} ${errorDetail(submitError)}`,
        );
      }
      throw new Error(
        `Review submission ${submissionId} submit failed and is now in state ${currentState}; submission was retained. ${errorDetail(submitError)}`,
      );
    }
  },
};

const cancelSubmission: ToolDef = {
  name: 'apple_cancel_submission',
  description:
    'Cancel an in-review submission (if still possible). Operates on the reviewSubmissions resource created by apple_submit_for_review — sets attributes.canceled=true via PATCH. The legacy appStoreVersionSubmissions DELETE endpoint only applied to submissions created through the retired create-submission flow and does not accept reviewSubmissions IDs.',
  schema: z.object({
    submissionId: z.string().describe('Review Submission ID (the ID returned by apple_submit_for_review)'),
  }),
  handler: async (client, args) => {
    return client.request(`/reviewSubmissions/${args.submissionId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'reviewSubmissions',
          id: args.submissionId,
          attributes: { canceled: true },
        },
      },
    });
  },
};

const releaseVersion: ToolDef = {
  name: 'apple_release_version',
  description:
    'Irreversibly request release of an approved version that is in PENDING_DEVELOPER_RELEASE',
  schema: z.object({
    versionId: z.string().min(1).describe('Approved App Store Version ID'),
  }),
  handler: async (client, args) => {
    return client.request('/appStoreVersionReleaseRequests', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreVersionReleaseRequests',
          relationships: {
            appStoreVersion: {
              data: { type: 'appStoreVersions', id: args.versionId },
            },
          },
        },
      },
    });
  },
};

const getPhasedRelease: ToolDef = {
  name: 'apple_get_phased_release',
  description: 'Get phased-release status and progress for an App Store version',
  schema: z.object({
    versionId: z.string().min(1).describe('App Store Version ID'),
  }),
  handler: async (client, args) => {
    return client.request(
      `/appStoreVersions/${args.versionId}/appStoreVersionPhasedRelease`,
    );
  },
};

const createPhasedRelease: ToolDef = {
  name: 'apple_create_phased_release',
  description:
    'Enable a seven-day phased release for an app update; phased release is unavailable for an app\'s first version',
  schema: z.object({
    versionId: z.string().min(1).describe('App Store Version ID for an update'),
    state: z.enum(['INACTIVE', 'ACTIVE']).default('INACTIVE'),
  }),
  handler: async (client, args) => {
    return client.request('/appStoreVersionPhasedReleases', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreVersionPhasedReleases',
          attributes: { phasedReleaseState: args.state },
          relationships: {
            appStoreVersion: {
              data: { type: 'appStoreVersions', id: args.versionId },
            },
          },
        },
      },
    });
  },
};

const updatePhasedRelease: ToolDef = {
  name: 'apple_update_phased_release',
  description:
    'Pause, resume, or complete an existing phased release; COMPLETE immediately releases the update to all users',
  schema: z.object({
    phasedReleaseId: z.string().min(1).describe('App Store Version Phased Release ID'),
    state: z.enum(['ACTIVE', 'PAUSED', 'COMPLETE']),
  }),
  handler: async (client, args) => {
    return client.request(`/appStoreVersionPhasedReleases/${args.phasedReleaseId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appStoreVersionPhasedReleases',
          id: args.phasedReleaseId,
          attributes: { phasedReleaseState: args.state },
        },
      },
    });
  },
};

const deletePhasedRelease: ToolDef = {
  name: 'apple_delete_phased_release',
  description: 'Cancel a phased release configuration before the phased release has started',
  schema: z.object({
    phasedReleaseId: z.string().min(1).describe('Inactive App Store Version Phased Release ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/appStoreVersionPhasedReleases/${args.phasedReleaseId}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 8. Pricing & Availability
// ═══════════════════════════════════════════

const getAppPricing: ToolDef = {
  name: 'apple_get_pricing',
  description: 'Get the app price schedule plus complete, fully paginated manual and automatic price collections',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    const schedule = await client.request(`/apps/${args.appId}/appPriceSchedule`, {
      params: { include: 'baseTerritory' },
    });
    const scheduleId = schedule.data?.id;
    if (typeof scheduleId !== 'string' || scheduleId.length === 0) {
      throw new Error('App Store Connect returned a price schedule without an ID');
    }
    const collectionParams = {
      include: 'appPricePoint,territory',
      limit: '200',
    };
    const [manualPrices, automaticPrices] = await Promise.all([
      getAllApplePages(
        client,
        `/appPriceSchedules/${scheduleId}/manualPrices`,
        collectionParams,
      ),
      getAllApplePages(
        client,
        `/appPriceSchedules/${scheduleId}/automaticPrices`,
        collectionParams,
      ),
    ]);
    return { schedule, manualPrices, automaticPrices };
  },
};

const listAppPricePoints: ToolDef = {
  name: 'apple_list_app_price_points',
  description: 'List current App Price Points for an app in a base territory; use an ID from this response with apple_set_price',
  schema: z.object({
    appId: z.string().describe('App ID'),
    territoryId: z.string().describe('Territory ID used as the base territory, e.g. USA'),
    limit: z.number().int().min(1).max(200).optional().default(200),
  }),
  handler: async (client, args) => {
    return client.request(`/apps/${args.appId}/appPricePoints`, {
      params: {
        'filter[territory]': args.territoryId,
        include: 'territory',
        limit: String(args.limit),
      },
    });
  },
};

const setAppPrice: ToolDef = {
  name: 'apple_set_price',
  description: 'Replace the complete manual app price schedule. Call apple_get_pricing first and include every current and future manual price entry that must be preserved.',
  schema: z.object({
    appId: z.string().describe('App ID'),
    baseTerritoryId: z.string().describe('Base territory ID for that price point, e.g. USA'),
    manualPrices: z.array(z.object({
      appPricePointId: z.string().min(1).describe('App Price Point ID returned by apple_list_app_price_points'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Start date in YYYY-MM-DD, or null for the current entry'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('End date in YYYY-MM-DD, or null for an open-ended entry'),
    })).min(1).describe('Complete desired manual schedule, including existing entries that must remain'),
  }),
  handler: async (client, args) => {
    const prices = args.manualPrices.map((price: any, index: number) => ({
      id: '${newprice-' + index + '}',
      appPricePointId: price.appPricePointId,
      startDate: price.startDate ?? null,
      endDate: price.endDate ?? null,
    }));
    return client.request('/appPriceSchedules', {
      method: 'POST',
      body: {
        data: {
          type: 'appPriceSchedules',
          attributes: {},
          relationships: {
            app: { data: { type: 'apps', id: args.appId } },
            baseTerritory: {
              data: { type: 'territories', id: args.baseTerritoryId },
            },
            manualPrices: {
              data: prices.map((price: any) => ({ type: 'appPrices', id: price.id })),
            },
          },
        },
        included: prices.map((price: any) => ({
            type: 'appPrices',
            id: price.id,
            attributes: {
              startDate: price.startDate,
              endDate: price.endDate,
            },
            relationships: {
              appPricePoint: {
                data: { type: 'appPricePoints', id: price.appPricePointId },
              },
            },
          })),
      },
    });
  },
};

const listTerritoryAvailability: ToolDef = {
  name: 'apple_list_availability',
  description: 'List current App Availability and all related territory availability records',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    const availability: any = await client.request(`/apps/${args.appId}/appAvailabilityV2`);
    const availabilityId = availability.data?.id;
    if (!availabilityId) {
      throw new Error('Apple API response did not include an App Availability ID');
    }

    const relatedUrl = availability.data?.relationships?.territoryAvailabilities?.links?.related;
    const territoryAvailabilities = await client.request(
      relatedUrl ?? `/v2/appAvailabilities/${availabilityId}/territoryAvailabilities`,
      {
        params: {
          include: 'territory',
          limit: '200',
        },
      },
    );

    return {
      appAvailability: availability.data,
      territoryAvailabilities,
    };
  },
};

const availabilityTerritoryInput = z.object({
  territoryId: z.string().min(1).describe('App Store territory ID, e.g. USA or KOR'),
  available: z.boolean().default(true),
  releaseDate: calendarDateSchema.nullable().optional(),
  preOrderEnabled: z.boolean().default(false),
});

const createAvailability: ToolDef = {
  name: 'apple_create_availability',
  description:
    'Create initial app availability with explicit territory settings; use available=true and preOrderEnabled=false for a normal release',
  schema: z.object({
    appId: z.string().min(1).describe('App ID'),
    availableInNewTerritories: z.boolean().default(true),
    territories: z.array(availabilityTerritoryInput).min(1)
      .describe('Initial availability settings for each selected territory'),
  }),
  handler: async (client, args) => {
    const seenTerritories = new Set<string>();
    const territories = args.territories.map((territory: any, index: number) => {
      validateCalendarDate(territory.releaseDate, 'releaseDate');
      if (territory.preOrderEnabled === true && typeof territory.releaseDate !== 'string') {
        throw new Error('preOrderEnabled=true requires a non-null releaseDate');
      }
      if (seenTerritories.has(territory.territoryId)) {
        throw new Error(`Duplicate Apple territory ID: ${territory.territoryId}`);
      }
      seenTerritories.add(territory.territoryId);
      return {
        ...territory,
        inlineId: '${territoryAvailability-' + index + '}',
      };
    });

    return client.request('/v2/appAvailabilities', {
      method: 'POST',
      body: {
        data: {
          type: 'appAvailabilities',
          attributes: {
            availableInNewTerritories: args.availableInNewTerritories,
          },
          relationships: {
            app: { data: { type: 'apps', id: args.appId } },
            territoryAvailabilities: {
              data: territories.map((territory: any) => ({
                type: 'territoryAvailabilities',
                id: territory.inlineId,
              })),
            },
          },
        },
        included: territories.map((territory: any) => ({
          type: 'territoryAvailabilities',
          id: territory.inlineId,
          attributes: {
            available: territory.available,
            preOrderEnabled: territory.preOrderEnabled,
            ...(territory.releaseDate !== undefined
              ? { releaseDate: territory.releaseDate }
              : {}),
          },
          relationships: {
            territory: {
              data: { type: 'territories', id: territory.territoryId },
            },
          },
        })),
      },
    });
  },
};

const updateTerritoryAvailability: ToolDef = {
  name: 'apple_update_territory_availability',
  description:
    'Change availability, release date, or pre-order state for one existing territory availability record returned by apple_list_availability',
  schema: z.object({
    territoryAvailabilityId: z.string().min(1)
      .describe('Territory Availability resource ID, not the territory code'),
    available: z.boolean().nullable().optional(),
    releaseDate: calendarDateSchema.nullable().optional(),
    preOrderEnabled: z.boolean().nullable().optional(),
  }),
  handler: async (client, args) => {
    validateCalendarDate(args.releaseDate, 'releaseDate');
    if (args.preOrderEnabled === true && args.releaseDate === null) {
      throw new Error('preOrderEnabled=true cannot be combined with releaseDate=null');
    }
    const { territoryAvailabilityId, ...values } = args;
    const attributes = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(attributes).length === 0) {
      throw new Error('At least one territory availability attribute must be provided');
    }

    return client.request(`/territoryAvailabilities/${territoryAvailabilityId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'territoryAvailabilities',
          id: territoryAvailabilityId,
          attributes,
        },
      },
    });
  },
};

// ═══════════════════════════════════════════
// 9. Customer Reviews
// ═══════════════════════════════════════════

const listCustomerReviews: ToolDef = {
  name: 'apple_list_reviews',
  description: 'List customer reviews for an app',
  schema: z.object({
    appId: z.string().describe('App ID'),
    sort: z.enum(['createdDate', '-createdDate', 'rating', '-rating']).optional(),
    limit: z.number().optional(),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.sort) params['sort'] = args.sort;
    if (args.limit) params['limit'] = String(args.limit);
    return client.request(`/apps/${args.appId}/customerReviews`, { params });
  },
};

const respondToReview: ToolDef = {
  name: 'apple_respond_to_review',
  description: 'Respond to a customer review',
  schema: z.object({
    reviewId: z.string().describe('Customer Review ID'),
    responseBody: z.string().describe('Response text'),
  }),
  handler: async (client, args) => {
    return client.request('/customerReviewResponses', {
      method: 'POST',
      body: {
        data: {
          type: 'customerReviewResponses',
          attributes: { responseBody: args.responseBody },
          relationships: {
            review: {
              data: { type: 'customerReviews', id: args.reviewId },
            },
          },
        },
      },
    });
  },
};

// ═══════════════════════════════════════════
// 10. App Info Localizations
// ═══════════════════════════════════════════

const listAppInfoLocalizations: ToolDef = {
  name: 'apple_list_app_info_localizations',
  description: 'List app info localizations (app name, subtitle, privacy policy URL)',
  schema: z.object({
    appInfoId: z.string().describe('AppInfo ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/appInfos/${args.appInfoId}/appInfoLocalizations`);
  },
};

const updateAppInfoLocalization: ToolDef = {
  name: 'apple_update_app_info_localization',
  description: 'Update app name, subtitle, or privacy policy URL for a locale',
  schema: z.object({
    localizationId: z.string().describe('AppInfo Localization ID'),
    name: z.string().optional().describe('App name'),
    subtitle: z.string().optional().describe('App subtitle'),
    privacyPolicyUrl: z.string().optional(),
    privacyPolicyText: z.string().optional(),
  }),
  handler: async (client, args) => {
    const { localizationId, ...attributes } = args;
    return client.request(`/appInfoLocalizations/${localizationId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appInfoLocalizations',
          id: localizationId,
          attributes,
        },
      },
    });
  },
};

// ═══════════════════════════════════════════
// 11. Bundle ID Capabilities
// ═══════════════════════════════════════════

const listBundleIdCapabilities: ToolDef = {
  name: 'apple_list_bundle_id_capabilities',
  description: 'List capabilities for a bundle ID',
  schema: z.object({
    bundleIdId: z.string().describe('Bundle ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/bundleIds/${args.bundleIdId}/bundleIdCapabilities`);
  },
};

const enableCapability: ToolDef = {
  name: 'apple_enable_capability',
  description: 'Enable a capability on a bundle ID',
  schema: z.object({
    bundleIdId: z.string().describe('Bundle ID'),
    capabilityType: z.string().describe('Capability type (e.g. ICLOUD, PUSH_NOTIFICATIONS, IN_APP_PURCHASE, GAME_CENTER, WALLET, MAPS, ASSOCIATED_DOMAINS, PERSONAL_VPN, APP_GROUPS, HEALTHKIT, HOMEKIT, WIRELESS_ACCESSORY_CONFIGURATION, APPLE_PAY, DATA_PROTECTION, SIRIKIT, NETWORK_EXTENSIONS, MULTIPATH, HOT_SPOT, NFC_TAG_READING, CLASSKIT, AUTOFILL_CREDENTIAL_PROVIDER, ACCESS_WIFI_INFORMATION, NETWORK_CUSTOM_PROTOCOL, COREMEDIA_HLS_LOW_LATENCY, SYSTEM_EXTENSION_INSTALL, USER_MANAGEMENT, SIGN_IN_WITH_APPLE)'),
    settings: z.array(z.any()).optional().describe('Capability-specific settings'),
  }),
  handler: async (client, args) => {
    const body: any = {
      data: {
        type: 'bundleIdCapabilities',
        attributes: { capabilityType: args.capabilityType },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: args.bundleIdId } },
        },
      },
    };
    if (args.settings) {
      body.data.attributes.settings = args.settings;
    }
    return client.request('/bundleIdCapabilities', { method: 'POST', body });
  },
};

const disableCapability: ToolDef = {
  name: 'apple_disable_capability',
  description: 'Disable a capability on a bundle ID',
  schema: z.object({
    capabilityId: z.string().describe('Bundle ID Capability ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/bundleIdCapabilities/${args.capabilityId}`, { method: 'DELETE' });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 12. Certificates
// ═══════════════════════════════════════════

const listCertificates: ToolDef = {
  name: 'apple_list_certificates',
  description: 'List certificates',
  schema: z.object({
    certificateType: z.string().optional().describe('Filter by certificate type (e.g. IOS_DEVELOPMENT, IOS_DISTRIBUTION, MAC_APP_DISTRIBUTION, MAC_INSTALLER_DISTRIBUTION, MAC_APP_DEVELOPMENT, DEVELOPER_ID_KEXT, DEVELOPER_ID_APPLICATION, DEVELOPER_ID_INSTALLER)'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.certificateType) params['filter[certificateType]'] = args.certificateType;
    return client.request('/certificates', { params });
  },
};

const createCertificate: ToolDef = {
  name: 'apple_create_certificate',
  description: 'Create a certificate',
  schema: z.object({
    csrContent: z.string().describe('Certificate Signing Request (CSR) content'),
    certificateType: z.string().describe('Certificate type (e.g. IOS_DEVELOPMENT, IOS_DISTRIBUTION, MAC_APP_DISTRIBUTION, DEVELOPER_ID_APPLICATION)'),
  }),
  handler: async (client, args) => {
    return client.request('/certificates', {
      method: 'POST',
      body: {
        data: {
          type: 'certificates',
          attributes: {
            csrContent: args.csrContent,
            certificateType: args.certificateType,
          },
        },
      },
    });
  },
};

const revokeCertificate: ToolDef = {
  name: 'apple_revoke_certificate',
  description: 'Revoke a certificate',
  schema: z.object({
    certificateId: z.string().describe('Certificate ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/certificates/${args.certificateId}`, { method: 'DELETE' });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 13. Provisioning Profiles
// ═══════════════════════════════════════════

const listProfiles: ToolDef = {
  name: 'apple_list_profiles',
  description: 'List provisioning profiles',
  schema: z.object({
    profileType: z.string().optional().describe('Filter by profile type (e.g. IOS_APP_DEVELOPMENT, IOS_APP_STORE, IOS_APP_ADHOC, IOS_APP_INHOUSE, MAC_APP_DEVELOPMENT, MAC_APP_STORE, MAC_APP_DIRECT, TVOS_APP_DEVELOPMENT, TVOS_APP_STORE, TVOS_APP_ADHOC, TVOS_APP_INHOUSE, MAC_CATALYST_APP_DEVELOPMENT, MAC_CATALYST_APP_STORE, MAC_CATALYST_APP_DIRECT)'),
    name: z.string().optional().describe('Filter by profile name'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.profileType) params['filter[profileType]'] = args.profileType;
    if (args.name) params['filter[name]'] = args.name;
    return client.request('/profiles', { params });
  },
};

const createProfile: ToolDef = {
  name: 'apple_create_profile',
  description: 'Create a provisioning profile',
  schema: z.object({
    name: z.string().describe('Profile name'),
    profileType: z.string().describe('Profile type (e.g. IOS_APP_DEVELOPMENT, IOS_APP_STORE)'),
    bundleIdId: z.string().describe('Bundle ID'),
    certificateIds: z.array(z.string()).describe('Array of certificate IDs'),
    deviceIds: z.array(z.string()).optional().describe('Array of device IDs (required for development profiles)'),
  }),
  handler: async (client, args) => {
    const relationships: any = {
      bundleId: { data: { type: 'bundleIds', id: args.bundleIdId } },
      certificates: { data: args.certificateIds.map((id: string) => ({ type: 'certificates', id })) },
    };
    if (args.deviceIds && args.deviceIds.length > 0) {
      relationships.devices = { data: args.deviceIds.map((id: string) => ({ type: 'devices', id })) };
    }
    return client.request('/profiles', {
      method: 'POST',
      body: {
        data: {
          type: 'profiles',
          attributes: {
            name: args.name,
            profileType: args.profileType,
          },
          relationships,
        },
      },
    });
  },
};

const deleteProfile: ToolDef = {
  name: 'apple_delete_profile',
  description: 'Delete a provisioning profile',
  schema: z.object({
    profileId: z.string().describe('Profile ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/profiles/${args.profileId}`, { method: 'DELETE' });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 14. Devices
// ═══════════════════════════════════════════

const listDevices: ToolDef = {
  name: 'apple_list_devices',
  description: 'List registered devices',
  schema: z.object({
    platform: z.enum(['IOS', 'MAC_OS']).optional().describe('Filter by platform'),
    status: z.enum(['ENABLED', 'DISABLED']).optional().describe('Filter by status'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.platform) params['filter[platform]'] = args.platform;
    if (args.status) params['filter[status]'] = args.status;
    return client.request('/devices', { params });
  },
};

const registerDevice: ToolDef = {
  name: 'apple_register_device',
  description: 'Register a new device',
  schema: z.object({
    name: z.string().describe('Device name'),
    platform: z.enum(['IOS', 'MAC_OS']).describe('Platform'),
    udid: z.string().describe('Device UDID'),
  }),
  handler: async (client, args) => {
    return client.request('/devices', {
      method: 'POST',
      body: {
        data: {
          type: 'devices',
          attributes: {
            name: args.name,
            platform: args.platform,
            udid: args.udid,
          },
        },
      },
    });
  },
};

const updateDevice: ToolDef = {
  name: 'apple_update_device',
  description: 'Update device name or status',
  schema: z.object({
    deviceId: z.string().describe('Device ID'),
    name: z.string().optional().describe('New device name'),
    status: z.enum(['ENABLED', 'DISABLED']).optional().describe('New status'),
  }),
  handler: async (client, args) => {
    const { deviceId, ...attributes } = args;
    return client.request(`/devices/${deviceId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'devices',
          id: deviceId,
          attributes,
        },
      },
    });
  },
};

// ═══════════════════════════════════════════
// 15. TestFlight - Beta Groups
// ═══════════════════════════════════════════

const listBetaGroups: ToolDef = {
  name: 'apple_list_beta_groups',
  description: 'List beta groups',
  schema: z.object({
    appId: z.string().optional().describe('Filter by app ID'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.appId) params['filter[app]'] = args.appId;
    return client.request('/betaGroups', { params });
  },
};

const createBetaGroup: ToolDef = {
  name: 'apple_create_beta_group',
  description: 'Create a beta group',
  schema: z.object({
    appId: z.string().describe('App ID'),
    name: z.string().describe('Group name'),
    isInternalGroup: z.boolean().optional().describe('Internal group for App Store Connect team members'),
    hasAccessToAllBuilds: z.boolean().optional().describe('Auto-enable all new builds'),
    publicLinkEnabled: z.boolean().optional().describe('Enable public TestFlight link'),
    publicLinkLimit: z.number().optional().describe('Max testers via public link'),
    feedbackEnabled: z.boolean().optional().describe('Enable feedback'),
  }),
  handler: async (client, args) => {
    const { appId, ...attributes } = args;
    return client.request('/betaGroups', {
      method: 'POST',
      body: {
        data: {
          type: 'betaGroups',
          attributes,
          relationships: {
            app: { data: { type: 'apps', id: appId } },
          },
        },
      },
    });
  },
};

const deleteBetaGroup: ToolDef = {
  name: 'apple_delete_beta_group',
  description: 'Delete a beta group',
  schema: z.object({
    betaGroupId: z.string().describe('Beta Group ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/betaGroups/${args.betaGroupId}`, { method: 'DELETE' });
    return { success: true };
  },
};

const addBetaTestersToGroup: ToolDef = {
  name: 'apple_add_beta_testers_to_group',
  description: 'Add beta testers to a group',
  schema: z.object({
    betaGroupId: z.string().describe('Beta Group ID'),
    betaTesterIds: z.array(z.string()).describe('Array of beta tester IDs'),
  }),
  handler: async (client, args) => {
    return client.request(`/betaGroups/${args.betaGroupId}/relationships/betaTesters`, {
      method: 'POST',
      body: {
        data: args.betaTesterIds.map((id: string) => ({ type: 'betaTesters', id })),
      },
    });
  },
};

const removeBetaTestersFromGroup: ToolDef = {
  name: 'apple_remove_beta_testers_from_group',
  description: 'Remove beta testers from a group',
  schema: z.object({
    betaGroupId: z.string().describe('Beta Group ID'),
    betaTesterIds: z.array(z.string()).describe('Array of beta tester IDs'),
  }),
  handler: async (client, args) => {
    return client.request(`/betaGroups/${args.betaGroupId}/relationships/betaTesters`, {
      method: 'DELETE',
      body: {
        data: args.betaTesterIds.map((id: string) => ({ type: 'betaTesters', id })),
      },
    });
  },
};

// ═══════════════════════════════════════════
// 16. TestFlight - Beta Testers
// ═══════════════════════════════════════════

const listBetaTesters: ToolDef = {
  name: 'apple_list_beta_testers',
  description: 'List beta testers',
  schema: z.object({
    email: z.string().optional().describe('Filter by email'),
    appId: z.string().optional().describe('Filter by app ID'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.email) params['filter[email]'] = args.email;
    if (args.appId) params['filter[app]'] = args.appId;
    return client.request('/betaTesters', { params });
  },
};

const inviteBetaTester: ToolDef = {
  name: 'apple_invite_beta_tester',
  description: 'Invite a beta tester',
  schema: z.object({
    email: z.string().describe('Tester email'),
    firstName: z.string().optional().describe('First name'),
    lastName: z.string().optional().describe('Last name'),
    betaGroupIds: z.array(z.string()).describe('Array of beta group IDs'),
  }),
  handler: async (client, args) => {
    const { betaGroupIds, ...attributes } = args;
    return client.request('/betaTesters', {
      method: 'POST',
      body: {
        data: {
          type: 'betaTesters',
          attributes,
          relationships: {
            betaGroups: { data: betaGroupIds.map((id: string) => ({ type: 'betaGroups', id })) },
          },
        },
      },
    });
  },
};

const deleteBetaTester: ToolDef = {
  name: 'apple_delete_beta_tester',
  description: 'Delete a beta tester',
  schema: z.object({
    betaTesterId: z.string().describe('Beta Tester ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/betaTesters/${args.betaTesterId}`, { method: 'DELETE' });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 17. In-App Purchases
// ═══════════════════════════════════════════

const V2_BASE = 'https://api.appstoreconnect.apple.com/v2';

const listIAP: ToolDef = {
  name: 'apple_list_iap',
  description: 'List in-app purchases for an app',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/apps/${args.appId}/inAppPurchasesV2`);
  },
};

const createIAP: ToolDef = {
  name: 'apple_create_iap',
  description: 'Create an in-app purchase',
  schema: z.object({
    appId: z.string().describe('App ID'),
    name: z.string().describe('IAP name'),
    productId: z.string().describe('Product ID (e.g. com.example.app.coins100)'),
    inAppPurchaseType: z.enum(['CONSUMABLE', 'NON_CONSUMABLE', 'NON_RENEWING_SUBSCRIPTION']).describe('IAP type'),
  }),
  handler: async (client, args) => {
    const { appId, ...attributes } = args;
    return client.request(`${V2_BASE}/inAppPurchases`, {
      method: 'POST',
      body: {
        data: {
          type: 'inAppPurchases',
          attributes,
          relationships: {
            app: { data: { type: 'apps', id: appId } },
          },
        },
      },
    });
  },
};

const getIAP: ToolDef = {
  name: 'apple_get_iap',
  description: 'Get in-app purchase details',
  schema: z.object({
    iapId: z.string().describe('In-App Purchase ID'),
  }),
  handler: async (client, args) => {
    return client.request(`${V2_BASE}/inAppPurchases/${args.iapId}`);
  },
};

const deleteIAP: ToolDef = {
  name: 'apple_delete_iap',
  description: 'Delete an in-app purchase',
  schema: z.object({
    iapId: z.string().describe('In-App Purchase ID'),
  }),
  handler: async (client, args) => {
    await client.request(`${V2_BASE}/inAppPurchases/${args.iapId}`, { method: 'DELETE' });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 18. Subscription Groups
// ═══════════════════════════════════════════

const listSubscriptionGroups: ToolDef = {
  name: 'apple_list_subscription_groups',
  description: 'List subscription groups for an app',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/apps/${args.appId}/subscriptionGroups`);
  },
};

const createSubscriptionGroup: ToolDef = {
  name: 'apple_create_subscription_group',
  description: 'Create a subscription group',
  schema: z.object({
    appId: z.string().describe('App ID'),
    referenceName: z.string().describe('Reference name'),
  }),
  handler: async (client, args) => {
    const { appId, ...attributes } = args;
    return client.request('/subscriptionGroups', {
      method: 'POST',
      body: {
        data: {
          type: 'subscriptionGroups',
          attributes,
          relationships: {
            app: { data: { type: 'apps', id: appId } },
          },
        },
      },
    });
  },
};

const deleteSubscriptionGroup: ToolDef = {
  name: 'apple_delete_subscription_group',
  description: 'Delete a subscription group',
  schema: z.object({
    groupId: z.string().describe('Subscription Group ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/subscriptionGroups/${args.groupId}`, { method: 'DELETE' });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 19. Accessibility Declarations
// ═══════════════════════════════════════════

const accessibilityBooleanFields = {
  supportsAudioDescriptions: z.boolean().optional(),
  supportsCaptions: z.boolean().optional(),
  supportsDarkInterface: z.boolean().optional(),
  supportsDifferentiateWithoutColorAlone: z.boolean().optional(),
  supportsLargerText: z.boolean().optional(),
  supportsReducedMotion: z.boolean().optional(),
  supportsSufficientContrast: z.boolean().optional(),
  supportsVoiceControl: z.boolean().optional(),
  supportsVoiceover: z.boolean().optional(),
};

const listAccessibilityDeclarations: ToolDef = {
  name: 'apple_list_accessibility_declarations',
  description: 'List accessibility nutrition label declarations for an app, one per device family',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/apps/${args.appId}/accessibilityDeclarations`);
  },
};

const createAccessibilityDeclaration: ToolDef = {
  name: 'apple_create_accessibility_declaration',
  description:
    'Create an accessibility nutrition label declaration for an app on a specific device family (Accessibility Nutrition Labels)',
  schema: z.object({
    appId: z.string().describe('App ID'),
    deviceFamily: z.enum(['IPHONE', 'IPAD', 'APPLE_TV', 'APPLE_WATCH', 'MAC', 'VISION']).describe('Device family this declaration applies to'),
    ...accessibilityBooleanFields,
  }),
  handler: async (client, args) => {
    const { appId, ...attributes } = args;
    return client.request('/accessibilityDeclarations', {
      method: 'POST',
      body: {
        data: {
          type: 'accessibilityDeclarations',
          attributes,
          relationships: {
            app: { data: { type: 'apps', id: appId } },
          },
        },
      },
    });
  },
};

const updateAccessibilityDeclaration: ToolDef = {
  name: 'apple_update_accessibility_declaration',
  description: 'Update an existing accessibility nutrition label declaration',
  schema: z.object({
    declarationId: z.string().describe('Accessibility Declaration ID'),
    ...accessibilityBooleanFields,
  }),
  handler: async (client, args) => {
    const { declarationId, ...attributes } = args;
    return client.request(`/accessibilityDeclarations/${declarationId}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'accessibilityDeclarations',
          id: declarationId,
          attributes,
        },
      },
    });
  },
};

const deleteAccessibilityDeclaration: ToolDef = {
  name: 'apple_delete_accessibility_declaration',
  description: 'Delete an accessibility nutrition label declaration',
  schema: z.object({
    declarationId: z.string().describe('Accessibility Declaration ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/accessibilityDeclarations/${args.declarationId}`, { method: 'DELETE' });
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 20. Price Points (for offer code / win-back offer prices)
// ═══════════════════════════════════════════

const getSubscriptionPricePoints: ToolDef = {
  name: 'apple_get_subscription_price_points',
  description:
    'List available price points for a subscription, per territory. Use the returned IDs (with a territory ID) to build the prices for apple_create_subscription_offer_code.',
  schema: z.object({
    subscriptionId: z.string().describe('Subscription ID'),
    territoryFilter: z.string().optional().describe('Filter by territory ID, e.g. USA'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = { include: 'territory' };
    if (args.territoryFilter) params['filter[territory]'] = args.territoryFilter;
    return client.request(`/subscriptions/${args.subscriptionId}/pricePoints`, { params });
  },
};

const getIAPPricePoints: ToolDef = {
  name: 'apple_get_iap_price_points',
  description:
    'List available price points for an in-app purchase, per territory. Use the returned IDs (with a territory ID) to build the prices for apple_create_iap_offer_code.',
  schema: z.object({
    iapId: z.string().describe('In-App Purchase ID'),
    territoryFilter: z.string().optional().describe('Filter by territory ID, e.g. USA'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = { include: 'territory' };
    if (args.territoryFilter) params['filter[territory]'] = args.territoryFilter;
    return client.request(`${V2_BASE}/inAppPurchases/${args.iapId}/pricePoints`, { params });
  },
};

// ═══════════════════════════════════════════
// 21. Subscription & IAP Offer Codes
// ═══════════════════════════════════════════

const offerPriceEntry = z.object({
  territoryId: z.string().describe('Territory ID, e.g. USA'),
  pricePointId: z.string().describe('Price point ID from apple_get_subscription_price_points / apple_get_iap_price_points'),
});

const listSubscriptionOfferCodes: ToolDef = {
  name: 'apple_list_subscription_offer_codes',
  description: 'List custom/one-time-use offer codes configured for a subscription',
  schema: z.object({
    subscriptionId: z.string().describe('Subscription ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/subscriptions/${args.subscriptionId}/offerCodes`);
  },
};

const getSubscriptionOfferCode: ToolDef = {
  name: 'apple_get_subscription_offer_code',
  description: 'Get details of a subscription offer code',
  schema: z.object({
    offerCodeId: z.string().describe('Subscription Offer Code ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/subscriptionOfferCodes/${args.offerCodeId}`);
  },
};

const createSubscriptionOfferCode: ToolDef = {
  name: 'apple_create_subscription_offer_code',
  description:
    'Create a subscription offer code (custom or one-time-use codes distributed outside the App Store). Requires per-territory prices — look them up first with apple_get_subscription_price_points.',
  schema: z.object({
    subscriptionId: z.string().describe('Subscription ID'),
    name: z.string().describe('Internal reference name for the offer code'),
    customerEligibilities: z.array(z.enum(['NEW', 'EXISTING', 'EXPIRED'])).describe('Which customers are eligible'),
    offerEligibility: z.enum(['STACK_WITH_INTRO_OFFERS', 'REPLACE_INTRO_OFFERS']).describe('How this offer interacts with introductory offers'),
    duration: z.enum(['THREE_DAYS', 'ONE_WEEK', 'TWO_WEEKS', 'ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR']).describe('Billing period duration of the offer'),
    offerMode: z.enum(['PAY_AS_YOU_GO', 'PAY_UP_FRONT', 'FREE_TRIAL']).describe('Offer pricing mode'),
    numberOfPeriods: z.number().describe('Number of billing periods the offer applies for'),
    autoRenewEnabled: z.boolean().optional().describe('Whether the subscription auto-renews after the offer period'),
    prices: z.array(offerPriceEntry).describe('Per-territory prices for the offer'),
  }),
  handler: async (client, args) => {
    const { subscriptionId, prices, ...attributes } = args;
    return client.request('/subscriptionOfferCodes', {
      method: 'POST',
      body: {
        data: {
          type: 'subscriptionOfferCodes',
          attributes,
          relationships: {
            subscription: { data: { type: 'subscriptions', id: subscriptionId } },
            prices: {
              data: prices.map((p: z.infer<typeof offerPriceEntry>, i: number) => ({
                type: 'subscriptionOfferCodePrices',
                id: `price-${i}`,
              })),
            },
          },
        },
        included: prices.map((p: z.infer<typeof offerPriceEntry>, i: number) => ({
          type: 'subscriptionOfferCodePrices',
          id: `price-${i}`,
          relationships: {
            territory: { data: { type: 'territories', id: p.territoryId } },
            subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: p.pricePointId } },
          },
        })),
      },
    });
  },
};

const listIAPOfferCodes: ToolDef = {
  name: 'apple_list_iap_offer_codes',
  description: 'List custom/one-time-use offer codes configured for an in-app purchase',
  schema: z.object({
    iapId: z.string().describe('In-App Purchase ID'),
  }),
  handler: async (client, args) => {
    return client.request(`${V2_BASE}/inAppPurchases/${args.iapId}/offerCodes`);
  },
};

const getIAPOfferCode: ToolDef = {
  name: 'apple_get_iap_offer_code',
  description: 'Get details of an in-app purchase offer code',
  schema: z.object({
    offerCodeId: z.string().describe('In-App Purchase Offer Code ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/inAppPurchaseOfferCodes/${args.offerCodeId}`);
  },
};

const createIAPOfferCode: ToolDef = {
  name: 'apple_create_iap_offer_code',
  description:
    'Create an offer code for a consumable/non-consumable/non-renewing-subscription in-app purchase. Requires per-territory prices — look them up first with apple_get_iap_price_points.',
  schema: z.object({
    iapId: z.string().describe('In-App Purchase ID'),
    name: z.string().describe('Internal reference name for the offer code'),
    customerEligibilities: z.array(z.enum(['NON_SPENDER', 'ACTIVE_SPENDER', 'CHURNED_SPENDER'])).describe('Which customers are eligible'),
    prices: z.array(offerPriceEntry).describe('Per-territory prices for the offer'),
  }),
  handler: async (client, args) => {
    const { iapId, prices, ...attributes } = args;
    return client.request('/inAppPurchaseOfferCodes', {
      method: 'POST',
      body: {
        data: {
          type: 'inAppPurchaseOfferCodes',
          attributes,
          relationships: {
            inAppPurchase: { data: { type: 'inAppPurchases', id: iapId } },
            prices: {
              data: prices.map((p: z.infer<typeof offerPriceEntry>, i: number) => ({
                type: 'inAppPurchaseOfferPrices',
                id: `price-${i}`,
              })),
            },
          },
        },
        included: prices.map((p: z.infer<typeof offerPriceEntry>, i: number) => ({
          type: 'inAppPurchaseOfferPrices',
          id: `price-${i}`,
          relationships: {
            territory: { data: { type: 'territories', id: p.territoryId } },
            pricePoint: { data: { type: 'inAppPurchasePricePoints', id: p.pricePointId } },
          },
        })),
      },
    });
  },
};

// ═══════════════════════════════════════════
// 22. Win-Back Offers
// ═══════════════════════════════════════════

const listWinBackOffers: ToolDef = {
  name: 'apple_list_win_back_offers',
  description: 'List win-back offers configured for a subscription (offers to bring back churned/expired subscribers)',
  schema: z.object({
    subscriptionId: z.string().describe('Subscription ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/subscriptions/${args.subscriptionId}/winBackOffers`);
  },
};

const getWinBackOffer: ToolDef = {
  name: 'apple_get_win_back_offer',
  description: 'Get details of a win-back offer',
  schema: z.object({
    offerId: z.string().describe('Win-Back Offer ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/winBackOffers/${args.offerId}`);
  },
};

// ═══════════════════════════════════════════
// Export all tools
// ═══════════════════════════════════════════

export const appleTools: ToolDef[] = [
  // App Management
  listApps, getNextPage, getApp, updateApp, getAppInfo, updateAppInfoCategory,
  // Bundle IDs
  listBundleIds, createBundleId,
  // Versions & Localizations
  listVersions, createVersion, updateVersion,
  listVersionLocalizations, createVersionLocalization, updateVersionLocalization,
  // App Info Localizations (name, subtitle)
  listAppInfoLocalizations, updateAppInfoLocalization,
  // Screenshots
  listScreenshotSets, createScreenshotSet, uploadScreenshot, deleteScreenshot,
  // Builds
  listBuilds, getBuildUpload, deleteBuildUpload, waitForBuildUpload, uploadBuild,
  setBuildEncryption, assignBuild,
  // Age Rating & Review Info
  getAgeRating, updateAgeRating, updateReviewDetail,
  // Submission
  submitForReview, cancelSubmission, releaseVersion,
  getPhasedRelease, createPhasedRelease, updatePhasedRelease, deletePhasedRelease,
  // Pricing & Availability
  getAppPricing, listAppPricePoints, setAppPrice, listTerritoryAvailability,
  createAvailability, updateTerritoryAvailability,
  // Customer Reviews
  listCustomerReviews, respondToReview,
  // Bundle ID Capabilities
  listBundleIdCapabilities, enableCapability, disableCapability,
  // Certificates
  listCertificates, createCertificate, revokeCertificate,
  // Provisioning Profiles
  listProfiles, createProfile, deleteProfile,
  // Devices
  listDevices, registerDevice, updateDevice,
  // TestFlight - Beta Groups
  listBetaGroups, createBetaGroup, deleteBetaGroup,
  addBetaTestersToGroup, removeBetaTestersFromGroup,
  // TestFlight - Beta Testers
  listBetaTesters, inviteBetaTester, deleteBetaTester,
  // In-App Purchases
  listIAP, createIAP, getIAP, deleteIAP,
  // Subscription Groups
  listSubscriptionGroups, createSubscriptionGroup, deleteSubscriptionGroup,
  // Accessibility Declarations
  listAccessibilityDeclarations, createAccessibilityDeclaration, updateAccessibilityDeclaration, deleteAccessibilityDeclaration,
  // Price Points
  getSubscriptionPricePoints, getIAPPricePoints,
  // Offer Codes
  listSubscriptionOfferCodes, getSubscriptionOfferCode, createSubscriptionOfferCode,
  listIAPOfferCodes, getIAPOfferCode, createIAPOfferCode,
  // Win-Back Offers
  listWinBackOffers, getWinBackOffer,
];

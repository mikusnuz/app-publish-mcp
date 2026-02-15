import { z } from 'zod';
import { AppleClient } from './client.js';

// Helper to define a tool
interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  handler: (client: AppleClient, args: any) => Promise<any>;
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
    state: z.string().optional().describe('Filter by state (e.g. PREPARE_FOR_SUBMISSION, READY_FOR_SALE)'),
  }),
  handler: async (client, args) => {
    const params: Record<string, string> = {};
    if (args.platform) params['filter[platform]'] = args.platform;
    if (args.state) params['filter[appStoreState]'] = args.state;
    return client.request(`/apps/${args.appId}/appStoreVersions`, { params });
  },
};

const createVersion: ToolDef = {
  name: 'apple_create_version',
  description: 'Create a new App Store version for submission',
  schema: z.object({
    appId: z.string().describe('App ID'),
    versionString: z.string().describe('Version (e.g. 1.0.0)'),
    platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).default('IOS'),
    releaseType: z.enum(['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED']).optional(),
    earliestReleaseDate: z.string().optional().describe('ISO 8601 date for scheduled release'),
    copyright: z.string().optional(),
  }),
  handler: async (client, args) => {
    const attributes: any = {
      versionString: args.versionString,
      platform: args.platform,
    };
    if (args.releaseType) attributes.releaseType = args.releaseType;
    if (args.earliestReleaseDate) attributes.earliestReleaseDate = args.earliestReleaseDate;
    if (args.copyright) attributes.copyright = args.copyright;

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
  description: 'Upload a screenshot (reserves slot, then uploads binary)',
  schema: z.object({
    screenshotSetId: z.string().describe('Screenshot Set ID'),
    filePath: z.string().describe('Local path to the screenshot image'),
    fileName: z.string().describe('File name (e.g. screen1.png)'),
    fileSize: z.number().describe('File size in bytes'),
  }),
  handler: async (client, args) => {
    // Step 1: Reserve screenshot
    const reservation = await client.request('/appScreenshots', {
      method: 'POST',
      body: {
        data: {
          type: 'appScreenshots',
          attributes: {
            fileName: args.fileName,
            fileSize: args.fileSize,
          },
          relationships: {
            appScreenshotSet: {
              data: { type: 'appScreenshotSets', id: args.screenshotSetId },
            },
          },
        },
      },
    });

    // Step 2: Upload binary to each upload operation URL
    const screenshot = reservation.data;
    const operations = screenshot.attributes.uploadOperations;

    for (const op of operations) {
      await client.upload(op.url, args.filePath, 'image/png');
    }

    // Step 3: Commit
    await client.request(`/appScreenshots/${screenshot.id}`, {
      method: 'PATCH',
      body: {
        data: {
          type: 'appScreenshots',
          id: screenshot.id,
          attributes: {
            uploaded: true,
            sourceFileChecksum: screenshot.attributes.sourceFileChecksum,
          },
        },
      },
    });

    return { success: true, screenshotId: screenshot.id };
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
  description: 'Update age rating declaration',
  schema: z.object({
    ageRatingId: z.string().describe('Age Rating Declaration ID'),
    alcoholTobaccoOrDrugUseOrReferences: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    gamblingSimulated: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    medicalOrTreatmentInformation: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    profanityOrCrudeHumor: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    sexualContentOrNudity: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    horrorOrFearThemes: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    violenceCartoonOrFantasy: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    violenceRealistic: z.enum(['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE']).optional(),
    gamblingAndContests: z.boolean().optional(),
    unrestrictedWebAccess: z.boolean().optional(),
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
    // Get existing review detail
    const existing = await client.request(
      `/appStoreVersions/${args.versionId}/appStoreReviewDetail`,
    );

    const reviewDetailId = existing.data?.id;
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

const submitForReview: ToolDef = {
  name: 'apple_submit_for_review',
  description: 'Submit an App Store version for review',
  schema: z.object({
    versionId: z.string().describe('App Store Version ID'),
  }),
  handler: async (client, args) => {
    return client.request('/appStoreVersionSubmissions', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreVersionSubmissions',
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

const cancelSubmission: ToolDef = {
  name: 'apple_cancel_submission',
  description: 'Cancel an in-review submission (if still possible)',
  schema: z.object({
    submissionId: z.string().describe('Submission ID'),
  }),
  handler: async (client, args) => {
    await client.request(`/appStoreVersionSubmissions/${args.submissionId}`, {
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
  description: 'Get current app pricing',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/apps/${args.appId}/appPriceSchedule`, {
      params: { include: 'manualPrices,automaticPrices' },
    });
  },
};

const setAppPrice: ToolDef = {
  name: 'apple_set_price',
  description: 'Set app price (free or paid). Use price tier ID from Apple price points.',
  schema: z.object({
    appId: z.string().describe('App ID'),
    priceTierId: z.string().describe('Price tier ID (use "0" for free)'),
    startDate: z.string().optional().describe('ISO 8601 start date'),
  }),
  handler: async (client, args) => {
    return client.request(`/apps/${args.appId}/appPriceSchedule`, {
      method: 'POST',
      body: {
        data: {
          type: 'appPriceSchedules',
          relationships: {
            app: { data: { type: 'apps', id: args.appId } },
            manualPrices: {
              data: [{ type: 'appPrices', id: '${new}' }],
            },
          },
        },
        included: [
          {
            type: 'appPrices',
            id: '${new}',
            attributes: {
              startDate: args.startDate ?? null,
            },
            relationships: {
              priceTier: {
                data: { type: 'appPriceTiers', id: args.priceTierId },
              },
            },
          },
        ],
      },
    });
  },
};

const listTerritoryAvailability: ToolDef = {
  name: 'apple_list_availability',
  description: 'List territories where the app is available',
  schema: z.object({
    appId: z.string().describe('App ID'),
  }),
  handler: async (client, args) => {
    return client.request(`/apps/${args.appId}/availableTerritoriesV2`);
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
    isInternalGroup: z.boolean().optional().describe('Is internal group (Apple employees)'),
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
// Export all tools
// ═══════════════════════════════════════════

export const appleTools: ToolDef[] = [
  // App Management
  listApps, getApp, getAppInfo, updateAppInfoCategory,
  // Bundle IDs
  listBundleIds, createBundleId,
  // Versions & Localizations
  listVersions, createVersion,
  listVersionLocalizations, createVersionLocalization, updateVersionLocalization,
  // App Info Localizations (name, subtitle)
  listAppInfoLocalizations, updateAppInfoLocalization,
  // Screenshots
  listScreenshotSets, createScreenshotSet, uploadScreenshot, deleteScreenshot,
  // Builds
  listBuilds, assignBuild,
  // Age Rating & Review Info
  getAgeRating, updateAgeRating, updateReviewDetail,
  // Submission
  submitForReview, cancelSubmission,
  // Pricing & Availability
  getAppPricing, setAppPrice, listTerritoryAvailability,
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
];

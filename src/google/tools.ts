import { z } from 'zod';
import { androidpublisher_v3 } from 'googleapis';
import { GoogleClient } from './client.js';

interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  handler: (client: GoogleClient, args: any) => Promise<any>;
}

const microsSchema = z.string().regex(/^\d+$/, 'Price micros must be a non-negative integer string');
const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Currency must be an ISO 4217 code');

function priceToMoney(micros: string, currency: string) {
  const value = BigInt(micros);
  return {
    currencyCode: currency,
    units: (value / 1_000_000n).toString(),
    nanos: Number((value % 1_000_000n) * 1_000n),
  };
}

// ═══════════════════════════════════════════
// 1. Edit Lifecycle
// ═══════════════════════════════════════════

const createEdit: ToolDef = {
  name: 'google_create_edit',
  description: 'Create a new edit session. Required before making any changes to a Google Play listing.',
  schema: z.object({
    packageName: z.string().describe('Android package name (e.g. com.example.app)'),
  }),
  handler: async (client, args) => {
    const editId = await client.createEdit(args.packageName);
    return { editId, note: 'Use this editId for subsequent operations, then commit when done.' };
  },
};

const getEdit: ToolDef = {
  name: 'google_get_edit',
  description: 'Get an edit session, including its ID and expiry time, before resuming pending work',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
  }),
  handler: async (client, args) => {
    return client.getEdit(args.packageName, args.editId);
  },
};

const commitEdit: ToolDef = {
  name: 'google_commit_edit',
  description: 'Commit all pending changes. By default, fail safely instead of canceling changes that are already in review.',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID from google_create_edit'),
    changesInReviewBehavior: z
      .enum(['ERROR_IF_IN_REVIEW', 'CANCEL_IN_REVIEW_AND_SUBMIT'])
      .optional()
      .default('ERROR_IF_IN_REVIEW')
      .describe('Safe default is ERROR_IF_IN_REVIEW. Choose cancellation only when intentionally replacing a review.'),
    changesNotSentForReview: z
      .boolean()
      .optional()
      .describe('Keep rejected changes out of review until they are explicitly sent from Play Console.'),
  }),
  handler: async (client, args) => {
    return client.commitEdit(args.packageName, args.editId, {
      changesInReviewBehavior: args.changesInReviewBehavior,
      changesNotSentForReview: args.changesNotSentForReview,
    });
  },
};

const validateEdit: ToolDef = {
  name: 'google_validate_edit',
  description: 'Validate an edit session without committing. Useful to check for errors before commit.',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID from google_create_edit'),
  }),
  handler: async (client, args) => {
    await client.validateEdit(args.packageName, args.editId);
    return { success: true, note: 'Edit is valid and ready to commit.' };
  },
};

const deleteEdit: ToolDef = {
  name: 'google_delete_edit',
  description: 'Discard an edit session without committing changes',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
  }),
  handler: async (client, args) => {
    await client.deleteEdit(args.packageName, args.editId);
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 2. App Details
// ═══════════════════════════════════════════

const getDetails: ToolDef = {
  name: 'google_get_details',
  description: 'Get app details (default language, contact email/phone/website)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
  }),
  handler: async (client, args) => {
    return client.getDetails(args.packageName, args.editId);
  },
};

const updateDetails: ToolDef = {
  name: 'google_update_details',
  description: 'Update app details (default language, contact email/phone/website)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    defaultLanguage: z.string().optional().describe('Default language code in BCP 47 format (e.g. en-US)'),
    contactWebsite: z.string().optional().describe('User-visible website URL'),
    contactEmail: z.string().optional().describe('User-visible support email'),
    contactPhone: z.string().optional().describe('User-visible support phone number'),
  }),
  handler: async (client, args) => {
    const { packageName, editId, ...details } = args;
    return client.updateDetails(packageName, editId, details);
  },
};

// ═══════════════════════════════════════════
// 3. Store Listing
// ═══════════════════════════════════════════

const listListings: ToolDef = {
  name: 'google_list_listings',
  description: 'List all store listings (all languages) for an app',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
  }),
  handler: async (client, args) => {
    return client.listListings(args.packageName, args.editId);
  },
};

const getListing: ToolDef = {
  name: 'google_get_listing',
  description: 'Get store listing for a specific language',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    language: z.string().describe('Language code (e.g. ko-KR, en-US, ja-JP)'),
  }),
  handler: async (client, args) => {
    return client.getListing(args.packageName, args.editId, args.language);
  },
};

const updateListing: ToolDef = {
  name: 'google_update_listing',
  description: 'Update store listing for a specific language (title, descriptions, promo video)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    language: z.string().describe('Language code (e.g. ko-KR, en-US)'),
    title: z.string().optional().describe('App title (max 30 chars)'),
    shortDescription: z.string().optional().describe('Short description (max 80 chars)'),
    fullDescription: z.string().optional().describe('Full description (max 4000 chars)'),
    video: z.string().optional().describe('URL of a promotional YouTube video for the app'),
  }),
  handler: async (client, args) => {
    const { packageName, editId, language, ...listing } = args;
    return client.updateListing(packageName, editId, language, listing);
  },
};

const deleteListing: ToolDef = {
  name: 'google_delete_listing',
  description: 'Delete a store listing for a specific language',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    language: z.string().describe('Language code to delete (e.g. ko-KR)'),
  }),
  handler: async (client, args) => {
    await client.deleteListing(args.packageName, args.editId, args.language);
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 4. Country Availability & Testers
// ═══════════════════════════════════════════

const getCountryAvailability: ToolDef = {
  name: 'google_get_country_availability',
  description: 'Get country availability for a specific track',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    track: z.string().describe('Track name (e.g. production, beta, alpha, internal)'),
  }),
  handler: async (client, args) => {
    return client.getCountryAvailability(args.packageName, args.editId, args.track);
  },
};

const getTesters: ToolDef = {
  name: 'google_get_testers',
  description: 'Get tester configuration for a track',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    track: z.string().describe('Track name (e.g. internal, alpha, beta)'),
  }),
  handler: async (client, args) => {
    return client.getTesters(args.packageName, args.editId, args.track);
  },
};

const updateTesters: ToolDef = {
  name: 'google_update_testers',
  description: 'Update tester Google Groups for a track',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    track: z.string().describe('Track name (e.g. internal, alpha, beta)'),
    googleGroups: z.array(z.string()).optional().describe('List of Google Group email addresses'),
  }),
  handler: async (client, args) => {
    const { packageName, editId, track, ...testers } = args;
    return client.updateTesters(packageName, editId, track, testers);
  },
};

// ═══════════════════════════════════════════
// 5. Images (Screenshots, Icons, Feature Graphics)
// ═══════════════════════════════════════════

const listImages: ToolDef = {
  name: 'google_list_images',
  description: 'List uploaded images of a specific type',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    language: z.string().describe('Language code'),
    imageType: z.enum([
      'featureGraphic', 'icon', 'phoneScreenshots', 'sevenInchScreenshots',
      'tenInchScreenshots', 'tvBanner', 'tvScreenshots', 'wearScreenshots',
    ]).describe('Image type'),
  }),
  handler: async (client, args) => {
    return client.listImages(args.packageName, args.editId, args.language, args.imageType);
  },
};

const uploadImage: ToolDef = {
  name: 'google_upload_image',
  description: 'Upload an image (screenshot, icon, feature graphic, etc)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    language: z.string().describe('Language code'),
    imageType: z.enum([
      'featureGraphic', 'icon', 'phoneScreenshots', 'sevenInchScreenshots',
      'tenInchScreenshots', 'tvBanner', 'tvScreenshots', 'wearScreenshots',
    ]).describe('Image type'),
    imagePath: z.string().describe('Local path to the image file'),
  }),
  handler: async (client, args) => {
    return client.uploadImage(
      args.packageName, args.editId, args.language, args.imageType, args.imagePath,
    );
  },
};

const deleteImage: ToolDef = {
  name: 'google_delete_image',
  description: 'Delete a specific uploaded image',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    language: z.string().describe('Language code'),
    imageType: z.string().describe('Image type'),
    imageId: z.string().describe('Image ID to delete'),
  }),
  handler: async (client, args) => {
    await client.deleteImage(
      args.packageName, args.editId, args.language, args.imageType, args.imageId,
    );
    return { success: true };
  },
};

const deleteAllImages: ToolDef = {
  name: 'google_delete_all_images',
  description: 'Delete all images of a specific type for a language',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    language: z.string().describe('Language code'),
    imageType: z.string().describe('Image type'),
  }),
  handler: async (client, args) => {
    await client.deleteAllImages(args.packageName, args.editId, args.language, args.imageType);
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 6. Tracks & Releases
// ═══════════════════════════════════════════

const listTracks: ToolDef = {
  name: 'google_list_tracks',
  description: 'List all release tracks, including custom closed-test and form-factor tracks',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
  }),
  handler: async (client, args) => {
    return client.listTracks(args.packageName, args.editId);
  },
};

const getTrack: ToolDef = {
  name: 'google_get_track',
  description: 'Get details of a specific release track',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    track: z.string().min(1).describe('Track ID returned by google_list_tracks'),
  }),
  handler: async (client, args) => {
    return client.getTrack(args.packageName, args.editId, args.track);
  },
};

function normalizedVersionCodes(release: androidpublisher_v3.Schema$TrackRelease): string[] {
  return (release.versionCodes ?? [])
    .filter((value): value is string => typeof value === 'string')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function sameVersionCodes(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function matchingTrackReleases(
  releases: androidpublisher_v3.Schema$TrackRelease[],
  requestedVersionCodes: string[],
): androidpublisher_v3.Schema$TrackRelease[] {
  const requested = [...requestedVersionCodes]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return releases.filter(release => sameVersionCodes(normalizedVersionCodes(release), requested));
}

export function selectTrackReleaseByVersionCodes(
  releases: androidpublisher_v3.Schema$TrackRelease[],
  requestedVersionCodes: string[],
): androidpublisher_v3.Schema$TrackRelease {
  const requested = [...requestedVersionCodes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const matches = matchingTrackReleases(releases, requested);
  if (matches.length !== 1) {
    const available = releases.map(release => normalizedVersionCodes(release).join(',')).filter(Boolean);
    throw new Error(
      matches.length > 1
        ? `Multiple source releases match version codes ${requested.join(', ')}`
        : `No source release exactly matches version codes ${requested.join(', ')}. Available releases: ${available.join(' | ') || 'none'}`,
    );
  }
  return matches[0];
}

const maxPlayVersionCode = '2100000000';
const versionCodeSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Version codes must be positive canonical integer strings')
  .refine(
    value => value.length < maxPlayVersionCode.length
      || (value.length === maxPlayVersionCode.length && value <= maxPlayVersionCode),
    'Version codes must not exceed the Google Play maximum of 2100000000',
  );

const versionCodesSchema = z
  .array(versionCodeSchema)
  .min(1)
  .superRefine((versionCodes, context) => {
    const seen = new Set<string>();
    versionCodes.forEach((versionCode, index) => {
      if (seen.has(versionCode)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Duplicate version code ${versionCode}`,
        });
      }
      seen.add(versionCode);
    });
  });

const countryTargetingSchema = z.object({
  countries: z
    .array(z.string().regex(/^[A-Z]{2}$/, 'Countries must use two-letter uppercase CLDR codes'))
    .default([]),
  includeRestOfWorld: z.boolean().optional().default(false),
}).superRefine((targeting, context) => {
  if (targeting.countries.length === 0 && !targeting.includeRestOfWorld) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['countries'],
      message: 'Provide at least one country or set includeRestOfWorld to true',
    });
  }
  const seen = new Set<string>();
  targeting.countries.forEach((country, index) => {
    if (seen.has(country)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['countries', index],
        message: `Duplicate country ${country}`,
      });
    }
    seen.add(country);
  });
});

function validateCountryTargetingSuperset(
  releases: androidpublisher_v3.Schema$TrackRelease[],
  versionCodes: string[],
  countryTargeting: z.infer<typeof countryTargetingSchema>,
): void {
  const matches = matchingTrackReleases(releases, versionCodes);
  if (matches.length > 1) {
    throw new Error(`Multiple target releases match version codes ${versionCodes.join(', ')}`);
  }

  const existing = matches[0];
  if (existing?.status !== 'inProgress' || !existing.countryTargeting) return;

  const requestedCountries = new Set(countryTargeting.countries);
  const removedCountries = (existing.countryTargeting.countries ?? [])
    .filter(country => !requestedCountries.has(country));
  const removesRestOfWorld = existing.countryTargeting.includeRestOfWorld === true
    && !countryTargeting.includeRestOfWorld;

  if (removedCountries.length > 0 || removesRestOfWorld) {
    const removals = [
      ...(removedCountries.length > 0
        ? [`countries ${removedCountries.join(', ')}`]
        : []),
      ...(removesRestOfWorld ? ['includeRestOfWorld'] : []),
    ];
    throw new Error(
      `countryTargeting cannot remove ${removals.join(' or ')} from an existing in-progress release`,
    );
  }
}

async function validateExistingCountryTargeting(
  client: GoogleClient,
  packageName: string,
  editId: string,
  track: string,
  versionCodes: string[],
  countryTargeting: z.infer<typeof countryTargetingSchema> | undefined,
): Promise<void> {
  if (!countryTargeting) return;
  const targetTrack = await client.getTrack(packageName, editId, track);
  validateCountryTargetingSuperset(
    targetTrack.releases ?? [],
    versionCodes,
    countryTargeting,
  );
}

function validateReleaseOptions(
  track: string,
  status: string,
  userFraction: number | undefined,
  countryTargeting: z.infer<typeof countryTargetingSchema> | undefined,
): void {
  const trackKind = track.split(':').at(-1);
  if (userFraction !== undefined && (trackKind === 'qa' || trackKind === 'internal')) {
    throw new Error('userFraction is not supported for the internal track');
  }
  if (userFraction !== undefined && status !== 'inProgress' && status !== 'halted') {
    throw new Error('userFraction can only be set for an inProgress or halted release');
  }
  if (status === 'inProgress' && userFraction === undefined) {
    throw new Error(`${status} releases require userFraction`);
  }
  if (countryTargeting !== undefined && (trackKind !== 'production' || status !== 'inProgress')) {
    throw new Error('countryTargeting is only supported for inProgress releases on a production track');
  }
}

const createRelease: ToolDef = {
  name: 'google_create_release',
  description: 'Create or update one release with an explicit version-code set. Google Play retains fallback releases; send only the desired change.',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    track: z.string().min(1).describe('Target track ID, including custom or form-factor tracks returned by google_list_tracks'),
    versionCodes: versionCodesSchema.describe('Complete version-code set for this release'),
    releaseNotes: z.array(z.object({
      language: z.string(),
      text: z.string(),
    })).optional().describe('Release notes per language'),
    status: z.enum(['draft', 'halted', 'completed', 'inProgress']).default('completed'),
    userFraction: z.number().gt(0).lt(1).optional().describe('Staged rollout fraction (exclusive range 0-1; not supported for internal)'),
    releaseName: z.string().optional().describe('Release name/label'),
    countryTargeting: countryTargetingSchema
      .optional()
      .describe('Country targeting for an inProgress production rollout'),
    inAppUpdatePriority: z
      .number()
      .int()
      .min(0)
      .max(5)
      .optional()
      .describe('In-app update priority from 0 (lowest) to 5 (highest); cannot be changed after rollout'),
  }),
  handler: async (client, args) => {
    validateReleaseOptions(args.track, args.status, args.userFraction, args.countryTargeting);
    await validateExistingCountryTargeting(
      client,
      args.packageName,
      args.editId,
      args.track,
      args.versionCodes,
      args.countryTargeting,
    );
    const release: any = {
      status: args.status,
      versionCodes: args.versionCodes,
    };
    if (args.releaseNotes) release.releaseNotes = args.releaseNotes;
    if (args.userFraction !== undefined) release.userFraction = args.userFraction;
    if (args.releaseName) release.name = args.releaseName;
    if (args.countryTargeting) release.countryTargeting = args.countryTargeting;
    if (args.inAppUpdatePriority !== undefined) {
      release.inAppUpdatePriority = args.inAppUpdatePriority;
    }

    return client.updateTrack(args.packageName, args.editId, args.track, [release]);
  },
};

const promoteRelease: ToolDef = {
  name: 'google_promote_release',
  description: 'Promote a release from one track to another (e.g. beta → production)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    fromTrack: z.string().min(1).describe('Source track ID returned by google_list_tracks'),
    toTrack: z.string().min(1).describe('Target track ID, including custom or form-factor tracks'),
    versionCodes: versionCodesSchema.describe('Complete version-code set identifying the source release'),
    userFraction: z.number().gt(0).lt(1).optional().describe('Staged rollout fraction (not supported for internal)'),
    releaseNotes: z.array(z.object({
      language: z.string(),
      text: z.string(),
    })).optional(),
    countryTargeting: countryTargetingSchema
      .optional()
      .describe('Country targeting for an inProgress production rollout'),
    inAppUpdatePriority: z
      .number()
      .int()
      .min(0)
      .max(5)
      .optional()
      .describe('In-app update priority from 0 (lowest) to 5 (highest)'),
  }),
  handler: async (client, args) => {
    if (args.fromTrack === args.toTrack) {
      throw new Error('fromTrack and toTrack must be different');
    }
    const status = args.userFraction !== undefined ? 'inProgress' : 'completed';
    validateReleaseOptions(args.toTrack, status, args.userFraction, args.countryTargeting);

    const sourceTrack = await client.getTrack(args.packageName, args.editId, args.fromTrack);
    const sourceRelease = selectTrackReleaseByVersionCodes(
      sourceTrack.releases ?? [],
      args.versionCodes,
    );
    await validateExistingCountryTargeting(
      client,
      args.packageName,
      args.editId,
      args.toTrack,
      args.versionCodes,
      args.countryTargeting,
    );

    const release: any = {
      versionCodes: sourceRelease.versionCodes,
      status,
    };
    if (sourceRelease.name) release.name = sourceRelease.name;
    const inAppUpdatePriority = args.inAppUpdatePriority ?? sourceRelease.inAppUpdatePriority;
    if (inAppUpdatePriority !== undefined) {
      release.inAppUpdatePriority = inAppUpdatePriority;
    }
    if (args.userFraction !== undefined) release.userFraction = args.userFraction;
    if (args.countryTargeting) release.countryTargeting = args.countryTargeting;
    if (args.releaseNotes) release.releaseNotes = args.releaseNotes;
    else if (sourceRelease.releaseNotes) release.releaseNotes = sourceRelease.releaseNotes;

    return client.updateTrack(args.packageName, args.editId, args.toTrack, [release]);
  },
};

const haltRelease: ToolDef = {
  name: 'google_halt_release',
  description: 'Halt an exact in-progress or completed release; halting a completed production release rolls users back to the previous completed release',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    track: z.string().min(1).describe('Track ID returned by google_list_tracks'),
    versionCodes: versionCodesSchema.describe('Complete version-code set identifying the release to halt'),
  }),
  handler: async (client, args) => {
    const trackData = await client.getTrack(args.packageName, args.editId, args.track);
    const target = selectTrackReleaseByVersionCodes(
      trackData.releases ?? [],
      args.versionCodes,
    );
    if (target.status !== 'inProgress' && target.status !== 'completed') {
      throw new Error(
        `Release ${args.versionCodes.join(',')} cannot be halted from status ${target.status ?? 'unknown'}`,
      );
    }

    const halted: androidpublisher_v3.Schema$TrackRelease = {
      versionCodes: target.versionCodes,
      status: 'halted',
    };
    return client.updateTrack(args.packageName, args.editId, args.track, [halted]);
  },
};

const listReleaseStatuses: ToolDef = {
  name: 'google_list_release_statuses',
  description: 'List non-obsolete releases and their review/publishing lifecycle states for a track after an edit is committed',
  schema: z.object({
    packageName: z.string().trim().min(1).refine(
      value => !value.includes('/'),
      'Package name must not contain "/"',
    ).describe('Android package name'),
    track: z.string().trim().min(1).refine(
      value => !value.includes('/'),
      'Track ID must not contain "/"',
    ).describe('Track ID, including custom or form-factor tracks'),
  }),
  handler: async (client, args) => {
    return client.listReleaseSummaries(args.packageName, args.track);
  },
};

// ═══════════════════════════════════════════
// 7. Bundle / APK Upload
// ═══════════════════════════════════════════

const listBundles: ToolDef = {
  name: 'google_list_bundles',
  description: 'List Android App Bundles already available in an edit, including version codes and hashes',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
  }),
  handler: async (client, args) => {
    return client.listBundles(args.packageName, args.editId);
  },
};

const uploadBundle: ToolDef = {
  name: 'google_upload_bundle',
  description: 'Upload an Android App Bundle (.aab)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    bundlePath: z.string().describe('Local path to the .aab file'),
  }),
  handler: async (client, args) => {
    return client.uploadBundle(args.packageName, args.editId, args.bundlePath);
  },
};

const uploadApk: ToolDef = {
  name: 'google_upload_apk',
  description: 'Upload an APK file',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    apkPath: z.string().describe('Local path to the .apk file'),
  }),
  handler: async (client, args) => {
    return client.uploadApk(args.packageName, args.editId, args.apkPath);
  },
};

const listApks: ToolDef = {
  name: 'google_list_apks',
  description: 'List APKs already available in an edit, including version codes and hashes',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
  }),
  handler: async (client, args) => {
    return client.listApks(args.packageName, args.editId);
  },
};

// ═══════════════════════════════════════════
// 8. Data Safety
// ═══════════════════════════════════════════

const updateDataSafety: ToolDef = {
  name: 'google_update_data_safety',
  description: 'Submit a user-reviewed Data Safety declaration from an up-to-date Google Play CSV export. Google does not provide a corresponding read endpoint.',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    csvPath: z.string().min(1).describe('Local path to the reviewed Data Safety .csv file'),
  }),
  handler: async (client, args) => {
    await client.updateDataSafety(args.packageName, args.csvPath);
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 9. Reviews
// ═══════════════════════════════════════════

const listReviews: ToolDef = {
  name: 'google_list_reviews',
  description:
    'List user reviews for an app. Note: the Play Developer API reviews.list endpoint only surfaces recent reviews and requires the "Reply to reviews" account permission for the linked service account (Play Console → Users and permissions). If this returns an empty array for an app with visible reviews in Play Console, verify that permission first, then use pageToken to page through more results.',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    maxResults: z.number().optional().describe('Max reviews to return per page (API max is 100)'),
    pageToken: z.string().optional().describe('Pagination token from a previous response (nextPageToken)'),
    translationLanguage: z.string().optional().describe('BCP-47 language code to translate review text into'),
  }),
  handler: async (client, args) => {
    return client.listReviews(args.packageName, {
      maxResults: args.maxResults,
      token: args.pageToken,
      translationLanguage: args.translationLanguage,
    });
  },
};

const getReview: ToolDef = {
  name: 'google_get_review',
  description: 'Get a specific review with details',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    reviewId: z.string().describe('Review ID'),
    translationLanguage: z.string().optional().describe('BCP-47 language code to translate review text into'),
  }),
  handler: async (client, args) => {
    return client.getReview(args.packageName, args.reviewId, args.translationLanguage);
  },
};

const replyToReview: ToolDef = {
  name: 'google_reply_to_review',
  description: 'Reply to a user review',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    reviewId: z.string().describe('Review ID'),
    replyText: z.string().describe('Reply text'),
  }),
  handler: async (client, args) => {
    return client.replyToReview(args.packageName, args.reviewId, args.replyText);
  },
};

// ═══════════════════════════════════════════
// 10. In-App Products
// ═══════════════════════════════════════════

const listInAppProducts: ToolDef = {
  name: 'google_list_iap',
  description: 'List all in-app products (managed products) for an app',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    pageToken: z.string().optional().describe('Pagination token from the previous response'),
  }),
  handler: async (client, args) => {
    return client.listInAppProducts(args.packageName, args.pageToken);
  },
};

const getInAppProduct: ToolDef = {
  name: 'google_get_iap',
  description: 'Get details of a specific in-app product',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    sku: z.string().describe('Product SKU'),
  }),
  handler: async (client, args) => {
    return client.getInAppProduct(args.packageName, args.sku);
  },
};

const createInAppProduct: ToolDef = {
  name: 'google_create_iap',
  description: 'Create a new in-app product (managed product)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    sku: z.string().describe('Product SKU (unique identifier)'),
    defaultLanguage: z.string().describe('Default language (e.g. en-US)'),
    defaultTitle: z.string().describe('Default product title'),
    defaultDescription: z.string().describe('Default product description'),
    status: z.enum(['active', 'inactive']).default('active'),
    purchaseType: z.enum(['managedUser', 'subscription']).default('managedUser'),
    defaultPriceCurrencyCode: z.string().describe('Currency code (e.g. USD)'),
    defaultPriceMicros: z.string().describe('Price in micros (e.g. 990000 for $0.99)'),
  }),
  handler: async (client, args) => {
    return client.createInAppProduct(args.packageName, {
      sku: args.sku,
      status: args.status,
      purchaseType: args.purchaseType,
      defaultLanguage: args.defaultLanguage,
      listings: {
        [args.defaultLanguage]: {
          title: args.defaultTitle,
          description: args.defaultDescription,
        },
      },
      defaultPrice: {
        priceMicros: args.defaultPriceMicros,
        currency: args.defaultPriceCurrencyCode,
      },
    });
  },
};

const updateInAppProduct: ToolDef = {
  name: 'google_update_iap',
  description: 'Update an existing in-app product',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    sku: z.string().describe('Product SKU'),
    defaultLanguage: z.string().optional().describe('Default language'),
    title: z.string().optional().describe('Product title (for default language)'),
    description: z.string().optional().describe('Product description (for default language)'),
    status: z.enum(['active', 'inactive']).optional(),
    defaultPriceCurrencyCode: z.string().optional().describe('Currency code'),
    defaultPriceMicros: z.string().optional().describe('Price in micros'),
  }),
  handler: async (client, args) => {
    const product: any = {};
    if (args.status) product.status = args.status;
    if (args.defaultLanguage) product.defaultLanguage = args.defaultLanguage;
    if (args.title || args.description) {
      const lang = args.defaultLanguage || 'en-US';
      product.listings = { [lang]: {} as any };
      if (args.title) product.listings[lang].title = args.title;
      if (args.description) product.listings[lang].description = args.description;
    }
    if (args.defaultPriceCurrencyCode && args.defaultPriceMicros) {
      product.defaultPrice = {
        priceMicros: args.defaultPriceMicros,
        currency: args.defaultPriceCurrencyCode,
      };
    }
    return client.updateInAppProduct(args.packageName, args.sku, product);
  },
};

const deleteInAppProduct: ToolDef = {
  name: 'google_delete_iap',
  description: 'Delete an in-app product',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    sku: z.string().describe('Product SKU to delete'),
  }),
  handler: async (client, args) => {
    await client.deleteInAppProduct(args.packageName, args.sku);
    return { success: true };
  },
};

// ═══════════════════════════════════════════
// 11. Subscriptions (monetization)
// ═══════════════════════════════════════════

const listSubscriptions: ToolDef = {
  name: 'google_list_subscriptions',
  description: 'List all subscriptions for an app',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    pageSize: z.number().int().min(1).max(1000).optional(),
    pageToken: z.string().optional().describe('Pagination token from the previous response'),
  }),
  handler: async (client, args) => {
    return client.listSubscriptions(args.packageName, {
      pageSize: args.pageSize,
      pageToken: args.pageToken,
    });
  },
};

const getSubscription: ToolDef = {
  name: 'google_get_subscription',
  description: 'Get details of a specific subscription',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    productId: z.string().describe('Subscription product ID'),
  }),
  handler: async (client, args) => {
    return client.getSubscription(args.packageName, args.productId);
  },
};

const offerTagSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,18}[a-z0-9])?$/,
    'Offer tags must be 1-20 lowercase letters, digits, or hyphens, and must start and end with a letter or digit',
  );

const subscriptionBasePlanSchema = z.object({
  basePlanId: z.string().regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'basePlanId must be 1-63 lowercase letters, digits, or hyphens, and must start and end with a letter or digit',
  ),
  autoRenewing: z.object({
    billingPeriodDuration: z.string().min(1),
    gracePeriodDuration: z.string().optional(),
    accountHoldDuration: z.string().optional(),
    prorationMode: z.string().min(1).optional(),
    resubscribeState: z.string().min(1).optional(),
    legacyCompatible: z.boolean().optional(),
  }).optional(),
  prepaid: z.object({
    billingPeriodDuration: z.string().min(1),
    timeExtension: z.enum(['TIME_EXTENSION_ACTIVE', 'TIME_EXTENSION_INACTIVE']).optional(),
  }).optional(),
  installments: z.object({
    billingPeriodDuration: z.string().min(1),
    committedPaymentsCount: z.number().int().positive(),
    renewalType: z.enum([
      'RENEWAL_TYPE_RENEWS_WITHOUT_COMMITMENT',
      'RENEWAL_TYPE_RENEWS_WITH_COMMITMENT',
    ]),
    gracePeriodDuration: z.string().optional(),
    accountHoldDuration: z.string().optional(),
    prorationMode: z.string().min(1).optional(),
    resubscribeState: z.string().min(1).optional(),
  }).optional(),
  regionalConfigs: z.array(z.object({
    regionCode: z.string().regex(/^[A-Z]{2}$/),
    newSubscriberAvailability: z.boolean().optional().default(true),
    priceMicros: microsSchema,
    currency: currencySchema,
  })).min(1).superRefine((regions, context) => {
    const seen = new Set<string>();
    regions.forEach((region, index) => {
      if (seen.has(region.regionCode)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'regionCode'],
          message: `Duplicate regionCode ${region.regionCode}`,
        });
      }
      seen.add(region.regionCode);
    });
  }),
  otherRegionsConfig: z.object({
    usdPriceMicros: microsSchema,
    eurPriceMicros: microsSchema,
    newSubscriberAvailability: z.boolean().optional().default(false),
  }).optional(),
  offerTags: z.array(offerTagSchema).max(20).optional(),
}).superRefine((plan, context) => {
  const typeCount = [plan.autoRenewing, plan.prepaid, plan.installments]
    .filter(value => value !== undefined).length;
  if (typeCount !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['autoRenewing'],
      message: 'Each base plan must define exactly one of autoRenewing, prepaid, or installments',
    });
  }
});

const createSubscription: ToolDef = {
  name: 'google_create_subscription',
  description:
    'Create a new subscription on Google Play (monetization API). Pass the full subscription body — including listings and at least one base plan with billing details and per-region pricing. Base plans are created in DRAFT state; call google_activate_subscription_base_plan to make them purchasable.',
  schema: z.object({
    packageName: z.string().describe('Android package name (e.g. com.example.app)'),
    productId: z
      .string().max(40).regex(/^[a-z0-9][a-z0-9._]*$/)
      .describe('Subscription product ID, e.g. com.example.app.pro_monthly'),
    listings: z
      .array(
        z.object({
          languageCode: z.string().min(1).describe('BCP-47 locale code, e.g. en-US'),
          title: z.string().max(55).describe('Localized subscription title (max 55 chars)'),
          description: z
            .string().max(200)
            .optional()
            .describe('Localized description (max 200 chars)'),
          benefits: z
            .array(z.string().min(1).max(40)).max(4)
            .optional()
            .describe('Up to four benefit bullets of at most 40 chars each per locale'),
        }),
      )
      .min(1)
      .superRefine((listings, context) => {
        const seen = new Set<string>();
        listings.forEach((listing, index) => {
          if (seen.has(listing.languageCode)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, 'languageCode'],
              message: `Duplicate languageCode ${listing.languageCode}`,
            });
          }
          seen.add(listing.languageCode);
        });
      })
      .describe('At least one localization is required'),
    basePlans: z
      .array(subscriptionBasePlanSchema)
      .min(1)
      .superRefine((plans, context) => {
        const seen = new Set<string>();
        let legacyCompatibleCount = 0;
        plans.forEach((plan, index) => {
          if (seen.has(plan.basePlanId)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, 'basePlanId'],
              message: `Duplicate basePlanId ${plan.basePlanId}`,
            });
          }
          seen.add(plan.basePlanId);
          if (plan.autoRenewing?.legacyCompatible) legacyCompatibleCount += 1;
        });
        if (legacyCompatibleCount > 1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'At most one auto-renewing base plan may be legacyCompatible',
          });
        }
      })
      .describe('At least one auto-renewing, prepaid, or installments base plan is required'),
    regionsVersion: z
      .string()
      .optional()
      .default('2022/02')
      .describe('Google Play regions version. Default 2022/02 matches Google API expectations.'),
  }),
  handler: async (client, args) => {
    const body: androidpublisher_v3.Schema$Subscription = {
      packageName: args.packageName,
      productId: args.productId,
      listings: args.listings.map((l: any) => ({
        languageCode: l.languageCode,
        title: l.title,
        description: l.description,
        benefits: l.benefits,
      })),
      basePlans: args.basePlans.map((bp: any) => {
        return {
          basePlanId: bp.basePlanId,
          autoRenewingBasePlanType: bp.autoRenewing ? {
            billingPeriodDuration: bp.autoRenewing.billingPeriodDuration,
            gracePeriodDuration: bp.autoRenewing.gracePeriodDuration,
            accountHoldDuration: bp.autoRenewing.accountHoldDuration,
            prorationMode: bp.autoRenewing.prorationMode,
            resubscribeState: bp.autoRenewing.resubscribeState,
            legacyCompatible: bp.autoRenewing.legacyCompatible ?? false,
          } : undefined,
          prepaidBasePlanType: bp.prepaid ? {
            billingPeriodDuration: bp.prepaid.billingPeriodDuration,
            timeExtension: bp.prepaid.timeExtension,
          } : undefined,
          installmentsBasePlanType: bp.installments ? {
            billingPeriodDuration: bp.installments.billingPeriodDuration,
            committedPaymentsCount: bp.installments.committedPaymentsCount,
            renewalType: bp.installments.renewalType,
            gracePeriodDuration: bp.installments.gracePeriodDuration,
            accountHoldDuration: bp.installments.accountHoldDuration,
            prorationMode: bp.installments.prorationMode,
            resubscribeState: bp.installments.resubscribeState,
          } : undefined,
          regionalConfigs: bp.regionalConfigs.map((rc: any) => ({
            regionCode: rc.regionCode,
            newSubscriberAvailability: rc.newSubscriberAvailability ?? true,
            price: priceToMoney(rc.priceMicros, rc.currency),
          })),
          otherRegionsConfig: bp.otherRegionsConfig ? {
            usdPrice: priceToMoney(bp.otherRegionsConfig.usdPriceMicros, 'USD'),
            eurPrice: priceToMoney(bp.otherRegionsConfig.eurPriceMicros, 'EUR'),
            newSubscriberAvailability:
              bp.otherRegionsConfig.newSubscriberAvailability ?? false,
          } : undefined,
          offerTags: bp.offerTags?.map((t: string) => ({ tag: t })),
        };
      }),
    };
    return client.createSubscription(
      args.packageName,
      args.productId,
      body,
      args.regionsVersion,
    );
  },
};

const activateBasePlan: ToolDef = {
  name: 'google_activate_subscription_base_plan',
  description:
    'Activate a subscription base plan so it becomes purchasable. Base plans default to DRAFT after creation; this is required to make them ACTIVE.',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan id to activate'),
  }),
  handler: async (client, args) => {
    return client.activateBasePlan(
      args.packageName,
      args.productId,
      args.basePlanId,
    );
  },
};

const deactivateBasePlan: ToolDef = {
  name: 'google_deactivate_subscription_base_plan',
  description: 'Deactivate a base plan for new subscribers while existing subscribers retain their subscription. Use this instead of the unsupported subscription archive operation.',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan id to deactivate'),
  }),
  handler: async (client, args) => {
    return client.deactivateBasePlan(args.packageName, args.productId, args.basePlanId);
  },
};

// ═══════════════════════════════════════════
// 12. One-time Products (monetization)
// ═══════════════════════════════════════════

const listOneTimeProducts: ToolDef = {
  name: 'google_list_one_time_products',
  description: 'List all one-time products (non-subscription purchases, buy or rent) for an app',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    pageSize: z.number().int().min(1).max(1000).optional(),
    pageToken: z.string().optional().describe('Pagination token from the previous response'),
  }),
  handler: async (client, args) => {
    return client.listOneTimeProducts(args.packageName, {
      pageSize: args.pageSize,
      pageToken: args.pageToken,
    });
  },
};

const getOneTimeProduct: ToolDef = {
  name: 'google_get_one_time_product',
  description: 'Get details of a specific one-time product',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    productId: z.string().describe('One-time product ID'),
  }),
  handler: async (client, args) => {
    return client.getOneTimeProduct(args.packageName, args.productId);
  },
};

const purchaseOptionAvailabilitySchema = z.enum([
  'AVAILABLE',
  'NO_LONGER_AVAILABLE',
  'AVAILABLE_IF_RELEASED',
  'AVAILABLE_FOR_OFFERS_ONLY',
]);

const newRegionsAvailabilitySchema = z.enum([
  'AVAILABLE',
  'NO_LONGER_AVAILABLE',
]);

const oneTimeProductPurchaseOptionSchema = z.object({
  purchaseOptionId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).describe('Stable purchase option id, e.g. buy-standard'),
  buy: z
    .object({
      legacyCompatible: z.boolean().optional().describe('Marks this as the single "buy" option usable by legacy PBL flows'),
      multiQuantityEnabled: z.boolean().optional(),
    })
    .optional()
    .describe('Configures this as a one-time buy option. Mutually exclusive with rent.'),
  rent: z
    .object({
      rentalPeriod: z.string().describe('ISO 8601 duration the entitlement lasts, e.g. P30D'),
      expirationPeriod: z.string().optional().describe('ISO 8601 duration after consumption starts before the entitlement is revoked, e.g. P2D'),
    })
    .optional()
    .describe('Configures this as a rental option. Mutually exclusive with buy.'),
  regionalConfigs: z
    .array(
      z.object({
        regionCode: z.string().regex(/^[A-Z]{2}$/).describe('ISO 3166-1 alpha-2 region, e.g. US'),
        priceMicros: z.string().regex(/^\d+$/).describe('Non-negative price in micros, e.g. 3990000 for $3.99'),
        currency: z.string().regex(/^[A-Z]{3}$/).describe('ISO 4217 currency code, e.g. USD'),
        availability: purchaseOptionAvailabilitySchema.optional().default('AVAILABLE'),
      }),
    )
    .min(1)
    .superRefine((regions, context) => {
      const seen = new Set<string>();
      regions.forEach((region, index) => {
        if (seen.has(region.regionCode)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'regionCode'],
            message: `Duplicate regionCode ${region.regionCode}`,
          });
        }
        seen.add(region.regionCode);
      });
    })
    .describe('At least one region price is required'),
  newRegionsConfig: z.object({
    availability: newRegionsAvailabilitySchema,
    usdPriceMicros: microsSchema,
    eurPriceMicros: microsSchema,
  }).optional(),
  taxAndComplianceSettings: z.object({
    withdrawalRightType: z.string().min(1).optional(),
  }).optional(),
  offerTags: z.array(offerTagSchema).max(20).optional(),
});

const oneTimeProductBody = {
  packageName: z.string().describe('Android package name (e.g. com.example.app)'),
  productId: z.string().regex(/^[a-z0-9][a-z0-9._]*$/).describe('One-time product ID, e.g. com.example.app.remove_ads'),
  listings: z
    .array(
      z.object({
        languageCode: z.string().min(1).describe('BCP-47 locale code, e.g. en-US'),
        title: z.string().max(55).describe('Localized title (max 55 chars)'),
        description: z.string().max(200).describe('Localized description (max 200 chars)'),
      }),
    )
    .min(1)
    .superRefine((listings, context) => {
      const seen = new Set<string>();
      listings.forEach((listing, index) => {
        if (seen.has(listing.languageCode)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'languageCode'],
            message: `Duplicate languageCode ${listing.languageCode}`,
          });
        }
        seen.add(listing.languageCode);
      });
    })
    .describe('At least one localization is required'),
  purchaseOptions: z.array(oneTimeProductPurchaseOptionSchema).min(1).superRefine((options, context) => {
    const seen = new Set<string>();
    let legacyCompatibleCount = 0;
    options.forEach((option, index) => {
      if (seen.has(option.purchaseOptionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'purchaseOptionId'],
          message: `Duplicate purchaseOptionId ${option.purchaseOptionId}`,
        });
      }
      seen.add(option.purchaseOptionId);
      if (option.buy?.legacyCompatible) legacyCompatibleCount += 1;
    });
    if (legacyCompatibleCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At most one buy purchase option may be legacyCompatible',
      });
    }
  }).describe('At least one purchase option (buy or rent) is required'),
  offerTags: z.array(offerTagSchema).max(20).optional(),
  restrictedPaymentCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
  taxAndComplianceSettings: z.object({
    isTokenizedDigitalAsset: z.boolean().optional(),
    productTaxCategoryCode: z.string().min(1).optional(),
    regionalProductAgeRatingInfos: z.array(z.object({
      regionCode: z.string().regex(/^[A-Z]{2}$/),
      productAgeRatingTier: z.string().min(1),
    })).optional(),
    regionalTaxConfigs: z.array(z.object({
      regionCode: z.string().regex(/^[A-Z]{2}$/),
      eligibleForStreamingServiceTaxRate: z.boolean().optional(),
      streamingTaxType: z.string().min(1).optional(),
      taxTier: z.string().min(1).optional(),
    })).optional(),
  }).optional(),
  regionsVersion: z
    .string()
    .optional()
    .default('2022/02')
    .describe('Google Play regions version. Default 2022/02 matches Google API expectations.'),
};

function buildOneTimeProduct(args: any): androidpublisher_v3.Schema$OneTimeProduct {
  for (const option of args.purchaseOptions) {
    if (Boolean(option.buy) === Boolean(option.rent)) {
      throw new Error(`Purchase option ${option.purchaseOptionId} must define exactly one of buy or rent`);
    }
  }

  return {
    packageName: args.packageName,
    productId: args.productId,
    listings: args.listings.map((l: any) => ({
      languageCode: l.languageCode,
      title: l.title,
      description: l.description,
    })),
    purchaseOptions: args.purchaseOptions.map((po: any) => ({
      purchaseOptionId: po.purchaseOptionId,
      buyOption: po.buy
        ? { legacyCompatible: po.buy.legacyCompatible ?? false, multiQuantityEnabled: po.buy.multiQuantityEnabled ?? false }
        : undefined,
      rentOption: po.rent ? { rentalPeriod: po.rent.rentalPeriod, expirationPeriod: po.rent.expirationPeriod } : undefined,
      regionalPricingAndAvailabilityConfigs: po.regionalConfigs.map((rc: any) => ({
        regionCode: rc.regionCode,
        price: priceToMoney(rc.priceMicros, rc.currency),
        availability: rc.availability ?? 'AVAILABLE',
      })),
      newRegionsConfig: po.newRegionsConfig ? {
        availability: po.newRegionsConfig.availability,
        usdPrice: priceToMoney(po.newRegionsConfig.usdPriceMicros, 'USD'),
        eurPrice: priceToMoney(po.newRegionsConfig.eurPriceMicros, 'EUR'),
      } : undefined,
      taxAndComplianceSettings: po.taxAndComplianceSettings,
      offerTags: po.offerTags?.map((t: string) => ({ tag: t })),
    })),
    offerTags: args.offerTags?.map((tag: string) => ({ tag })),
    restrictedPaymentCountries: args.restrictedPaymentCountries
      ? { regionCodes: args.restrictedPaymentCountries }
      : undefined,
    taxAndComplianceSettings: args.taxAndComplianceSettings,
  };
}

const createOneTimeProduct: ToolDef = {
  name: 'google_create_one_time_product',
  description:
    'Create a new one-time product (buy or rent) on Google Play. Inspect the returned purchase-option state and call google_activate_purchase_option when it is DRAFT.',
  schema: z.object(oneTimeProductBody),
  handler: async (client, args) => {
    const hasNoLongerAvailable = args.purchaseOptions.some((option: any) =>
      option.regionalConfigs.some((region: any) => region.availability === 'NO_LONGER_AVAILABLE') ||
      option.newRegionsConfig?.availability === 'NO_LONGER_AVAILABLE');
    if (hasNoLongerAvailable) {
      throw new Error('NO_LONGER_AVAILABLE is only valid when updating an existing purchase option');
    }
    const body = buildOneTimeProduct(args);
    const updateFields = ['listings', 'purchaseOptions'];
    if (args.offerTags !== undefined) updateFields.push('offerTags');
    if (args.restrictedPaymentCountries !== undefined) updateFields.push('restrictedPaymentCountries');
    if (args.taxAndComplianceSettings !== undefined) updateFields.push('taxAndComplianceSettings');
    return client.upsertOneTimeProduct(args.packageName, args.productId, body, {
      allowMissing: true,
      updateMask: updateFields.join(','),
      regionsVersionVersion: args.regionsVersion,
    });
  },
};

const updateOneTimeProduct: ToolDef = {
  name: 'google_update_one_time_product',
  description: 'Update an existing one-time product. Pass the full desired listings/purchaseOptions state plus an updateMask (e.g. "listings,purchaseOptions").',
  schema: z.object({
    ...oneTimeProductBody,
    updateMask: z.string().min(1).describe('Comma-separated field mask of top-level fields to update, e.g. "listings,purchaseOptions"'),
  }),
  handler: async (client, args) => {
    const body = buildOneTimeProduct(args);
    return client.upsertOneTimeProduct(args.packageName, args.productId, body, {
      allowMissing: false,
      updateMask: args.updateMask,
      regionsVersionVersion: args.regionsVersion,
    });
  },
};

const deleteOneTimeProduct: ToolDef = {
  name: 'google_delete_one_time_product',
  description: 'Delete a one-time product',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    productId: z.string().describe('One-time product ID to delete'),
  }),
  handler: async (client, args) => {
    await client.deleteOneTimeProduct(args.packageName, args.productId);
    return { success: true };
  },
};

const activatePurchaseOption: ToolDef = {
  name: 'google_activate_purchase_option',
  description: 'Activate a one-time product purchase option so it becomes available for purchase',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    productId: z.string().describe('One-time product ID'),
    purchaseOptionId: z.string().describe('Purchase option ID to activate'),
  }),
  handler: async (client, args) => {
    return client.setPurchaseOptionState(args.packageName, args.productId, args.purchaseOptionId, 'activate');
  },
};

const deactivatePurchaseOption: ToolDef = {
  name: 'google_deactivate_purchase_option',
  description: 'Deactivate a one-time product purchase option so it stops being available for purchase',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    productId: z.string().describe('One-time product ID'),
    purchaseOptionId: z.string().describe('Purchase option ID to deactivate'),
  }),
  handler: async (client, args) => {
    return client.setPurchaseOptionState(args.packageName, args.productId, args.purchaseOptionId, 'deactivate');
  },
};

// ═══════════════════════════════════════════
// Export all tools
// ═══════════════════════════════════════════

export const googleTools: ToolDef[] = [
  // Edit lifecycle
  createEdit, getEdit, commitEdit, validateEdit, deleteEdit,
  // App details
  getDetails, updateDetails,
  // Store listing
  listListings, getListing, updateListing, deleteListing,
  // Country availability & Testers
  getCountryAvailability, getTesters, updateTesters,
  // Images
  listImages, uploadImage, deleteImage, deleteAllImages,
  // Tracks & Releases
  listTracks, getTrack, createRelease, promoteRelease, haltRelease, listReleaseStatuses,
  // Bundle / APK
  listBundles, uploadBundle, listApks, uploadApk,
  // Data Safety
  updateDataSafety,
  // Reviews
  listReviews, getReview, replyToReview,
  // In-App Products
  listInAppProducts, getInAppProduct, createInAppProduct, updateInAppProduct, deleteInAppProduct,
  // Subscriptions
  listSubscriptions, getSubscription, createSubscription,
  activateBasePlan, deactivateBasePlan,
  // One-time Products
  listOneTimeProducts, getOneTimeProduct, createOneTimeProduct, updateOneTimeProduct, deleteOneTimeProduct,
  activatePurchaseOption, deactivatePurchaseOption,
];

import { z } from 'zod';
import { GoogleClient } from './client.js';

interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  handler: (client: GoogleClient, args: any) => Promise<any>;
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

const commitEdit: ToolDef = {
  name: 'google_commit_edit',
  description: 'Commit all pending changes in an edit session. This publishes the changes.',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID from google_create_edit'),
  }),
  handler: async (client, args) => {
    await client.commitEdit(args.packageName, args.editId);
    return { success: true };
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
// 2. Store Listing
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
  description: 'Update store listing for a specific language (title, descriptions)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    language: z.string().describe('Language code (e.g. ko-KR, en-US)'),
    title: z.string().optional().describe('App title (max 30 chars)'),
    shortDescription: z.string().optional().describe('Short description (max 80 chars)'),
    fullDescription: z.string().optional().describe('Full description (max 4000 chars)'),
  }),
  handler: async (client, args) => {
    const { packageName, editId, language, ...listing } = args;
    return client.updateListing(packageName, editId, language, listing);
  },
};

// ═══════════════════════════════════════════
// 3. Images (Screenshots, Icons, Feature Graphics)
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
// 4. Tracks & Releases
// ═══════════════════════════════════════════

const listTracks: ToolDef = {
  name: 'google_list_tracks',
  description: 'List all release tracks (internal, alpha, beta, production)',
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
    track: z.enum(['internal', 'alpha', 'beta', 'production']).describe('Track name'),
  }),
  handler: async (client, args) => {
    return client.getTrack(args.packageName, args.editId, args.track);
  },
};

const createRelease: ToolDef = {
  name: 'google_create_release',
  description: 'Create a release on a track with optional version codes and release notes',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    track: z.enum(['internal', 'alpha', 'beta', 'production']).describe('Target track'),
    versionCodes: z.array(z.string()).optional().describe('Version codes to include'),
    releaseNotes: z.array(z.object({
      language: z.string(),
      text: z.string(),
    })).optional().describe('Release notes per language'),
    status: z.enum(['draft', 'halted', 'completed', 'inProgress']).default('completed'),
    userFraction: z.number().optional().describe('Staged rollout fraction (0.0-1.0, only for production)'),
    releaseName: z.string().optional().describe('Release name/label'),
  }),
  handler: async (client, args) => {
    const release: any = {
      status: args.status,
    };
    if (args.versionCodes) release.versionCodes = args.versionCodes;
    if (args.releaseNotes) release.releaseNotes = args.releaseNotes;
    if (args.userFraction) release.userFraction = args.userFraction;
    if (args.releaseName) release.name = args.releaseName;

    return client.updateTrack(args.packageName, args.editId, args.track, [release]);
  },
};

const promoteRelease: ToolDef = {
  name: 'google_promote_release',
  description: 'Promote a release from one track to another (e.g. beta → production)',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    fromTrack: z.enum(['internal', 'alpha', 'beta']).describe('Source track'),
    toTrack: z.enum(['alpha', 'beta', 'production']).describe('Target track'),
    userFraction: z.number().optional().describe('Staged rollout fraction for production'),
    releaseNotes: z.array(z.object({
      language: z.string(),
      text: z.string(),
    })).optional(),
  }),
  handler: async (client, args) => {
    // Get the current release from source track
    const sourceTrack = await client.getTrack(args.packageName, args.editId, args.fromTrack);
    const latestRelease = sourceTrack.releases?.[0];
    if (!latestRelease) throw new Error(`No release found on ${args.fromTrack} track`);

    const release: any = {
      versionCodes: latestRelease.versionCodes,
      status: args.userFraction ? 'inProgress' : 'completed',
    };
    if (args.userFraction) release.userFraction = args.userFraction;
    if (args.releaseNotes) release.releaseNotes = args.releaseNotes;

    return client.updateTrack(args.packageName, args.editId, args.toTrack, [release]);
  },
};

const haltRelease: ToolDef = {
  name: 'google_halt_release',
  description: 'Halt an ongoing staged rollout',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    editId: z.string().describe('Edit ID'),
    track: z.string().describe('Track name'),
  }),
  handler: async (client, args) => {
    const trackData = await client.getTrack(args.packageName, args.editId, args.track);
    const inProgress = trackData.releases?.find(r => r.status === 'inProgress');
    if (!inProgress) throw new Error('No in-progress release to halt');

    inProgress.status = 'halted';
    return client.updateTrack(args.packageName, args.editId, args.track, trackData.releases!);
  },
};

// ═══════════════════════════════════════════
// 5. Bundle / APK Upload
// ═══════════════════════════════════════════

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

// ═══════════════════════════════════════════
// 6. Reviews
// ═══════════════════════════════════════════

const listReviews: ToolDef = {
  name: 'google_list_reviews',
  description: 'List user reviews for an app',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
  }),
  handler: async (client, args) => {
    return client.listReviews(args.packageName);
  },
};

const getReview: ToolDef = {
  name: 'google_get_review',
  description: 'Get a specific review with details',
  schema: z.object({
    packageName: z.string().describe('Android package name'),
    reviewId: z.string().describe('Review ID'),
  }),
  handler: async (client, args) => {
    return client.getReview(args.packageName, args.reviewId);
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
// Export all tools
// ═══════════════════════════════════════════

export const googleTools: ToolDef[] = [
  // Edit lifecycle
  createEdit, commitEdit, deleteEdit,
  // Store listing
  listListings, getListing, updateListing,
  // Images
  listImages, uploadImage, deleteImage, deleteAllImages,
  // Tracks & Releases
  listTracks, getTrack, createRelease, promoteRelease, haltRelease,
  // Bundle / APK
  uploadBundle, uploadApk,
  // Reviews
  listReviews, getReview, replyToReview,
];

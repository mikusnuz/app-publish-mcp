import { z } from 'zod';
import { AppleClient } from './client.js';
import { allPages } from './asset-library.js';

const id = z.string().trim().min(1);
const platform = z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).default('IOS');
const context = { appId: id, platform, submissionId: id };
const resources = {
  appAssetLibraryImages: 'appAssetLibraryImage',
  appAssetLibraryVideos: 'appAssetLibraryVideo',
  appCustomProductPageVersions: 'appCustomProductPageVersion',
  appStoreVersionExperiments: 'appStoreVersionExperimentV2',
  appStoreVersions: 'appStoreVersion',
} as const;
const submitted = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES', 'COMPLETING', 'COMPLETE']);

function failureDetail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/[^\s"'<>]+/gi, '[URL omitted]').slice(0, 1200);
}

async function readSubmission(client: AppleClient, args: { submissionId: string; appId: string; platform: string }) {
  const response = await client.request(`/reviewSubmissions/${args.submissionId}`, {
    params: { include: 'app', 'fields[reviewSubmissions]': 'app,platform,state' },
  });
  if (response.data?.id !== args.submissionId
    || response.data?.relationships?.app?.data?.id !== args.appId
    || response.data?.attributes?.platform !== args.platform) {
    throw new Error(`Review submission ${args.submissionId} does not match the requested app and platform; no change made`);
  }
  return response;
}

async function items(client: AppleClient, submissionId: string) {
  return allPages(client, `/reviewSubmissions/${submissionId}/items`, {
    limit: '200',
    'fields[reviewSubmissionItems]': `state,${Object.values(resources).join(',')}`,
  });
}

function matchingItem(result: any, relationship: string, resourceId: string) {
  return result.data.find((item: any) => item.relationships?.[relationship]?.data?.id === resourceId);
}

function requireDraft(response: any) {
  if (response.data?.attributes?.state !== 'READY_FOR_REVIEW') {
    throw new Error(`Submission is ${response.data?.attributes?.state}, not READY_FOR_REVIEW; no change made`);
  }
}

export const reviewItemTools = [
  {
    name: 'apple_list_review_submissions',
    description: 'List review submissions for an app and platform, including drafts to resume after an interrupted request',
    schema: z.object({ appId: id, platform }),
    handler: async (client: AppleClient, args: any) => allPages(client, '/reviewSubmissions', {
      'filter[app]': args.appId, 'filter[platform]': args.platform, limit: '200',
    }),
  },
  {
    name: 'apple_get_review_submission',
    description: 'Inspect a review submission and all item IDs before adding an asset/custom page/test or explicitly submitting it',
    schema: z.object(context),
    handler: async (client: AppleClient, args: any) => ({
      ...await readSubmission(client, args), items: (await items(client, args.submissionId)).data,
    }),
  },
  {
    name: 'apple_create_review_submission',
    description: 'Create an empty review draft; does not submit it. For asset-only, custom product page or product page optimization review. Existing drafts must be explicitly resumed, not replaced.',
    schema: z.object({ appId: id, platform }),
    handler: async (client: AppleClient, args: any) => {
      const drafts = await allPages(client, '/reviewSubmissions', {
        'filter[app]': args.appId, 'filter[platform]': args.platform, 'filter[state]': 'READY_FOR_REVIEW', limit: '200',
      });
      if (drafts.data.length) throw new Error(`Review drafts already exist: ${drafts.data.map((item: any) => item.id).join(', ')}. Inspect and explicitly resume the intended submissionId; no draft created`);
      try {
        const result = await client.request('/reviewSubmissions', { method: 'POST', body: { data: {
          type: 'reviewSubmissions', attributes: { platform: args.platform },
          relationships: { app: { data: { type: 'apps', id: args.appId } } },
        } } });
        if (!result.data?.id) throw new Error('Missing submission ID');
        return result;
      } catch (error) {
        throw new Error(`Review draft creation did not return a confirmed ID. Call apple_list_review_submissions and inspect candidates before retrying; no automatic retry or cleanup was attempted. ${failureDetail(error)}`);
      }
    },
  },
  {
    name: 'apple_add_review_submission_item',
    description: 'Attach an Asset Library image/video, custom product page version, v2 experiment or app version to a draft, without submitting. For an initial app release include the app version; assigned assets are reviewed with their owning item. Retries reconcile an already attached item.',
    schema: z.object({
      ...context,
      resourceType: z.enum(['appAssetLibraryImages', 'appAssetLibraryVideos', 'appCustomProductPageVersions', 'appStoreVersionExperiments', 'appStoreVersions']),
      resourceId: id,
    }),
    handler: async (client: AppleClient, args: any) => {
      const current = await readSubmission(client, args);
      const relationship = resources[args.resourceType as keyof typeof resources];
      const existing = matchingItem(await items(client, args.submissionId), relationship, args.resourceId);
      if (existing) return { data: existing, submissionId: args.submissionId, reconciled: true };
      requireDraft(current);
      try {
        const result = await client.request('/reviewSubmissionItems', { method: 'POST', body: { data: {
          type: 'reviewSubmissionItems', relationships: {
            reviewSubmission: { data: { type: 'reviewSubmissions', id: args.submissionId } },
            [relationship]: { data: { type: args.resourceType, id: args.resourceId } },
          },
        } } });
        if (!result.data?.id) throw new Error('Missing review item ID');
        return { ...result, submissionId: args.submissionId };
      } catch (error) {
        try {
          const attached = matchingItem(await items(client, args.submissionId), relationship, args.resourceId);
          if (attached) return { data: attached, submissionId: args.submissionId, reconciled: true };
        } catch { /* Preserve the draft if reconciliation is unavailable. */ }
        throw new Error(`Unable to confirm item attachment to submission ${args.submissionId}. Inspect it with apple_get_review_submission before retrying; draft retained. ${failureDetail(error)}`);
      }
    },
  },
  {
    name: 'apple_submit_review_submission',
    description: 'Submit an inspected review draft containing assets, custom pages or experiments. itemIds must exactly match all review item IDs returned by apple_get_review_submission, to avoid submitting unexpected items. This starts App Review; saving or attaching an item does not.',
    schema: z.object({ ...context, itemIds: z.array(id).min(1) }),
    handler: async (client: AppleClient, args: any) => {
      const current = await readSubmission(client, args);
      const actual = (await items(client, args.submissionId)).data.map((item: any) => item.id).sort();
      const expected = [...new Set(args.itemIds)].sort();
      if (actual.length !== expected.length || actual.some((value: string, index: number) => value !== expected[index])) {
        throw new Error(`Submission ${args.submissionId} items changed or do not match itemIds; inspect it again before submitting. No submit attempted`);
      }
      if (submitted.has(current.data.attributes.state)) return { ...current, reconciled: true };
      requireDraft(current);
      try {
        return await client.request(`/reviewSubmissions/${args.submissionId}`, { method: 'PATCH', body: { data: {
          type: 'reviewSubmissions', id: args.submissionId, attributes: { submitted: true },
        } } });
      } catch (error) {
        try {
          const after = await readSubmission(client, args);
          if (submitted.has(after.data.attributes.state)) return { ...after, reconciled: true };
        } catch { /* No destructive cleanup on an unknown outcome. */ }
        throw new Error(`Submission ${args.submissionId} submit outcome is not confirmed. Inspect its state before retrying; draft retained. ${failureDetail(error)}`);
      }
    },
  },
];

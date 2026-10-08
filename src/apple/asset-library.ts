import { statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import { AppleClient } from './client.js';

const id = z.string().trim().min(1);
const mediaType = z.enum(['IMAGE', 'VIDEO']);
type MediaType = z.infer<typeof mediaType>;
const category = z.enum(['APP_SCREENSHOTS_AND_PREVIEWS', 'CREATIVE_ASSETS']);
const targetType = z.enum([
  'appStoreVersionLocalizations',
  'appCustomProductPageLocalizations',
  'appStoreVersionExperimentTreatmentLocalizations',
  'appEventLocalizations',
]);
const target = { targetType: targetType.default('appStoreVersionLocalizations'), localizationId: id };
const asset = { mediaType, assetId: id };
const waitOptions = {
  timeoutSeconds: z.number().int().min(1).max(1800).default(300),
  pollIntervalSeconds: z.number().int().min(1).max(60).default(5),
};
const readyStates = new Set([
  'COMPLETE', 'PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW',
  'WAITING_FOR_REVIEW', 'IN_REVIEW', 'ACCEPTED', 'APPROVED',
]);

function resource(type: MediaType): string {
  return type === 'IMAGE' ? 'appAssetLibraryImages' : 'appAssetLibraryVideos';
}

function relationship(type: string, value: string) {
  return { data: { type, id: value } };
}

function targetRelationship(args: any) {
  return { [args.targetType.slice(0, -1)]: relationship(args.targetType, args.localizationId) };
}

// Presigned upload URLs are credentials and must not enter tool responses.
function publicResult(value: any): any {
  if (Array.isArray(value)) return value.map(publicResult);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'uploadOperations')
    .map(([key, entry]) => [key, publicResult(entry)]));
}

async function allPages(client: AppleClient, path: string, params?: Record<string, string>) {
  const result = await client.request(path, { params });
  const data = [...(result.data ?? [])];
  const included = [...(result.included ?? [])];
  const visited = new Set<string>();
  let next = result.links?.next;
  while (next) {
    const url = new URL(next);
    if (url.origin !== 'https://api.appstoreconnect.apple.com' || !/^\/v\d+\//.test(url.pathname)) {
      throw new Error('Asset library pagination returned an invalid Apple API URL');
    }
    if (visited.has(next)) throw new Error('Asset library pagination repeated a next URL');
    visited.add(next);
    const page = await client.request(next);
    data.push(...(page.data ?? []));
    included.push(...(page.included ?? []));
    next = page.links?.next;
  }
  return publicResult({ ...result, data, ...(included.length ? { included } : {}), links: { ...result.links, next: undefined } });
}

async function readAsset(client: AppleClient, type: MediaType, assetId: string) {
  return publicResult(await client.request(`/${resource(type)}/${assetId}`));
}

function checkAsset(result: any, assetId: string, expectedSpecId?: string): boolean {
  const attributes = result.data?.attributes;
  const state = attributes?.state;
  if (state === 'FAILED' || state === 'REJECTED' || state === 'ARCHIVED') {
    throw new Error(`Asset ${assetId} is ${state}: ${JSON.stringify(attributes?.stateDetails ?? [])}. The asset was retained.`);
  }
  if (!readyStates.has(state)) {
    if (state !== 'AWAITING_UPLOAD' && state !== 'UPLOAD_COMPLETE') {
      throw new Error(`Asset ${assetId} returned an unknown state ${String(state)}; inspect it before continuing`);
    }
    return false;
  }
  if (expectedSpecId && attributes.specId !== expectedSpecId) {
    throw new Error(`Asset ${assetId} matched specification ${String(attributes.specId)}, expected ${expectedSpecId}. No placement was created.`);
  }
  return true;
}

async function waitForAsset(client: AppleClient, args: any) {
  const deadline = Date.now() + args.timeoutSeconds * 1000;
  while (true) {
    const result = await readAsset(client, args.mediaType, args.assetId);
    if (checkAsset(result, args.assetId, args.expectedSpecId)) return result;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Asset ${args.assetId} is still processing. Resume with apple_wait_for_asset; do not upload another copy.`);
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(args.pollIntervalSeconds * 1000, remaining)));
  }
}

async function listPlacements(client: AppleClient, args: any) {
  return allPages(client, `/${args.targetType}/${args.localizationId}/placements`, {
    include: 'image,video',
    sort: 'placementGroupPosition',
    limit: '200',
    ...(args.placementType ? { 'filter[placementType]': args.placementType } : {}),
    ...(args.placementGroup ? { 'filter[placementGroup]': args.placementGroup } : {}),
  });
}

export const assetLibraryTools = [
  {
    name: 'apple_get_asset_library',
    description: 'Get the reusable App Asset Library for an app before uploading screenshots, previews, or creative assets',
    schema: z.object({ appId: id }),
    handler: async (client: AppleClient, args: any) => client.request(`/apps/${args.appId}/assetLibrary`),
  },
  {
    name: 'apple_get_asset_specs',
    description: 'Read Apple’s current asset specifications, placement types, device groups, and limits; use the returned IDs instead of hard-coded device sizes',
    schema: z.object({
      placementType: id.optional(), placementGroup: id.optional(), feature: id.optional(), specId: id.optional(),
    }),
    handler: async (client: AppleClient, args: any) => client.request('/appAssetLibraryRefData', { params: {
      ...(args.placementType ? { 'filter[placementTypes]': args.placementType } : {}),
      ...(args.placementGroup ? { 'filter[placementProfileGroups]': args.placementGroup } : {}),
      ...(args.feature ? { 'filter[features]': args.feature } : {}),
      ...(args.specId ? { 'filter[specs]': args.specId } : {}),
    } }),
  },
  {
    name: 'apple_list_assets',
    description: 'List all image or video assets in an App Asset Library, following every page; use this to reuse files and find interrupted uploads',
    schema: z.object({ assetLibraryId: id, mediaType, category: category.optional(), state: id.optional(), referenceName: id.optional() }),
    handler: async (client: AppleClient, args: any) => allPages(client,
      `/appAssetLibraries/${args.assetLibraryId}/${args.mediaType === 'IMAGE' ? 'images' : 'videos'}`, {
        limit: '200', sort: '-createdDate',
        ...(args.category ? { 'filter[category]': args.category } : {}),
        ...(args.state ? { 'filter[state]': args.state } : {}),
        ...(args.referenceName ? { 'filter[referenceName]': args.referenceName } : {}),
      }),
  },
  {
    name: 'apple_get_asset',
    description: 'Read an image or video asset’s processing state, matched specId, and delivery errors without exposing presigned upload URLs',
    schema: z.object(asset),
    handler: async (client: AppleClient, args: any) => readAsset(client, args.mediaType, args.assetId),
  },
  {
    name: 'apple_wait_for_asset',
    description: 'Resume waiting for an uploaded asset to become ready; optionally check that Apple matched the intended specification',
    schema: z.object({ ...asset, expectedSpecId: id.optional(), ...waitOptions }),
    handler: waitForAsset,
  },
  {
    name: 'apple_upload_asset',
    description: 'Upload an image or video once to the App Asset Library, commit uploaded=true, and verify processing against a specId from apple_get_asset_specs. Create placements separately to reuse it across localizations.',
    schema: z.object({
      assetLibraryId: id, mediaType, filePath: id,
      category: category.default('APP_SCREENSHOTS_AND_PREVIEWS'),
      expectedSpecId: id.describe('Specification ID from apple_get_asset_specs; checked after processing'),
      referenceName: id.optional(), previewFrameTimeCode: id.optional(),
      waitForProcessing: z.boolean().default(true), ...waitOptions,
    }),
    handler: async (client: AppleClient, args: any) => {
      const stats = statSync(args.filePath);
      if (!stats.isFile() || !Number.isSafeInteger(stats.size) || stats.size < 1) {
        throw new Error('Asset path must point to a nonempty regular file');
      }
      if (args.mediaType === 'IMAGE' && args.previewFrameTimeCode !== undefined) {
        throw new Error('previewFrameTimeCode is only supported for VIDEO assets');
      }
      const refData = await client.request('/appAssetLibraryRefData', { params: { 'filter[specs]': args.expectedSpecId } });
      const specs = (refData.data ?? []).flatMap((entry: any) => entry.attributes?.[args.mediaType === 'IMAGE' ? 'imageSpecs' : 'videoSpecs'] ?? []);
      const spec = specs.find((entry: any) => entry.specId === args.expectedSpecId);
      if (!spec) throw new Error(`No ${args.mediaType} specification ${args.expectedSpecId} in Apple reference data`);
      if (Array.isArray(spec.fileExtensions) && !spec.fileExtensions.map((value: string) => value.toLowerCase()).includes(extname(args.filePath).toLowerCase())) {
        throw new Error(`File extension does not match specification ${args.expectedSpecId}`);
      }
      if (spec.maxFileSize && stats.size > spec.maxFileSize) throw new Error(`File exceeds the ${spec.maxFileSize}-byte specification limit`);
      const type = resource(args.mediaType);
      const reservation = await client.request(`/${type}`, { method: 'POST', body: { data: {
        type,
        attributes: {
          fileName: basename(args.filePath), fileSize: stats.size, category: args.category,
          ...(args.referenceName ? { referenceName: args.referenceName } : {}),
          ...(args.previewFrameTimeCode ? { previewFrameTimeCode: args.previewFrameTimeCode } : {}),
        },
        relationships: { assetLibrary: relationship('appAssetLibraries', args.assetLibraryId) },
      } } });
      const assetId = reservation.data?.id;
      if (!assetId) throw new Error('Apple asset reservation returned no ID; inspect apple_list_assets before retrying');
      try {
        const operations = reservation.data?.attributes?.uploadOperations;
        if (!Array.isArray(operations) || operations.length === 0) throw new Error('No upload operations were returned');
        let end = 0;
        for (const operation of [...operations].sort((a, b) => a.offset - b.offset)) {
          if (!Number.isSafeInteger(operation.offset) || operation.offset !== end || !Number.isSafeInteger(operation.length) || operation.length < 1) {
            throw new Error('Upload operations contain a gap, overlap, or invalid byte range');
          }
          end += operation.length;
        }
        if (end !== stats.size) throw new Error('Upload operations do not cover the complete file');
        for (const operation of operations) await client.uploadOperation(operation, args.filePath);
      } catch (error) {
        throw new Error(`Asset ${assetId} upload did not complete; reservation retained for inspection or deletion. ${String(error)}`);
      }
      const commit = () => client.request(`/${type}/${assetId}`, { method: 'PATCH', body: {
        data: { type, id: assetId, attributes: { uploaded: true } },
      } });
      let committed;
      try {
        committed = await commit();
      } catch (error) {
        try {
          committed = await readAsset(client, args.mediaType, assetId);
          if (committed.data?.attributes?.state === 'AWAITING_UPLOAD') committed = await commit();
          else checkAsset(committed, assetId, args.expectedSpecId);
        } catch (reconcileError) {
          throw new Error(`Asset ${assetId} commit could not be confirmed; retained, not re-uploaded. Inspect apple_get_asset before retrying. ${String(error)}; ${String(reconcileError)}`);
        }
      }
      if (args.waitForProcessing) {
        return waitForAsset(client, { ...args, assetId });
      }
      checkAsset(committed, assetId, args.expectedSpecId);
      return { ...publicResult(committed), expectedSpecId: args.expectedSpecId, nextStep: 'Use apple_wait_for_asset before creating placements' };
    },
  },
  {
    name: 'apple_list_asset_placements',
    description: 'List every placement that uses an image or video, including other localizations, before deleting or replacing that asset',
    schema: z.object(asset),
    handler: async (client: AppleClient, args: any) => allPages(client, `/${resource(args.mediaType)}/${args.assetId}/placements`, { limit: '200' }),
  },
  {
    name: 'apple_list_placements',
    description: 'List all placements for a localization in display order, including their image/video assets',
    schema: z.object({ ...target, placementType: id.optional(), placementGroup: id.optional() }),
    handler: listPlacements,
  },
  {
    name: 'apple_create_placement',
    description: 'Place a ready library asset on an editable localization using a placement type and group from apple_get_asset_specs. Reuses an existing identical placement.',
    schema: z.object({ ...target, ...asset, placementType: id, placementGroup: id }),
    handler: async (client: AppleClient, args: any) => {
      const currentAsset = await readAsset(client, args.mediaType, args.assetId);
      if (!checkAsset(currentAsset, args.assetId)) throw new Error(`Asset ${args.assetId} is still processing; use apple_wait_for_asset first`);
      const kind = args.mediaType === 'IMAGE' ? 'image' : 'video';
      const existing = await listPlacements(client, args);
      const matches = existing.data.filter((entry: any) => entry.relationships?.[kind]?.data?.id === args.assetId);
      if (matches.length > 1) throw new Error('Multiple identical placements exist; inspect and remove duplicates before continuing');
      if (matches.length === 1) return { data: matches[0], reused: true };
      try {
        return await client.request('/appAssetLibraryPlacements', { method: 'POST', body: { data: {
          type: 'appAssetLibraryPlacements',
          attributes: { placementType: args.placementType, placementGroup: args.placementGroup },
          relationships: { ...targetRelationship(args), [kind]: relationship(resource(args.mediaType), args.assetId) },
        } } });
      } catch (error) {
        throw new Error(`Placement creation could not be confirmed for asset ${args.assetId}. Re-read apple_list_placements before retrying; the asset was retained. ${String(error)}`);
      }
    },
  },
  {
    name: 'apple_reorder_placements',
    description: 'Set the complete display order for one localization and placement group, then read back and verify the order. In-app event localizations are not orderable.',
    schema: z.object({ ...target, placementGroup: id, placementIds: z.array(id).min(1) }),
    handler: async (client: AppleClient, args: any) => {
      if (args.targetType === 'appEventLocalizations') throw new Error('In-app event placements cannot be reordered');
      if (new Set(args.placementIds).size !== args.placementIds.length) throw new Error('placementIds must not contain duplicates');
      const current = await listPlacements(client, args);
      const currentIds = new Set(current.data.map((entry: any) => entry.id));
      if (currentIds.size !== args.placementIds.length || args.placementIds.some((value: string) => !currentIds.has(value))) {
        throw new Error('placementIds must contain every current placement in the target group exactly once');
      }
      await client.request('/appAssetLibraryPlacementOrderingRequests', { method: 'POST', body: { data: {
        type: 'appAssetLibraryPlacementOrderingRequests',
        attributes: { placementGroup: args.placementGroup },
        relationships: {
          ...targetRelationship(args),
          orderedPlacements: { data: args.placementIds.map((value: string) => ({ type: 'appAssetLibraryPlacements', id: value })) },
        },
      } } });
      const verified = await listPlacements(client, args);
      if (JSON.stringify(verified.data.map((entry: any) => entry.id)) !== JSON.stringify(args.placementIds)) {
        throw new Error('Ordering request was accepted but the requested order was not confirmed; inspect apple_list_placements');
      }
      return verified;
    },
  },
  {
    name: 'apple_delete_placement',
    description: 'Remove a placement from its localization; the reusable library asset and its other placements remain intact',
    schema: z.object({ placementId: id }),
    handler: async (client: AppleClient, args: any) => {
      await client.request(`/appAssetLibraryPlacements/${args.placementId}`, { method: 'DELETE' });
      return { success: true, placementId: args.placementId };
    },
  },
  {
    name: 'apple_delete_asset',
    description: 'Delete an unplaced image or video from the library. Refuses to delete if any localization still uses it; delete the intended placements first.',
    schema: z.object(asset),
    handler: async (client: AppleClient, args: any) => {
      const path = `/${resource(args.mediaType)}/${args.assetId}`;
      const placements = await allPages(client, `${path}/placements`, { limit: '200' });
      if (placements.data.length) throw new Error(`Asset ${args.assetId} still has placements: ${placements.data.map((entry: any) => entry.id).join(', ')}. Delete the intended placements first.`);
      await client.request(path, { method: 'DELETE' });
      return { success: true, assetId: args.assetId };
    },
  },
];

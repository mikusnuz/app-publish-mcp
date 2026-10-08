import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { appleTools } from '../src/apple/tools.js';

async function call(name: string, client: any, args: any) {
  const tool = appleTools.find(tool => tool.name === name)!;
  assert.ok(tool, name);
  return tool.handler(client, tool.schema.parse(args));
}

function uploadFixture(options: { video?: boolean; commitLost?: boolean; badSpec?: boolean; failedUpload?: boolean; invalidRanges?: boolean } = {}) {
  const type = options.video ? 'appAssetLibraryVideos' : 'appAssetLibraryImages';
  const calls: any[] = [];
  let committed = false;
  const client = {
    async request(path: string, opts: any = {}) {
      calls.push([path, opts]);
      if (path === '/appAssetLibraryRefData') return { data: [{ attributes: {
        [options.video ? 'videoSpecs' : 'imageSpecs']: [{ specId: 'spec-1', fileExtensions: [options.video ? '.mov' : '.png'], maxFileSize: 100 }],
      } }] };
      if (path === `/${type}`) return { data: { type, id: 'asset-1', attributes: { state: 'AWAITING_UPLOAD', uploadOperations: [
        { offset: 0, length: 2, method: 'PUT', url: 'https://upload.example/1?token=secret' },
        { offset: options.invalidRanges ? 1 : 2, length: 2, method: 'PUT', url: 'https://upload.example/2?token=secret' },
      ] } } };
      if (path === `/${type}/asset-1`) {
        if (opts.method === 'PATCH') {
          committed = true;
          assert.deepEqual(opts.body, { data: { type, id: 'asset-1', attributes: { uploaded: true } } });
          if (options.commitLost) throw new Error('connection lost after commit');
        }
        return { data: { type, id: 'asset-1', attributes: {
          state: committed ? 'PREPARE_FOR_SUBMISSION' : 'AWAITING_UPLOAD',
          specId: options.badSpec ? 'other-spec' : 'spec-1',
          uploadOperations: [{ url: 'https://upload.example/private' }],
        } } };
      }
      throw new Error(`Unexpected ${path}`);
    },
    async uploadOperation(operation: any) {
      calls.push(['upload', operation]);
      if (options.failedUpload) throw new Error('upload failed');
    },
  };
  return { client, calls };
}

for (const video of [false, true]) {
  test(`asset library ${video ? 'video' : 'image'} uses all byte ranges and checksum-free commit`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'app-publish-asset-'));
    try {
      const filePath = join(directory, video ? 'preview.mov' : 'shot.png');
      writeFileSync(filePath, 'data');
      const { client, calls } = uploadFixture({ video });
      const result = await call('apple_upload_asset', client, {
        assetLibraryId: 'library-1', mediaType: video ? 'VIDEO' : 'IMAGE', filePath,
        expectedSpecId: 'spec-1', ...(video ? { previewFrameTimeCode: '00:00:03:00' } : {}),
      });
      assert.equal(result.data.attributes.state, 'PREPARE_FOR_SUBMISSION');
      assert.equal(calls.filter(call => call[0] === 'upload').length, 2);
      const reservation = calls.find(call => call[1]?.method === 'POST')[1].body.data;
      assert.deepEqual(reservation.relationships, { assetLibrary: { data: { type: 'appAssetLibraries', id: 'library-1' } } });
      assert.equal(reservation.attributes.fileSize, 4);
      assert.equal(JSON.stringify(result).includes('uploadOperations'), false);
      assert.equal(JSON.stringify(result).includes('secret'), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}

test('ambiguous upload commit is reconciled without another reservation or deletion', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-asset-'));
  try {
    const filePath = join(directory, 'shot.png'); writeFileSync(filePath, 'data');
    const { client, calls } = uploadFixture({ commitLost: true });
    const result = await call('apple_upload_asset', client, { assetLibraryId: 'lib', mediaType: 'IMAGE', filePath, expectedSpecId: 'spec-1' });
    assert.equal(result.data.id, 'asset-1');
    assert.equal(calls.filter(call => call[1]?.method === 'POST').length, 1);
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

for (const failure of ['badSpec', 'failedUpload', 'invalidRanges'] as const) {
  test(`upload reports ${failure} with the retained asset ID and creates no placement`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'app-publish-asset-'));
    try {
      const filePath = join(directory, 'shot.png'); writeFileSync(filePath, 'data');
      const { client, calls } = uploadFixture({ [failure]: true });
      await assert.rejects(call('apple_upload_asset', client, { assetLibraryId: 'lib', mediaType: 'IMAGE', filePath, expectedSpecId: 'spec-1' }), /[Aa]sset asset-1/);
      assert.equal(calls.some(call => call[1]?.method === 'DELETE' || call[0] === '/appAssetLibraryPlacements'), false);
      if (failure === 'invalidRanges') assert.equal(calls.some(call => call[0] === 'upload'), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}

test('creating a placement reuses an existing identical asset placement', async () => {
  let writes = 0;
  const client = { request: async (path: string, options: any) => {
    if (options?.method) writes++;
    if (path === '/appAssetLibraryImages/image-1') return { data: { attributes: { state: 'APPROVED' } } };
    return { data: [{ id: 'placement-1', relationships: { image: { data: { id: 'image-1' } } } }] };
  } };
  const result = await call('apple_create_placement', client, { localizationId: 'locale-1', mediaType: 'IMAGE', assetId: 'image-1', placementType: 'APP_SCREENSHOT', placementGroup: 'GROUP' });
  assert.equal(result.reused, true);
  assert.equal(result.data.id, 'placement-1');
  assert.equal(writes, 0);
});

test('placement body uses the selected asset and localization relationship', async () => {
  let payload: any;
  const client = { request: async (path: string, options: any) => {
    if (path === '/appAssetLibraryVideos/video-1') return { data: { attributes: { state: 'PREPARE_FOR_SUBMISSION' } } };
    if (!options?.method) return { data: [] };
    payload = options.body.data;
    return { data: { id: 'placement-1' } };
  } };
  await call('apple_create_placement', client, { targetType: 'appCustomProductPageLocalizations', localizationId: 'locale-1', mediaType: 'VIDEO', assetId: 'video-1', placementType: 'APP_PREVIEW', placementGroup: 'GROUP' });
  assert.deepEqual(payload.relationships, {
    video: { data: { type: 'appAssetLibraryVideos', id: 'video-1' } },
    appCustomProductPageLocalization: { data: { type: 'appCustomProductPageLocalizations', id: 'locale-1' } },
  });
});

test('asset deletion examines every placement page and refuses a used asset', async () => {
  const calls: any[] = [];
  const client = { request: async (path: string, options: any) => {
    calls.push([path, options]);
    if (path.startsWith('/')) return { data: [], links: { next: 'https://api.appstoreconnect.apple.com/v1/next' } };
    return { data: [{ id: 'used-on-other-locale' }] };
  } };
  await assert.rejects(call('apple_delete_asset', client, { mediaType: 'IMAGE', assetId: 'asset-1' }), /used-on-other-locale/);
  assert.equal(calls.length, 2);
  assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
});

test('placement deletion leaves the shared asset intact, then unused assets can be deleted', async () => {
  const calls: any[] = [];
  const client = { request: async (path: string, options: any) => { calls.push([path, options]); return { data: [] }; } };
  await call('apple_delete_placement', client, { placementId: 'p1' });
  assert.deepEqual(calls.map(call => call[0]), ['/appAssetLibraryPlacements/p1']);
  await call('apple_delete_asset', client, { mediaType: 'VIDEO', assetId: 'v1' });
  assert.equal(calls[2][0], '/appAssetLibraryVideos/v1');
  assert.equal(calls[2][1].method, 'DELETE');
});

test('ordering requires complete membership, then verifies persisted order', async () => {
  let ids = ['one', 'two']; let writes = 0;
  const client = { request: async (path: string, options: any) => {
    if (options?.method === 'POST') {
      writes++;
      ids = options.body.data.relationships.orderedPlacements.data.map((entry: any) => entry.id);
      return { data: { id: 'order' } };
    }
    return { data: ids.map(id => ({ id })) };
  } };
  await assert.rejects(call('apple_reorder_placements', client, { localizationId: 'l', placementGroup: 'g', placementIds: ['one'] }), /every current placement/);
  assert.equal(writes, 0);
  const result = await call('apple_reorder_placements', client, { localizationId: 'l', placementGroup: 'g', placementIds: ['two', 'one'] });
  assert.deepEqual(result.data.map((entry: any) => entry.id), ['two', 'one']);
  assert.equal(writes, 1);
});

test('Korean ALL and TWELVE_PLUS ratings pass through to Apple', async () => {
  for (const rating of ['ALL', 'TWELVE_PLUS']) {
    let payload: any;
    await call('apple_update_age_rating', { request: async (_path: string, options: any) => { payload = options.body; return {}; } }, { ageRatingId: 'rating', koreaAgeRatingOverride: rating });
    assert.equal(payload.data.attributes.koreaAgeRatingOverride, rating);
  }
});

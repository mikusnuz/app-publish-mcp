import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewItemTools } from '../src/apple/review-items.js';
import { isReadTool } from '../src/read-only.js';

const args = { appId: 'app', submissionId: 'sub', platform: 'IOS' };
async function run(name: string, client: any, input: any) {
  const tool = reviewItemTools.find(tool => tool.name === name)!;
  return tool.handler(client, tool.schema.parse(input));
}
function fixture() {
  const calls: any[] = [];
  const data: any[] = [];
  const submission = { data: { id: 'sub', type: 'reviewSubmissions', attributes: { state: 'READY_FOR_REVIEW', platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: 'app' } } } } };
  let throwAfterAttach = false;
  let throwAfterSubmit = false;
  const client = { request: async (path: string, options: any = {}) => {
    calls.push({ path, ...options });
    if (path === '/reviewSubmissions/sub/items') return { data, links: {} };
    if (path === '/reviewSubmissions' && options.method !== 'POST') return { data: [], links: {} };
    if (path === '/reviewSubmissionItems') {
      const item = { ...options.body.data, id: `item-${data.length}` };
      data.push(item);
      if (throwAfterAttach) throw new Error('connection lost');
      return { data: item };
    }
    if (options.method === 'PATCH') {
      submission.data.attributes.state = 'WAITING_FOR_REVIEW';
      if (throwAfterSubmit) throw new Error('connection lost');
    }
    return submission;
  } };
  return { client, calls, data, submission, failAttach: () => { throwAfterAttach = true; }, failSubmit: () => { throwAfterSubmit = true; } };
}

test('review draft creation never submits and refuses an existing draft', async () => {
  const f = fixture();
  await run('apple_create_review_submission', f.client, { appId: 'app' });
  const post = f.calls.find(call => call.method === 'POST');
  assert.deepEqual(post.body.data.attributes, { platform: 'IOS' });
  assert.equal(f.calls.some(call => call.method === 'PATCH'), false);
  await assert.rejects(run('apple_create_review_submission', { request: async () => ({ data: [{ id: 'existing' }] }) }, { appId: 'app' }), /existing/);
});

test('all supported asset, CPP and v2 PPO relationships attach without starting review', async () => {
  const cases = {
    appAssetLibraryImages: 'appAssetLibraryImage', appAssetLibraryVideos: 'appAssetLibraryVideo',
    appCustomProductPageVersions: 'appCustomProductPageVersion', appStoreVersionExperiments: 'appStoreVersionExperimentV2',
    appStoreVersions: 'appStoreVersion',
  };
  for (const [resourceType, relationship] of Object.entries(cases)) {
    const f = fixture();
    await run('apple_add_review_submission_item', f.client, { ...args, resourceType, resourceId: 'resource' });
    assert.deepEqual(f.data[0].relationships[relationship], { data: { type: resourceType, id: 'resource' } });
    assert.equal(f.calls.some(call => call.method === 'PATCH'), false);
    const again = await run('apple_add_review_submission_item', f.client, { ...args, resourceType, resourceId: 'resource' });
    assert.equal(again.reconciled, true);
    assert.equal(f.data.length, 1);
  }
});

test('attachment and submission reconcile lost responses without repeating mutations', async () => {
  const f = fixture(); f.failAttach(); f.failSubmit();
  const attached = await run('apple_add_review_submission_item', f.client, { ...args, resourceType: 'appAssetLibraryImages', resourceId: 'image' });
  assert.equal(attached.reconciled, true);
  const sent = await run('apple_submit_review_submission', f.client, { ...args, itemIds: ['item-0'] });
  assert.equal(sent.reconciled, true);
  await run('apple_submit_review_submission', f.client, { ...args, itemIds: ['item-0'] });
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
});

test('submission checks app/platform, state and complete item set before any write', async () => {
  for (const variant of ['app', 'platform', 'state', 'items']) {
    const f = fixture();
    if (variant === 'app') f.submission.data.relationships.app.data.id = 'different';
    if (variant === 'platform') f.submission.data.attributes.platform = 'MAC_OS';
    if (variant === 'state') f.submission.data.attributes.state = 'CANCELING';
    f.data.push({ id: variant === 'items' ? 'unexpected' : 'expected' });
    await assert.rejects(run('apple_submit_review_submission', f.client, { ...args, itemIds: ['expected'] }));
    assert.equal(f.calls.some(call => ['POST', 'PATCH', 'DELETE'].includes(call.method)), false);
  }
});

test('failed attach retains draft; review bridge mutations are excluded from read-only', async () => {
  const f = fixture();
  const original = f.client.request;
  f.client.request = async (path, options) => {
    if (options?.method === 'POST') throw new Error('rejected');
    return original(path, options);
  };
  await assert.rejects(run('apple_add_review_submission_item', f.client, { ...args, resourceType: 'appAssetLibraryImages', resourceId: 'image' }), /sub.*retained/);
  assert.equal(f.calls.some(call => call.method === 'DELETE' || call.method === 'PATCH'), false);
  for (const tool of reviewItemTools) assert.equal(isReadTool(tool.name), /_(get|list)_/.test(tool.name));
});

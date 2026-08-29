import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GoogleClient } from '../src/google/client.js';
import { googleTools } from '../src/google/tools.js';

function googleTool(name: string) {
  const tool = googleTools.find(candidate => candidate.name === name);
  assert.ok(tool, `Missing Google tool ${name}`);
  return tool;
}

test('AAB release flow tools are registered exactly once', () => {
  const names = [
    'google_get_edit',
    'google_list_bundles',
    'google_list_apks',
    'google_list_release_statuses',
    'google_update_data_safety',
  ];
  for (const name of names) {
    assert.equal(googleTools.filter(tool => tool.name === name).length, 1, name);
  }
});

test('Google edit and artifact readers expose resumable release state', async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  const client = Object.create(GoogleClient.prototype) as any;
  client.publisher = {
    edits: {
      get: async (params: unknown) => {
        calls.push({ method: 'edits.get', params });
        return { data: { id: 'edit-1', expiryTimeSeconds: '1234' } };
      },
      bundles: {
        list: async (params: unknown) => {
          calls.push({ method: 'bundles.list', params });
          return { data: { bundles: [{ versionCode: 101, sha256: 'bundle-sha' }] } };
        },
      },
      apks: {
        list: async (params: unknown) => {
          calls.push({ method: 'apks.list', params });
          return { data: { apks: [{ versionCode: 100, sha256: 'apk-sha' }] } };
        },
      },
    },
  };

  assert.deepEqual(await client.getEdit('com.example.app', 'edit-1'), {
    id: 'edit-1',
    expiryTimeSeconds: '1234',
  });
  assert.deepEqual(await client.listBundles('com.example.app', 'edit-1'), [
    { versionCode: 101, sha256: 'bundle-sha' },
  ]);
  assert.deepEqual(await client.listApks('com.example.app', 'edit-1'), [
    { versionCode: 100, sha256: 'apk-sha' },
  ]);
  assert.deepEqual(calls, [
    {
      method: 'edits.get',
      params: { packageName: 'com.example.app', editId: 'edit-1' },
    },
    {
      method: 'bundles.list',
      params: { packageName: 'com.example.app', editId: 'edit-1' },
    },
    {
      method: 'apks.list',
      params: { packageName: 'com.example.app', editId: 'edit-1' },
    },
  ]);
});

test('release status reader uses the post-commit applications resource', async () => {
  let params: unknown;
  const client = Object.create(GoogleClient.prototype) as any;
  client.publisher = {
    applications: {
      tracks: {
        releases: {
          list: async (value: unknown) => {
            params = value;
            return {
              data: {
                releases: [{
                  releaseName: '1.2.0',
                  track: 'wear:production',
                  releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW',
                  activeArtifacts: [{ versionCode: 101 }],
                }],
              },
            };
          },
        },
      },
    },
  };

  const releases = await client.listReleaseSummaries('com.example.app', 'wear:production');
  assert.deepEqual(params, {
    parent: 'applications/com.example.app/tracks/wear:production',
  });
  assert.equal(releases[0].releaseLifecycleState, 'RELEASE_LIFECYCLE_STATE_IN_REVIEW');
});

test('release status reader rejects empty or slash-containing parent segments', () => {
  const schema = googleTool('google_list_release_statuses').schema;
  assert.deepEqual(schema.parse({
    packageName: ' com.example.app ',
    track: ' wear:production ',
  }), {
    packageName: 'com.example.app',
    track: 'wear:production',
  });

  for (const invalid of [
    { packageName: '', track: 'production' },
    { packageName: '   ', track: 'production' },
    { packageName: 'applications/com.example.app', track: 'production' },
    { packageName: 'com.example.app', track: '' },
    { packageName: 'com.example.app', track: '   ' },
    { packageName: 'com.example.app', track: 'wear/production' },
  ]) {
    assert.throws(() => schema.parse(invalid));
  }
});

test('release mutation tools require unique canonical Google Play version codes', () => {
  const cases = [
    {
      name: 'google_create_release',
      input: {
        packageName: 'com.example.app',
        editId: 'edit-1',
        track: 'production',
      },
    },
    {
      name: 'google_promote_release',
      input: {
        packageName: 'com.example.app',
        editId: 'edit-1',
        fromTrack: 'beta',
        toTrack: 'production',
      },
    },
    {
      name: 'google_halt_release',
      input: {
        packageName: 'com.example.app',
        editId: 'edit-1',
        track: 'production',
      },
    },
  ];
  const invalidVersionCodes = [
    [],
    ['0'],
    ['01'],
    ['-1'],
    ['1.0'],
    [' 1'],
    ['2100000001'],
    ['9223372036854775807'],
    ['1', '1'],
  ];

  for (const { name, input } of cases) {
    const schema = googleTool(name).schema;
    assert.doesNotThrow(() => schema.parse({
      ...input,
      versionCodes: ['2100000000'],
    }));
    for (const versionCodes of invalidVersionCodes) {
      assert.throws(
        () => schema.parse({ ...input, versionCodes }),
        undefined,
        `${name} accepted ${JSON.stringify(versionCodes)}`,
      );
    }
  }
});

test('create release supports valid country targeting and in-app update priority', async () => {
  const tool = googleTool('google_create_release');
  const input = tool.schema.parse({
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'production',
    versionCodes: ['101'],
    status: 'inProgress',
    userFraction: 0.25,
    countryTargeting: {
      countries: ['KR', 'US'],
      includeRestOfWorld: false,
    },
    inAppUpdatePriority: 5,
  });
  let releases: any[] = [];
  const client = {
    getTrack: async () => ({ releases: [] }),
    updateTrack: async (_packageName: string, _editId: string, _track: string, value: any[]) => {
      releases = value;
      return { releases: value };
    },
  };

  await tool.handler(client as any, input);
  assert.deepEqual(releases, [{
    status: 'inProgress',
    versionCodes: ['101'],
    userFraction: 0.25,
    countryTargeting: {
      countries: ['KR', 'US'],
      includeRestOfWorld: false,
    },
    inAppUpdatePriority: 5,
  }]);

  assert.throws(() => tool.schema.parse({
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'production',
    versionCodes: ['101'],
    inAppUpdatePriority: 6,
  }));
  assert.throws(() => tool.schema.parse({
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'production',
    versionCodes: ['101'],
    status: 'inProgress',
    userFraction: 0.25,
    countryTargeting: { countries: ['US', 'US'] },
  }));
  await assert.rejects(
    tool.handler(client as any, tool.schema.parse({
      packageName: 'com.example.app',
      editId: 'edit-1',
      track: 'beta',
      versionCodes: ['101'],
      status: 'inProgress',
      userFraction: 0.25,
      countryTargeting: { countries: ['US'] },
    })),
    /only supported for inProgress releases on a production track/,
  );
});

test('create release preserves an existing in-progress country-targeting scope', async () => {
  const tool = googleTool('google_create_release');
  const existingRelease = {
    versionCodes: ['101'],
    status: 'inProgress',
    countryTargeting: {
      countries: ['KR', 'US'],
      includeRestOfWorld: true,
    },
  };
  let updateCount = 0;
  const client = {
    getTrack: async () => ({ releases: [existingRelease] }),
    updateTrack: async () => {
      updateCount += 1;
      return {};
    },
  };
  const baseInput = {
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'production',
    versionCodes: ['101'],
    status: 'inProgress' as const,
    userFraction: 0.5,
  };

  await assert.rejects(
    tool.handler(client as any, tool.schema.parse({
      ...baseInput,
      countryTargeting: {
        countries: ['US'],
        includeRestOfWorld: true,
      },
    })),
    /cannot remove countries KR/,
  );
  await assert.rejects(
    tool.handler(client as any, tool.schema.parse({
      ...baseInput,
      countryTargeting: {
        countries: ['KR', 'US'],
        includeRestOfWorld: false,
      },
    })),
    /cannot remove includeRestOfWorld/,
  );
  await tool.handler(client as any, tool.schema.parse({
    ...baseInput,
    countryTargeting: {
      countries: ['JP', 'KR', 'US'],
      includeRestOfWorld: true,
    },
  }));
  assert.equal(updateCount, 1);
});

test('promote release applies explicit targeting and priority to the target release', async () => {
  const tool = googleTool('google_promote_release');
  const input = tool.schema.parse({
    packageName: 'com.example.app',
    editId: 'edit-1',
    fromTrack: 'beta',
    toTrack: 'production',
    versionCodes: ['200'],
    userFraction: 0.1,
    countryTargeting: { countries: ['JP'] },
    inAppUpdatePriority: 4,
  });
  let releases: any[] = [];
  const client = {
    getTrack: async (_packageName: string, _editId: string, track: string) => track === 'beta'
      ? { releases: [{ versionCodes: ['200'], inAppUpdatePriority: 1 }] }
      : { releases: [] },
    updateTrack: async (_packageName: string, _editId: string, _track: string, value: any[]) => {
      releases = value;
      return { releases: value };
    },
  };

  await tool.handler(client as any, input);
  assert.deepEqual(releases, [{
    versionCodes: ['200'],
    status: 'inProgress',
    inAppUpdatePriority: 4,
    userFraction: 0.1,
    countryTargeting: {
      countries: ['JP'],
      includeRestOfWorld: false,
    },
  }]);
});

test('Data Safety submission sends the exact reviewed CSV contents', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-data-safety-'));
  try {
    const csvPath = join(directory, 'data-safety.csv');
    const emptyPath = join(directory, 'empty.csv');
    const csv = 'Question ID,Answer\ndata_type_1,TRUE\n';
    writeFileSync(csvPath, csv);
    writeFileSync(emptyPath, '');

    let params: any;
    const client = Object.create(GoogleClient.prototype) as any;
    client.publisher = {
      applications: {
        dataSafety: async (value: unknown) => {
          params = value;
          return { data: {} };
        },
      },
    };

    await client.updateDataSafety('com.example.app', csvPath);
    assert.deepEqual(params, {
      packageName: 'com.example.app',
      requestBody: { safetyLabels: csv },
    });
    await assert.rejects(
      client.updateDataSafety('com.example.app', emptyPath),
      /must not be empty/,
    );
    await assert.rejects(
      client.updateDataSafety('com.example.app', join(directory, 'data-safety.txt')),
      /must use a \.csv file/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

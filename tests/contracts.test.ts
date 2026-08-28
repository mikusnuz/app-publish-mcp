import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { AppleApiError, AppleClient } from '../src/apple/client.js';
import { appleTools } from '../src/apple/tools.js';
import {
  createOAuthState,
  createPkceValues,
  GOOGLE_OAUTH_CALLBACK_HOST,
  loadSavedGoogleToken,
  oauthStateMatches,
  saveGoogleToken,
} from '../src/auth.js';
import { GoogleClient } from '../src/google/client.js';
import {
  googleTools,
  selectTrackReleaseByVersionCodes,
} from '../src/google/tools.js';

function appleTool(name: string) {
  const tool = appleTools.find(candidate => candidate.name === name);
  assert.ok(tool, `Missing Apple tool ${name}`);
  return tool;
}

function googleTool(name: string) {
  const tool = googleTools.find(candidate => candidate.name === name);
  assert.ok(tool, `Missing Google tool ${name}`);
  return tool;
}

test('llms tool inventory matches every registered Apple and Google tool', () => {
  const inventory = readFileSync(new URL('../llms.txt', import.meta.url), 'utf8');
  const documented = [...inventory.matchAll(/^- ((?:apple|google)_[a-z0-9_]+)\s+—/gm)]
    .map(match => match[1])
    .sort();
  const registered = [...appleTools, ...googleTools]
    .map(tool => tool.name)
    .sort();

  assert.equal(registered.length, 116);
  assert.deepEqual(documented, registered);
});

test('apple_set_price sends the complete manual schedule with unique inline IDs', async () => {
  const tool = appleTool('apple_set_price');
  const calls: any[] = [];
  const client = { request: async (...args: any[]) => { calls.push(args); return { ok: true }; } };
  const input = tool.schema.parse({
    appId: 'app-1',
    baseTerritoryId: 'USA',
    manualPrices: [
      { appPricePointId: 'point-current', endDate: '2026-08-31' },
      { appPricePointId: 'point-future', startDate: '2026-09-01' },
    ],
  });

  await tool.handler(client as any, input);

  assert.equal(calls[0][0], '/appPriceSchedules');
  assert.equal(calls[0][1].method, 'POST');
  const body = calls[0][1].body;
  assert.deepEqual(body.data.relationships.baseTerritory.data, { type: 'territories', id: 'USA' });
  assert.deepEqual(body.data.relationships.manualPrices.data, [
    { type: 'appPrices', id: '${newprice-0}' },
    { type: 'appPrices', id: '${newprice-1}' },
  ]);
  assert.deepEqual(body.included[0].relationships.appPricePoint.data, {
    type: 'appPricePoints',
    id: 'point-current',
  });
  assert.equal(body.included[0].attributes.endDate, '2026-08-31');
  assert.equal(body.included[1].attributes.startDate, '2026-09-01');
  assert.equal(body.included[0].relationships.priceTier, undefined);
});

test('apple_get_pricing follows every manual and automatic price page', async () => {
  const tool = appleTool('apple_get_pricing');
  const calls: string[] = [];
  const manualNext = 'https://api.appstoreconnect.apple.com/v1/appPriceSchedules/schedule-1/manualPrices?cursor=next';
  const client = {
    request: async (path: string) => {
      calls.push(path);
      if (path === '/apps/app-1/appPriceSchedule') {
        return { data: { type: 'appPriceSchedules', id: 'schedule-1' } };
      }
      if (path === '/appPriceSchedules/schedule-1/manualPrices') {
        return { data: [{ id: 'manual-1' }], links: { next: manualNext } };
      }
      if (path === manualNext) {
        return { data: [{ id: 'manual-2' }], links: {} };
      }
      if (path === '/appPriceSchedules/schedule-1/automaticPrices') {
        return { data: [{ id: 'automatic-1' }], links: {} };
      }
      throw new Error(`Unexpected Apple path ${path}`);
    },
  };

  const result = await tool.handler(client as any, { appId: 'app-1' });

  assert.deepEqual(result.manualPrices.data.map((price: any) => price.id), [
    'manual-1',
    'manual-2',
  ]);
  assert.deepEqual(result.automaticPrices.data.map((price: any) => price.id), [
    'automatic-1',
  ]);
  assert.ok(calls.includes(manualNext));
});

test('apple_list_availability follows the current appAvailabilityV2 territory relationship', async () => {
  const tool = appleTool('apple_list_availability');
  const related = 'https://api.appstoreconnect.apple.com/v2/appAvailabilities/availability-1/territoryAvailabilities';
  const calls: any[] = [];
  const client = {
    request: async (...args: any[]) => {
      calls.push(args);
      if (calls.length === 1) {
        return {
          data: {
            id: 'availability-1',
            relationships: { territoryAvailabilities: { links: { related } } },
          },
        };
      }
      return { data: [{ id: 'USA' }] };
    },
  };

  const result = await tool.handler(client as any, { appId: 'app-1' });

  assert.equal(calls[0][0], '/apps/app-1/appAvailabilityV2');
  assert.equal(calls[1][0], related);
  assert.deepEqual(calls[1][1].params, { include: 'territory', limit: '200' });
  assert.equal(result.appAvailability.id, 'availability-1');
});

test('Apple age-rating schema accepts current fields and omits removed gamblingAndContests', async () => {
  const tool = appleTool('apple_update_age_rating');
  assert.equal('gamblingAndContests' in tool.schema.shape, false);
  const input = tool.schema.parse({
    ageRatingId: 'rating-1',
    advertising: true,
    contests: 'INFREQUENT',
    gambling: false,
    gunsOrOtherWeapons: 'NONE',
    messagingAndChat: true,
    ageAssurance: true,
    socialMediaAgeRestricted: false,
    userGeneratedContent: true,
    ageRatingOverrideV2: 'THIRTEEN_PLUS',
  });
  let request: any;
  await tool.handler({ request: async (...args: any[]) => { request = args; return {}; } } as any, input);
  assert.equal(request[0], '/ageRatingDeclarations/rating-1');
  assert.equal(request[1].body.data.attributes.contests, 'INFREQUENT');
  assert.equal(request[1].body.data.attributes.gambling, false);
});

test('Apple review details are created when the relationship returns 404', async () => {
  const tool = appleTool('apple_update_review_detail');
  const calls: any[] = [];
  const client = {
    request: async (...args: any[]) => {
      calls.push(args);
      if (calls.length === 1) {
        throw new AppleApiError('not found', 404, 'GET', args[0], '');
      }
      return { data: { id: 'detail-1' } };
    },
  };

  await tool.handler(client as any, { versionId: 'version-1', notes: 'Review notes' });
  assert.equal(calls[1][0], '/appStoreReviewDetails');
  assert.equal(calls[1][1].method, 'POST');
});

test('Apple screenshot upload validates size and commits the local MD5 checksum', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-apple-upload-'));
  try {
    const filePath = join(directory, 'screenshot.png');
    writeFileSync(filePath, 'hello');
    const tool = appleTool('apple_upload_screenshot');
    const calls: any[] = [];
    const client = {
      request: async (...args: any[]) => {
        calls.push(args);
        if (args[0] === '/appScreenshots') {
          return {
            data: {
              id: 'screenshot-1',
              attributes: {
                uploadOperations: [{ method: 'PUT', url: 'https://upload.example/chunk' }],
                sourceFileChecksum: null,
              },
            },
          };
        }
        return { data: { id: 'screenshot-1' } };
      },
      uploadOperation: async (...args: any[]) => {
        calls.push(['uploadOperation', ...args]);
      },
    };

    await assert.rejects(
      tool.handler(client as any, {
        screenshotSetId: 'set-1',
        fileName: 'screenshot.png',
        fileSize: 4,
        filePath,
      }),
      /fileSize mismatch/,
    );
    assert.equal(calls.length, 0);

    await tool.handler(client as any, {
      screenshotSetId: 'set-1',
      fileName: 'screenshot.png',
      fileSize: 5,
      filePath,
    });

    const reserveBody = calls.find(call => call[0] === '/appScreenshots')[1].body;
    assert.equal(reserveBody.data.attributes.fileSize, 5);
    const commitBody = calls.find(call => call[0] === '/appScreenshots/screenshot-1')[1].body;
    assert.equal(commitBody.data.attributes.uploaded, true);
    assert.equal(
      commitBody.data.attributes.sourceFileChecksum,
      '5d41402abc4b2a76b9719d911017c592',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_get_next_page only permits official App Store Connect URLs', async () => {
  const tool = appleTool('apple_get_next_page');
  await assert.rejects(
    tool.handler({ request: async () => ({}) } as any, { nextUrl: 'https://example.com/v1/apps' }),
    /official App Store Connect API origin/,
  );
  let nextPath = '';
  await tool.handler({
    request: async (path: string) => { nextPath = path; return {}; },
  } as any, {
    nextUrl: 'https://api.appstoreconnect.apple.com/v3/appPricePoints/example',
  });
  assert.equal(nextPath, 'https://api.appstoreconnect.apple.com/v3/appPricePoints/example');
});

test('Apple GET requests retry a malformed successful JSON response', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let calls = 0;
  try {
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => { throw new SyntaxError('truncated JSON'); },
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'app-1' } }),
      } as Response;
    }) as typeof fetch;
    globalThis.setTimeout = ((callback: (...args: any[]) => void) => {
      callback();
      return 0 as any;
    }) as typeof setTimeout;

    const client = new AppleClient({
      keyId: 'key',
      issuerId: 'issuer',
      p8Path: '/not-used',
    });
    (client as any).getToken = () => 'token';
    const result = await client.request('/apps/app-1');

    assert.equal(calls, 2);
    assert.equal(result.data.id, 'app-1');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('individual Apple keys generate sub=user tokens without iss', () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-apple-key-'));
  try {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const keyPath = join(directory, 'AuthKey_TEST.p8');
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const client = new AppleClient({
      keyId: 'TESTKEY',
      keyType: 'INDIVIDUAL',
      p8Path: keyPath,
    });
    const token = (client as any).getToken();
    const payload = jwt.decode(token) as jwt.JwtPayload;
    assert.equal(payload.sub, 'user');
    assert.equal(payload.iss, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('google_commit_edit defaults to ERROR_IF_IN_REVIEW', async () => {
  const tool = googleTool('google_commit_edit');
  const input = tool.schema.parse({ packageName: 'com.example.app', editId: 'edit-1' });
  let received: any;
  const result = await tool.handler({
    commitEdit: async (...args: any[]) => { received = args; return { id: 'edit-1' }; },
  } as any, input);
  assert.equal(received[2].changesInReviewBehavior, 'ERROR_IF_IN_REVIEW');
  assert.deepEqual(result, { id: 'edit-1' });
});

test('release selection requires an exact version-code set', () => {
  const selected = selectTrackReleaseByVersionCodes(
    [{ versionCodes: ['100', '101'] }, { versionCodes: ['102'] }],
    ['101', '100'],
  );
  assert.deepEqual(selected.versionCodes, ['100', '101']);
  assert.throws(
    () => selectTrackReleaseByVersionCodes([{ versionCodes: ['100', '101'] }], ['101']),
    /No source release exactly matches/,
  );
});

test('google_create_release sends only the desired release change', async () => {
  const tool = googleTool('google_create_release');
  const input = tool.schema.parse({
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'beta',
    versionCodes: ['101'],
    status: 'draft',
  });
  let updated: any;
  const client = {
    updateTrack: async (...args: any[]) => { updated = args; return { releases: args[3] }; },
  };

  await tool.handler(client as any, input);
  assert.deepEqual(updated[3].map((release: any) => release.versionCodes), [['101']]);

  assert.doesNotThrow(() => tool.schema.parse({
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'wear:production',
    versionCodes: ['101'],
  }));
  assert.doesNotThrow(() => googleTool('google_get_track').schema.parse({
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'wear:production',
  }));
});

test('google_promote_release selects an explicit source release and sends only that change', async () => {
  const selected = selectTrackReleaseByVersionCodes(
    [{ versionCodes: ['200'] }, { versionCodes: ['199'] }],
    ['199'],
  );
  assert.deepEqual(selected.versionCodes, ['199']);

  const tool = googleTool('google_promote_release');
  const input = tool.schema.parse({
    packageName: 'com.example.app',
    editId: 'edit-1',
    fromTrack: 'beta',
    toTrack: 'production',
    versionCodes: ['199'],
  });
  let updated: any;
  const client = {
    getTrack: async () => ({
      releases: [{ versionCodes: ['200'] }, { versionCodes: ['199'], name: 'chosen' }],
    }),
    updateTrack: async (...args: any[]) => { updated = args; return { releases: args[3] }; },
  };

  await tool.handler(client as any, input);
  assert.deepEqual(updated[3].map((release: any) => release.versionCodes), [['199']]);
  assert.equal(updated[3][0].name, 'chosen');
});

test('google_halt_release selects and halts exact in-progress or completed releases', async () => {
  const tool = googleTool('google_halt_release');
  const updates: any[] = [];
  const client = {
    getTrack: async () => ({
      releases: [
        {
          versionCodes: ['300'],
          status: 'inProgress',
          userFraction: 0.25,
          countryTargeting: { countries: ['US'], includeRestOfWorld: false },
        },
        { versionCodes: ['299'], status: 'completed' },
        { versionCodes: ['298'], status: 'draft' },
      ],
    }),
    updateTrack: async (...args: any[]) => { updates.push(args); return {}; },
  };
  await tool.handler(client as any, {
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'production',
    versionCodes: ['300'],
  });
  await tool.handler(client as any, {
    packageName: 'com.example.app',
    editId: 'edit-1',
    track: 'production',
    versionCodes: ['299'],
  });
  assert.deepEqual(updates[0][3], [{
    versionCodes: ['300'],
    status: 'halted',
  }]);
  assert.deepEqual(updates[1][3], [{
    versionCodes: ['299'],
    status: 'halted',
  }]);
  await assert.rejects(
    tool.handler(client as any, {
      packageName: 'com.example.app',
      editId: 'edit-1',
      track: 'production',
      versionCodes: ['298'],
    }),
    /cannot be halted from status draft/,
  );
});

test('one-time product creation always supplies updateMask and enforces buy xor rent', async () => {
  const tool = googleTool('google_create_one_time_product');
  const baseInput = {
    packageName: 'com.example.app',
    productId: 'remove_ads',
    listings: [{ languageCode: 'en-US', title: 'Remove ads', description: 'Remove ads forever' }],
    purchaseOptions: [{
      purchaseOptionId: 'buy-standard',
      buy: {},
      regionalConfigs: [{ regionCode: 'US', priceMicros: '3990000', currency: 'USD' }],
    }],
  };
  let received: any;
  await tool.handler({
    upsertOneTimeProduct: async (...args: any[]) => { received = args; return {}; },
  } as any, tool.schema.parse(baseInput));
  assert.equal(received[3].allowMissing, true);
  assert.equal(received[3].updateMask, 'listings,purchaseOptions');

  const invalid = tool.schema.parse({
    ...baseInput,
    purchaseOptions: [{
      ...baseInput.purchaseOptions[0],
      rent: { rentalPeriod: 'P30D' },
    }],
  });
  await assert.rejects(
    tool.handler({ upsertOneTimeProduct: async () => ({}) } as any, invalid),
    /exactly one of buy or rent/,
  );

  assert.doesNotThrow(() => tool.schema.parse({
    ...baseInput,
    purchaseOptions: [{
      ...baseInput.purchaseOptions[0],
      regionalConfigs: [{
        regionCode: 'US',
        priceMicros: '3990000',
        currency: 'USD',
        availability: 'AVAILABLE_IF_RELEASED',
      }],
    }],
  }));
  assert.throws(() => tool.schema.parse({
    ...baseInput,
    purchaseOptions: [{
      ...baseInput.purchaseOptions[0],
      regionalConfigs: [{
        regionCode: 'US',
        priceMicros: '3990000',
        currency: 'USD',
        availability: 'NOT_AVAILABLE',
      }],
    }],
  }));

  const unavailable = tool.schema.parse({
    ...baseInput,
    purchaseOptions: [{
      ...baseInput.purchaseOptions[0],
      regionalConfigs: [{
        regionCode: 'US',
        priceMicros: '3990000',
        currency: 'USD',
        availability: 'NO_LONGER_AVAILABLE',
      }],
    }],
  });
  await assert.rejects(
    tool.handler({ upsertOneTimeProduct: async () => ({}) } as any, unavailable),
    /only valid when updating/,
  );
});

test('unsupported subscription archive tool is not registered', () => {
  assert.equal(googleTools.some(tool => tool.name === 'google_archive_subscription'), false);
  assert.ok(googleTools.some(tool => tool.name === 'google_deactivate_subscription_base_plan'));
});

test('subscription creation supports every current base-plan union and omits output-only state', async () => {
  const tool = googleTool('google_create_subscription');
  const rawInput = {
    packageName: 'com.example.app',
    productId: 'pro_access',
    listings: [{ languageCode: 'en-US', title: 'Pro', description: 'Pro access' }],
    basePlans: [
      {
        basePlanId: 'monthly',
        autoRenewing: { billingPeriodDuration: 'P1M' },
        regionalConfigs: [{ regionCode: 'US', priceMicros: '4990000', currency: 'USD' }],
      },
      {
        basePlanId: 'prepaid',
        prepaid: { billingPeriodDuration: 'P1M', timeExtension: 'TIME_EXTENSION_ACTIVE' },
        regionalConfigs: [{ regionCode: 'US', priceMicros: '4990000', currency: 'USD' }],
      },
      {
        basePlanId: 'installments',
        installments: {
          billingPeriodDuration: 'P1M',
          committedPaymentsCount: 12,
          renewalType: 'RENEWAL_TYPE_RENEWS_WITHOUT_COMMITMENT',
        },
        regionalConfigs: [{ regionCode: 'US', priceMicros: '4990000', currency: 'USD' }],
        otherRegionsConfig: {
          usdPriceMicros: '4990000',
          eurPriceMicros: '4490000',
          newSubscriberAvailability: true,
        },
      },
    ],
  };
  const input = tool.schema.parse(rawInput);
  let body: any;
  await tool.handler({
    createSubscription: async (_packageName: string, _productId: string, value: any) => {
      body = value;
      return value;
    },
  } as any, input);
  assert.equal(body.basePlans[0].state, undefined);
  assert.equal(body.basePlans[0].autoRenewingBasePlanType.billingPeriodDuration, 'P1M');
  assert.equal(body.basePlans[1].prepaidBasePlanType.timeExtension, 'TIME_EXTENSION_ACTIVE');
  assert.equal(body.basePlans[2].installmentsBasePlanType.committedPaymentsCount, 12);
  assert.equal(body.basePlans[2].otherRegionsConfig.usdPrice.currencyCode, 'USD');

  assert.throws(() => tool.schema.parse({
    ...rawInput,
    basePlans: [{
      ...rawInput.basePlans[0],
      prepaid: { billingPeriodDuration: 'P1M' },
    }],
  }), /exactly one/);

  assert.doesNotThrow(() => tool.schema.parse({
    ...rawInput,
    productId: 'p'.repeat(40),
    listings: [{
      languageCode: 'en-US',
      title: 'T'.repeat(55),
      description: 'D'.repeat(200),
      benefits: ['B'.repeat(40)],
    }],
    basePlans: [{ ...rawInput.basePlans[0], offerTags: ['premium-2026'] }],
  }));
  assert.throws(() => tool.schema.parse({ ...rawInput, productId: 'p'.repeat(41) }));
  assert.throws(() => tool.schema.parse({
    ...rawInput,
    listings: [{ languageCode: 'en-US', title: 'T'.repeat(56) }],
  }));
  assert.throws(() => tool.schema.parse({
    ...rawInput,
    listings: [{ languageCode: 'en-US', title: 'Pro', benefits: ['B'.repeat(41)] }],
  }));
  assert.throws(() => tool.schema.parse({
    ...rawInput,
    basePlans: [{ ...rawInput.basePlans[0], offerTags: ['Invalid_Tag'] }],
  }));
  assert.throws(() => tool.schema.parse({
    ...rawInput,
    basePlans: [{ ...rawInput.basePlans[0], basePlanId: 'bad-' }],
  }));
  assert.throws(() => tool.schema.parse({
    ...rawInput,
    basePlans: [
      {
        ...rawInput.basePlans[0],
        basePlanId: 'legacy-monthly',
        autoRenewing: {
          ...rawInput.basePlans[0].autoRenewing,
          legacyCompatible: true,
        },
      },
      {
        ...rawInput.basePlans[0],
        basePlanId: 'legacy-yearly',
        autoRenewing: {
          billingPeriodDuration: 'P1Y',
          legacyCompatible: true,
        },
      },
    ],
  }), /At most one/);
});

test('one-time product schemas enforce new-region and offer-tag contracts', () => {
  const tool = googleTool('google_create_one_time_product');
  const baseInput = {
    packageName: 'com.example.app',
    productId: 'remove_ads',
    listings: [{ languageCode: 'en-US', title: 'Remove ads', description: 'Forever' }],
    purchaseOptions: [{
      purchaseOptionId: 'buy-standard',
      buy: {},
      regionalConfigs: [{ regionCode: 'US', priceMicros: '3990000', currency: 'USD' }],
      newRegionsConfig: {
        availability: 'AVAILABLE',
        usdPriceMicros: '3990000',
        eurPriceMicros: '3490000',
      },
      offerTags: ['standard-buy'],
    }],
    offerTags: ['premium'],
  };
  assert.doesNotThrow(() => tool.schema.parse(baseInput));
  assert.doesNotThrow(() => tool.schema.parse({ ...baseInput, productId: 'p'.repeat(41) }));
  assert.throws(() => tool.schema.parse({
    ...baseInput,
    purchaseOptions: [{
      ...baseInput.purchaseOptions[0],
      newRegionsConfig: {
        ...baseInput.purchaseOptions[0].newRegionsConfig,
        availability: 'AVAILABLE_IF_RELEASED',
      },
    }],
  }));
  assert.throws(() => tool.schema.parse({ ...baseInput, offerTags: ['premium_tag'] }));
  assert.throws(() => tool.schema.parse({
    ...baseInput,
    purchaseOptions: [{ ...baseInput.purchaseOptions[0], offerTags: ['x'.repeat(21)] }],
  }));
});

test('one-time product updates preserve new-region and tax settings', async () => {
  const tool = googleTool('google_update_one_time_product');
  let received: any;
  const input = tool.schema.parse({
    packageName: 'com.example.app',
    productId: 'remove_ads',
    listings: [{ languageCode: 'en-US', title: 'Remove ads', description: 'Forever' }],
    purchaseOptions: [{
      purchaseOptionId: 'buy-standard',
      buy: { legacyCompatible: true },
      regionalConfigs: [{ regionCode: 'US', priceMicros: '3990000', currency: 'USD' }],
      newRegionsConfig: {
        availability: 'AVAILABLE',
        usdPriceMicros: '3990000',
        eurPriceMicros: '3490000',
      },
      taxAndComplianceSettings: { withdrawalRightType: 'WITHDRAWAL_RIGHT_DIGITAL_CONTENT' },
    }],
    offerTags: ['premium'],
    restrictedPaymentCountries: ['US'],
    taxAndComplianceSettings: {
      isTokenizedDigitalAsset: false,
      productTaxCategoryCode: 'AA',
    },
    updateMask: 'listings,purchaseOptions,offerTags,restrictedPaymentCountries,taxAndComplianceSettings',
  });
  await tool.handler({
    upsertOneTimeProduct: async (...args: any[]) => { received = args; return {}; },
  } as any, input);
  const body = received[2];
  assert.equal(body.purchaseOptions[0].newRegionsConfig.usdPrice.currencyCode, 'USD');
  assert.equal(
    body.purchaseOptions[0].taxAndComplianceSettings.withdrawalRightType,
    'WITHDRAWAL_RIGHT_DIGITAL_CONTENT',
  );
  assert.deepEqual(body.restrictedPaymentCountries, { regionCodes: ['US'] });
  assert.equal(body.taxAndComplianceSettings.productTaxCategoryCode, 'AA');
});

test('partial Google listing updates use PATCH', async () => {
  let params: any;
  const client = Object.create(GoogleClient.prototype) as any;
  client.publisher = {
    edits: {
      listings: {
        patch: async (value: any) => { params = value; return { data: value.requestBody }; },
      },
    },
  };
  await client.updateListing('com.example.app', 'edit-1', 'en-US', { title: 'New title' });
  assert.deepEqual(params.requestBody, { title: 'New title' });
});

test('Google media uploads override the short request timeout and disable stream retries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-upload-'));
  try {
    const imagePath = join(directory, 'image.png');
    const bundlePath = join(directory, 'app.aab');
    const apkPath = join(directory, 'app.apk');
    writeFileSync(imagePath, Buffer.from([0]));
    writeFileSync(bundlePath, Buffer.from([0]));
    writeFileSync(apkPath, Buffer.from([0]));

    const options: any[] = [];
    const capture = async (params: any, requestOptions: any) => {
      await new Promise<void>((resolve, reject) => {
        params.media.body.once('error', reject);
        params.media.body.once('end', resolve);
        params.media.body.resume();
      });
      options.push(requestOptions);
      return { data: {} };
    };
    const client = Object.create(GoogleClient.prototype) as any;
    client.publisher = {
      edits: {
        images: { upload: capture },
        bundles: { upload: capture },
        apks: { upload: capture },
      },
    };

    await client.uploadImage('com.example.app', 'edit-1', 'en-US', 'phoneScreenshots', imagePath);
    await client.uploadBundle('com.example.app', 'edit-1', bundlePath);
    await client.uploadApk('com.example.app', 'edit-1', apkPath);

    assert.equal(options.length, 3);
    for (const requestOptions of options) {
      assert.equal(requestOptions.retry, false);
      assert.ok(requestOptions.timeout >= 10 * 60_000);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('OAuth helpers use loopback-only callbacks, random state, and private credential files', () => {
  assert.equal(GOOGLE_OAUTH_CALLBACK_HOST, '127.0.0.1');
  const firstState = createOAuthState();
  const secondState = createOAuthState();
  assert.match(firstState, /^[a-f0-9]{64}$/);
  assert.notEqual(firstState, secondState);
  assert.equal(oauthStateMatches(firstState, firstState), true);
  assert.equal(oauthStateMatches(firstState, secondState), false);
  assert.equal(oauthStateMatches(firstState, null), false);
  const pkce = createPkceValues();
  assert.match(pkce.codeVerifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(
    pkce.codeChallenge,
    createHash('sha256').update(pkce.codeVerifier).digest('base64url'),
  );

  const directory = mkdtempSync(join(tmpdir(), 'app-publish-google-auth-'));
  try {
    const tokenPath = join(directory, 'credentials', 'google.json');
    saveGoogleToken({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      savedAt: '2026-08-28T00:00:00.000Z',
    }, tokenPath);
    assert.equal(statSync(tokenPath).mode & 0o777, 0o600);
    assert.equal(statSync(join(directory, 'credentials')).mode & 0o777, 0o700);
    assert.equal(JSON.parse(readFileSync(tokenPath, 'utf8')).refreshToken, 'refresh-token');
    assert.equal(loadSavedGoogleToken(tokenPath)?.clientId, 'client-id');

    writeFileSync(tokenPath, JSON.stringify({ clientId: 'client-id', refreshToken: '' }));
    assert.equal(loadSavedGoogleToken(tokenPath), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

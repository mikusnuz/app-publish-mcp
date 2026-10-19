import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { AppleClient } from '../src/apple/client.js';
import { mergeSegments, parseDelimited, tableResult } from '../src/apple/reports.js';
import { appleTools } from '../src/apple/tools.js';
import { googleTools } from '../src/google/tools.js';
import { flattenRows, intervalParams } from '../src/google/vitals.js';
import { isReadOnlyMode, isReadTool } from '../src/read-only.js';
import { readBoundedResponse } from '../src/apple/downloads.js';

async function apple(name: string, client: any, args: any) {
  const tool = appleTools.find(candidate => candidate.name === name);
  assert.ok(tool, name);
  return tool.handler(client, tool.schema.parse(args));
}

async function google(name: string, client: any, args: any) {
  const tool = googleTools.find(candidate => candidate.name === name);
  assert.ok(tool, name);
  return tool.handler(client, tool.schema.parse(args));
}

const SALES_TSV = 'Provider\tSKU\tUnits\tCountry Code\nAPPLE\tpoly\t3\tUS\nAPPLE\tpoly\t2\tDE\nAPPLE\tpoly\t1\tFR\n';

test('report downloads enforce declared and streaming limits', async () => {
  await assert.rejects(readBoundedResponse(new Response('small', { headers: { 'content-length': '100' } }), 10), /limit/);
  await assert.rejects(readBoundedResponse(new Response('too many bytes'), 4), /limit/);
  assert.equal((await readBoundedResponse(new Response('ok'), 4)).toString(), 'ok');
});

test('analytics rejects expired, redirecting or corrupt downloads without leaking signed URLs', async t => {
  let fail = 'checksum';
  t.mock.method(globalThis, 'fetch', async (_url: unknown, opts: RequestInit) => {
    assert.equal(opts.redirect, 'error');
    if (fail === 'network') throw new Error('https://segments.example/file?signature=secret');
    return new Response('wrong bytes');
  });
  const client = { request: async () => ({ data: [{ attributes: {
    url: 'https://segments.example/file?signature=secret', checksum: '0'.repeat(32),
  } }] }) };
  for (fail of ['checksum', 'network']) {
    await assert.rejects(apple('apple_download_analytics_report', client, { instanceId: 'instance' }), (error: any) => {
      assert.doesNotMatch(error.message, /signature|secret|segments.example/);
      assert.match(error.message, /no report was saved/); return true;
    });
  }
  await assert.rejects(apple('apple_download_analytics_report', { request: async () => ({ data: [] }) }, { instanceId: 'instance' }), /No analytics segments/);
});

test('vitals rejects reversed intervals and pagination cycles', async () => {
  const client = { reporting: { vitals: { crashrate: { query: async () => ({ data: { rows: [], nextPageToken: 'same' } }) } } } };
  await assert.rejects(google('google_query_vitals', client, { packageName: 'com.example', startDate: '2026-10-10', endDate: '2026-10-01' }), /startDate/);
  await assert.rejects(google('google_query_vitals', client, { packageName: 'com.example', startDate: '2026-10-01', endDate: '2026-10-10' }), /repeated/);
});

test('apple_get_sales_report sends required filters, unzips TSV and previews rows', async () => {
  const calls: any[] = [];
  const client = {
    async request(path: string, opts: any) {
      calls.push([path, opts]);
      return gzipSync(SALES_TSV);
    },
  };
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-sales-'));
  try {
    const outputPath = join(directory, 'nested', 'sales.tsv');
    const result = await apple('apple_get_sales_report', client, { vendorNumber: '8000', reportDate: '2026-10-11', maxRows: 2, outputPath });
    assert.equal(calls[0][0], '/salesReports');
    assert.equal(calls[0][1].raw, true);
    assert.deepEqual(calls[0][1].params, {
      'filter[vendorNumber]': '8000', 'filter[reportType]': 'SALES', 'filter[reportSubType]': 'SUMMARY',
      'filter[frequency]': 'DAILY', 'filter[reportDate]': '2026-10-11',
    });
    assert.deepEqual(result.columns, ['Provider', 'SKU', 'Units', 'Country Code']);
    assert.equal(result.totalRows, 3);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[1]['Country Code'], 'DE');
    assert.equal(result.truncated, true);
    assert.equal(readFileSync(outputPath, 'utf8'), SALES_TSV);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('sales reports fall back to APPLE_VENDOR_NUMBER and explain when it is missing', async () => {
  const previous = process.env.APPLE_VENDOR_NUMBER;
  try {
    delete process.env.APPLE_VENDOR_NUMBER;
    await assert.rejects(apple('apple_get_sales_report', { request: async () => Buffer.from('') }, {}), /APPLE_VENDOR_NUMBER/);
    process.env.APPLE_VENDOR_NUMBER = '9000';
    let vendor;
    await apple('apple_get_sales_report', { request: async (_: string, opts: any) => { vendor = opts.params['filter[vendorNumber]']; return Buffer.from('a\tb\n'); } }, {});
    assert.equal(vendor, '9000');
  } finally {
    if (previous === undefined) delete process.env.APPLE_VENDOR_NUMBER; else process.env.APPLE_VENDOR_NUMBER = previous;
  }
});

test('apple_download_analytics_report merges gzip segments, keeps one header and hides URLs', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Record<string, Buffer> = {
    'https://segments.example/1?sig=secret': gzipSync('Date\tPage Views\n2026-10-10\t5\n'),
    'https://segments.example/2?sig=secret': gzipSync('Date\tPage Views\n2026-10-11\t7\n'),
  };
  globalThis.fetch = (async (url: URL) => new Response(new Uint8Array(bodies[url.toString()]))) as any;
  try {
    const client = {
      async request(path: string) {
        assert.equal(path, '/analyticsReportInstances/inst-1/segments');
        return { data: Object.keys(bodies).map((url, index) => ({
          type: 'analyticsReportSegments', id: `seg-${index}`, attributes: { url, checksum: createHash('md5').update(bodies[url]).digest('hex'), sizeInBytes: bodies[url].length },
        })), links: {} };
      },
    };
    const result = await apple('apple_download_analytics_report', client, { instanceId: 'inst-1' });
    assert.equal(result.segments, 2);
    assert.equal(result.totalRows, 2);
    assert.deepEqual(result.rows, [{ Date: '2026-10-10', 'Page Views': '5' }, { Date: '2026-10-11', 'Page Views': '7' }]);
    assert.equal(JSON.stringify(result).includes('secret'), false);

    const listed = await apple('apple_list_analytics_report_segments', client, { instanceId: 'inst-1' });
    assert.equal(JSON.stringify(listed).includes('segments.example'), false);
    assert.equal(listed.data[0].attributes.sizeInBytes, Object.values(bodies)[0].length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('apple_create_analytics_report_request defaults to an ONGOING request for the app', async () => {
  let body: any;
  await apple('apple_create_analytics_report_request', { request: async (_: string, opts: any) => { body = opts.body; return {}; } }, { appId: 'app-1' });
  assert.deepEqual(body, { data: {
    type: 'analyticsReportRequests', attributes: { accessType: 'ONGOING' },
    relationships: { app: { data: { type: 'apps', id: 'app-1' } } },
  } });
});

test('apple_create_custom_product_page creates version and localizations inline', async () => {
  let call: any;
  const client = { request: async (path: string, opts: any) => { call = [path, opts]; return { data: { id: 'page-1' } }; } };
  await apple('apple_create_custom_product_page', client, {
    appId: 'app-1', name: 'Puzzle fans', deepLink: 'https://example.com/play',
    templateAppStoreVersionId: 'ver-1',
    localizations: [{ locale: 'en-US', promotionalText: 'Swipe to fill lines' }, { locale: 'de-DE' }],
  });
  const [path, opts] = call;
  assert.equal(path, '/appCustomProductPages');
  assert.equal(opts.method, 'POST');
  const { data, included } = opts.body;
  assert.equal(data.attributes.name, 'Puzzle fans');
  assert.deepEqual(data.relationships.app, { data: { type: 'apps', id: 'app-1' } });
  assert.deepEqual(data.relationships.appStoreVersionTemplate, { data: { type: 'appStoreVersions', id: 'ver-1' } });
  const versionRef = data.relationships.appCustomProductPageVersions.data[0];
  const version = included.find((entry: any) => entry.type === 'appCustomProductPageVersions');
  assert.equal(version.id, versionRef.id);
  assert.equal(version.attributes.deepLink, 'https://example.com/play');
  const localizations = included.filter((entry: any) => entry.type === 'appCustomProductPageLocalizations');
  assert.deepEqual(version.relationships.appCustomProductPageLocalizations.data.map((entry: any) => entry.id), localizations.map((entry: any) => entry.id));
  assert.deepEqual(localizations.map((entry: any) => entry.attributes), [
    { locale: 'en-US', promotionalText: 'Swipe to fill lines' }, { locale: 'de-DE' },
  ]);
  assert.equal(new Set(included.map((entry: any) => entry.id)).size, included.length);
});

test('custom product page rejects two templates and empty updates', async () => {
  const client = { request: async () => assert.fail('must not call Apple') };
  await assert.rejects(apple('apple_create_custom_product_page', client, {
    appId: 'a', name: 'n', localizations: [{ locale: 'en-US' }], templateAppStoreVersionId: 'v', templateCustomProductPageId: 'p',
  }), /either/);
  await assert.rejects(apple('apple_update_custom_product_page', client, { pageId: 'p' }), /Nothing to update/);
  await assert.rejects(apple('apple_update_experiment', client, { experimentId: 'e' }), /Nothing to update/);
});

test('product page optimization uses the v2 experiment resources', async () => {
  const calls: any[] = [];
  const client = { request: async (path: string, opts: any = {}) => { calls.push([path, opts]); return { data: [], links: {} }; } };
  await apple('apple_create_experiment', client, { appId: 'app-1', name: 'Header test', trafficProportion: 50 });
  await apple('apple_update_experiment', client, { experimentId: 'exp-1', started: true });
  await apple('apple_create_experiment_treatment', client, { experimentId: 'exp-1', name: 'B' });
  await apple('apple_list_experiments', client, { appId: 'app-1' });
  assert.deepEqual(calls[0], ['/v2/appStoreVersionExperiments', { method: 'POST', body: { data: {
    type: 'appStoreVersionExperiments', attributes: { name: 'Header test', trafficProportion: 50, platform: 'IOS' },
    relationships: { app: { data: { type: 'apps', id: 'app-1' } } },
  } } }]);
  assert.deepEqual(calls[1][1].body.data, { type: 'appStoreVersionExperiments', id: 'exp-1', attributes: { started: true } });
  assert.deepEqual(calls[2][1].body.data.relationships, { appStoreVersionExperimentV2: { data: { type: 'appStoreVersionExperiments', id: 'exp-1' } } });
  assert.equal(calls[3][0], '/apps/app-1/appStoreVersionExperimentsV2');
});

function vitalsClient(responses: any[]) {
  const queries: any[] = [];
  const set = {
    get: async () => ({ data: { freshnessInfo: { freshnesses: [
      { aggregationPeriod: 'HOURLY', latestEndTime: { year: 2026, month: 10, day: 12, hours: 5 } },
      { aggregationPeriod: 'DAILY', latestEndTime: { year: 2026, month: 10, day: 11 } },
    ] } } }),
    query: async (params: any) => { queries.push(params); return { data: responses.shift() }; },
  };
  return { queries, client: { reporting: { vitals: { crashrate: set, slowstartrate: set } } } };
}

test('google_query_vitals defaults to the freshest 28 days and flattens rows', async () => {
  const { client, queries } = vitalsClient([{ rows: [{
    startTime: { year: 2026, month: 10, day: 10 },
    dimensions: [{ dimension: 'versionCode', int64Value: '42' }],
    metrics: [{ metric: 'crashRate', decimalValue: { value: '0.0123' } }, { metric: 'distinctUsers', decimalValue: { value: '800' } }],
  }] }]);
  const result = await google('google_query_vitals', client, { packageName: 'com.example', dimensions: ['versionCode'] });
  assert.equal(queries[0].name, 'apps/com.example/crashRateMetricSet');
  const spec = queries[0].requestBody.timelineSpec;
  assert.equal(spec.aggregationPeriod, 'DAILY');
  assert.deepEqual([spec.startTime.year, spec.startTime.month, spec.startTime.day], [2026, 9, 13]);
  assert.deepEqual([spec.endTime.year, spec.endTime.month, spec.endTime.day], [2026, 10, 11]);
  assert.equal(spec.endTime.timeZone.id, 'America/Los_Angeles');
  assert.deepEqual(result.rows, [{ date: '2026-10-10', versionCode: '42', crashRate: '0.0123', distinctUsers: '800' }]);
});

test('google_query_vitals adds the dimension a metric set requires and follows pages', async () => {
  const { client, queries } = vitalsClient([
    { rows: [{ dimensions: [{ dimension: 'startType', stringValue: 'COLD' }], metrics: [] }], nextPageToken: 'next' },
    { rows: [{ dimensions: [{ dimension: 'startType', stringValue: 'WARM' }], metrics: [] }] },
  ]);
  const result = await google('google_query_vitals', client, {
    packageName: 'com.example', metricSet: 'slowStart', startDate: '2026-10-01', endDate: '2026-10-05',
  });
  assert.deepEqual(queries[0].requestBody.dimensions, ['startType']);
  assert.equal(queries[1].requestBody.pageToken, 'next');
  assert.equal(queries[1].requestBody.pageSize, queries[0].requestBody.pageSize);
  assert.deepEqual(result.rows.map((row: any) => row.startType), ['COLD', 'WARM']);
});

test('flattenRows tolerates missing values', () => {
  assert.deepEqual(flattenRows([{ metrics: [{ metric: 'anrRate' }] }]), [{ anrRate: null }]);
  assert.deepEqual(flattenRows(undefined), []);
});

test('read-only mode fails closed and keeps exactly the read tools', () => {
  for (const value of ['true', '1', 'yes', 'on', 'enabled', ' TRUE ']) assert.equal(isReadOnlyMode({ APP_PUBLISH_READ_ONLY: value }), true, value);
  for (const value of [undefined, '', '0', 'false', 'no', 'off', ' Off ']) assert.equal(isReadOnlyMode({ APP_PUBLISH_READ_ONLY: value }), false, String(value));

  const all = [...appleTools, ...googleTools].map(tool => tool.name);
  const read = all.filter(isReadTool);
  // Everything allowed outside the list/get/search/query/download naming is pinned here
  assert.deepEqual(
    read.filter(name => !/^(apple|google)_(list|get|search|query|download)_/.test(name)).sort(),
    ['apple_wait_for_asset', 'google_validate_edit'],
  );
  // Polls but deletes a failed reservation, so it is a write
  assert.equal(isReadTool('apple_wait_for_build_upload'), false);
  for (const name of ['apple_submit_for_review', 'apple_upload_asset', 'apple_create_placement', 'apple_create_analytics_report_request',
    'apple_update_experiment', 'google_create_edit', 'google_delete_edit', 'google_commit_edit', 'google_update_listing', 'google_upload_image', 'google_create_release']) {
    assert.equal(isReadTool(name), false, name);
  }
});

test('parseDelimited handles quoted fields, escaped quotes and newlines', () => {
  assert.deepEqual(parseDelimited('Name,Units\n"Foo, Bar",3\n"Say ""hi""\nthere",4\r\n'), [
    ['Name', 'Units'], ['Foo, Bar', '3'], ['Say "hi"\nthere', '4'],
  ]);
  assert.deepEqual(parseDelimited('a\tb\n1\t\n\n'), [['a', 'b'], ['1', '']]);
});

test('tableResult strips the BOM, keeps duplicate columns and refuses to overwrite files', () => {
  const result = tableResult('﻿Date\tUnits\tUnits\n2026-10-10\t1\t2\n', { maxRows: 0 });
  assert.deepEqual(result.columns, ['Date', 'Units', 'Units_2']);
  assert.equal(result.totalRows, 1);
  assert.deepEqual(result.rows, []);
  assert.equal(result.truncated, true);

  const directory = mkdtempSync(join(tmpdir(), 'app-publish-table-'));
  try {
    const outputPath = join(directory, 'report.tsv');
    const empty = tableResult('', { maxRows: 5, outputPath });
    assert.equal(empty.savedTo, outputPath);
    assert.equal(readFileSync(outputPath, 'utf8'), '');
    assert.throws(() => tableResult('a\n1\n', { maxRows: 5, outputPath }), /already exists/);
    tableResult('a\n1\n', { maxRows: 5, outputPath, overwrite: true });
    assert.equal(readFileSync(outputPath, 'utf8'), 'a\n1\n');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('mergeSegments keeps the first header and only drops repeated ones', () => {
  assert.equal(mergeSegments(['', 'Date\tViews\n2026-10-10\t5\n', 'Date\tViews\n2026-10-11\t7']), 'Date\tViews\n2026-10-10\t5\n2026-10-11\t7');
  // A continuation chunk without a header keeps its first row
  assert.equal(mergeSegments(['Date\tViews\n2026-10-10\t5', '2026-10-11\t7']), 'Date\tViews\n2026-10-10\t5\n2026-10-11\t7');
  assert.equal(mergeSegments(['﻿Date\n1', '﻿Date\n2']), 'Date\n1\n2');
});

test('AppleClient raw requests return a Buffer with gzip accepted and reject an empty 204', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-raw-'));
  const originalFetch = globalThis.fetch;
  try {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const keyPath = join(directory, 'AuthKey_TEST.p8');
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const client = new AppleClient({ keyId: 'TESTKEY', issuerId: 'issuer', p8Path: keyPath });
    let headers: any;
    globalThis.fetch = (async (_: string, init: any) => {
      headers = init.headers;
      return new Response(new Uint8Array(gzipSync('a\tb\n')));
    }) as any;
    const body = await client.request<Buffer>('/salesReports', { raw: true });
    assert.ok(Buffer.isBuffer(body));
    assert.equal(body[0], 0x1f);
    assert.match(headers.Accept, /application\/a-gzip/);
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as any;
    await assert.rejects(client.request('/salesReports', { raw: true }), /no content/);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('google_query_vitals keeps pageSize fixed across pages and trims to maxRows', async () => {
  const row = (day: number) => ({ startTime: { year: 2026, month: 10, day }, metrics: [] });
  const { client, queries } = vitalsClient([
    { rows: [row(1), row(2)], nextPageToken: 'p2' },
    { rows: [row(3), row(4)], nextPageToken: 'p3' },
  ]);
  const result = await google('google_query_vitals', client, {
    packageName: 'com.example', startDate: '2026-10-01', endDate: '2026-10-05', maxRows: 3,
  });
  assert.equal(queries.length, 2);
  assert.equal(queries[0].requestBody.pageSize, 3);
  assert.equal(queries[1].requestBody.pageSize, 3);
  assert.deepEqual(result.rows.map((entry: any) => entry.date), ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(result.truncated, true);
  assert.deepEqual(queries[0].requestBody.metrics, ['crashRate', 'userPerceivedCrashRate', 'userPerceivedCrashRate28dUserWeighted', 'distinctUsers']);
});

test('vitals tools reject a package name that is not one', async () => {
  await assert.rejects(google('google_query_vitals', {}, { packageName: 'com.example/../other' }));
  await assert.rejects(google('google_list_vitals_anomalies', {}, { packageName: 'nodots' }));
});

test('error issue/report search send the flattened interval and page token; anomalies stop at maxResults', async () => {
  const calls: any = {};
  const client = { reporting: {
    vitals: { errors: {
      issues: { search: async (params: any) => { calls.issues = params; return { data: { errorIssues: [], nextPageToken: 'n' } }; } },
      reports: { search: async (params: any) => { calls.reports = params; return { data: { errorReports: [{ reportText: 'trace' }] } }; } },
    } },
    anomalies: { list: async () => {
      calls.anomalies = (calls.anomalies ?? 0) + 1;
      return { data: { anomalies: [{ name: `a${calls.anomalies}` }], nextPageToken: 'more' } };
    } },
  } };
  const issues = await google('google_search_vitals_error_issues', client, {
    packageName: 'com.example', startDate: '2026-10-01', endDate: '2026-10-08', pageToken: 'tok',
  });
  assert.equal(issues.nextPageToken, 'n');
  assert.equal(calls.issues.parent, 'apps/com.example');
  assert.equal(calls.issues.pageToken, 'tok');
  assert.equal(calls.issues['interval.startTime.day'], 1);
  assert.equal(calls.issues['interval.endTime.timeZone.id'], 'America/Los_Angeles');
  const reports = await google('google_search_vitals_error_reports', client, { packageName: 'com.example', filter: 'errorIssueId = 42' });
  assert.equal(reports.errorReports[0].reportText, 'trace');
  assert.equal(calls.reports.filter, 'errorIssueId = 42');
  assert.equal(calls.reports.pageSize, 5);
  const anomalies = await google('google_list_vitals_anomalies', client, { packageName: 'com.example', maxResults: 2 });
  assert.equal(calls.anomalies, 2);
  assert.equal(anomalies.anomalies.length, 2);
  assert.equal(anomalies.truncated, true);
  assert.deepEqual(intervalParams(), {});
});

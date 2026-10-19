import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { AppleClient, keyPurpose } from '../src/apple/client.js';

function withKeys<T>(names: string[], run: (paths: Record<string, string>) => Promise<T> | T) {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-keys-'));
  const paths: Record<string, string> = {};
  for (const name of names) {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    paths[name] = join(directory, `${name}.p8`);
    writeFileSync(paths[name], privateKey.export({ type: 'pkcs8', format: 'pem' }));
  }
  return Promise.resolve(run(paths)).finally(() => rmSync(directory, { recursive: true, force: true }));
}

test('Apple tokens are backdated so a fast local clock does not cause 401s', () => withKeys(['main'], paths => {
  const client = new AppleClient({ keyId: 'MAIN', issuerId: 'issuer', p8Path: paths.main });
  const payload = jwt.decode((client as any).getToken()) as jwt.JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  assert.ok(payload.iat! <= now - 30, 'iat must be in the past');
  assert.ok(payload.exp! > now + 60, 'token must stay valid for a while');
  assert.ok(payload.exp! - payload.iat! <= 20 * 60, 'Apple rejects lifetimes over 20 minutes');
}));

test('keyPurpose routes reports and Admin-only requests by API', () => {
  const cases: Array<[string, string, string]> = [
    ['GET', 'https://api.appstoreconnect.apple.com/v1/apps', 'default'],
    ['GET', 'https://api.appstoreconnect.apple.com/v2/appStoreVersionExperiments/1', 'default'],
    ['PATCH', 'https://api.appstoreconnect.apple.com/v1/appCustomProductPages/1', 'default'],
    ['GET', 'https://api.appstoreconnect.apple.com/v1/salesReports?filter[vendorNumber]=1', 'reports'],
    ['GET', 'https://api.appstoreconnect.apple.com/v1/financeReports', 'finance'],
    ['GET', 'https://api.appstoreconnect.apple.com/v1/apps/123/analyticsReportRequests', 'reports'],
    ['GET', 'https://api.appstoreconnect.apple.com/v1/analyticsReportRequests/abc/reports', 'reports'],
    ['GET', 'https://api.appstoreconnect.apple.com/v1/analyticsReports/abc/instances?cursor=x', 'reports'],
    ['GET', 'https://api.appstoreconnect.apple.com/v1/analyticsReportInstances/abc/segments', 'reports'],
    ['POST', 'https://api.appstoreconnect.apple.com/v1/analyticsReportRequests', 'admin'],
    ['DELETE', 'https://api.appstoreconnect.apple.com/v1/analyticsReportRequests/abc', 'admin'],
    // Lookalike paths stay on the main key
    ['GET', 'https://api.appstoreconnect.apple.com/v1/apps/123/salesReportsSomething', 'default'],
  ];
  for (const [method, url, expected] of cases) assert.equal(keyPurpose(method, url), expected, `${method} ${url}`);
});

test('AppleClient signs each request with the key for its API, with fallbacks', () => withKeys(['main', 'reports', 'admin'], async paths => {
  const originalFetch = globalThis.fetch;
  const kids: string[] = [];
  globalThis.fetch = (async (_: string, init: any) => {
    kids.push((jwt.decode(init.headers.Authorization.slice(7), { complete: true }) as any).header.kid);
    return new Response('{}', { status: 200 });
  }) as any;
  try {
    const key = (name: string) => ({ keyId: name.toUpperCase(), issuerId: 'issuer', p8Path: paths[name] });
    const full = new AppleClient({ ...key('main'), reportsKey: key('reports'), adminKey: key('admin') });
    await full.request('/apps');
    await full.request('/salesReports', { params: { 'filter[vendorNumber]': '1' } });
    await full.request('/analyticsReportRequests', { method: 'POST', body: {} });
    await full.request('https://api.appstoreconnect.apple.com/v1/analyticsReports/r/instances?cursor=2');
    await full.request('/financeReports');
    assert.deepEqual(kids.splice(0), ['MAIN', 'REPORTS', 'ADMIN', 'REPORTS', 'ADMIN']);

    // Finance goes to the reports key when there is no Admin key (e.g. a Finance-role key)
    const reportsOnly = new AppleClient({ ...key('main'), reportsKey: key('reports') });
    await reportsOnly.request('/financeReports');
    assert.deepEqual(kids.splice(0), ['REPORTS']);

    // Reports fall back to the Admin key, then to the main key
    const adminOnly = new AppleClient({ ...key('main'), adminKey: key('admin') });
    await adminOnly.request('/salesReports');
    await adminOnly.request('/apps');
    const mainOnly = new AppleClient(key('main'));
    await mainOnly.request('/salesReports');
    await mainOnly.request('/analyticsReportRequests', { method: 'POST', body: {} });
    assert.deepEqual(kids.splice(0), ['ADMIN', 'MAIN', 'MAIN', 'MAIN']);
  } finally {
    globalThis.fetch = originalFetch;
  }
}));

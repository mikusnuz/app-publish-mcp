import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppleClient } from './client.js';
import { allPages } from './asset-library.js';
import { MAX_REPORT_TEXT_BYTES, readBoundedResponse } from './downloads.js';

const id = z.string().trim().min(1);
const reportDate = z.string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/)
  .describe('YYYY-MM-DD (daily/weekly), YYYY-MM (monthly) or YYYY (yearly)');
const preview = {
  maxRows: z.number().int().min(0).max(1000).default(50).describe('Rows to return in the response; the full report goes to outputPath'),
  outputPath: z.string().trim().min(1).optional().describe('Save the full decompressed report to this file'),
  overwrite: z.boolean().default(false).describe('Allow replacing an existing file at outputPath'),
};
const analyticsCategory = z.enum(['APP_USAGE', 'APP_STORE_ENGAGEMENT', 'COMMERCE', 'FRAMEWORK_USAGE', 'PERFORMANCE']);
const granularity = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);

function gunzipIfNeeded(data: Buffer): string {
  const isGzip = data.length > 2 && data[0] === 0x1f && data[1] === 0x8b;
  if (data.length > MAX_REPORT_TEXT_BYTES) throw new Error('Report exceeds the 64 MiB text limit');
  return (isGzip ? gunzipSync(data, { maxOutputLength: MAX_REPORT_TEXT_BYTES }) : data).toString('utf8').replace(/^﻿/, '');
}

/** Parses TSV or CSV (detected from the first line), honoring quotes, "" escapes and quoted newlines. */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell); cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(cells => cells.some(value => value !== ''));
}

function uniqueColumns(header: string[]): string[] {
  const seen = new Set<string>();
  return header.map(name => {
    let column = name;
    let suffix = 2;
    while (seen.has(column)) column = `${name}_${suffix++}`;
    seen.add(column);
    return column;
  });
}

function saveReport(text: string, outputPath: string, overwrite: boolean): string {
  const path = resolve(outputPath);
  if (existsSync(path) && !overwrite) throw new Error(`${path} already exists; pass overwrite=true to replace it`);
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, text, { flag: overwrite ? 'w' : 'wx', mode: 0o600 });
  } catch (error: any) {
    if (error.code === 'EEXIST') throw new Error(`${path} already exists; pass overwrite=true to replace it`);
    throw error;
  }
  return path;
}

/** Turns a TSV/CSV report into a preview the model can read without flooding the context. */
export function tableResult(text: string, args: { maxRows: number; outputPath?: string; overwrite?: boolean }) {
  const savedTo = args.outputPath ? saveReport(text, args.outputPath, args.overwrite ?? false) : undefined;
  const [header, ...data] = parseDelimited(text.replace(/^﻿/, ''));
  const columns = header ? uniqueColumns(header) : [];
  const rows = data.slice(0, args.maxRows).map(cells => Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ''])));
  return {
    columns,
    totalRows: data.length,
    rows,
    ...(data.length > rows.length ? { truncated: true } : {}),
    ...(savedTo ? { savedTo } : {}),
  };
}

/** Joins report segments: keeps the first header and drops it from later segments only where it repeats. */
export function mergeSegments(texts: string[]): string {
  let header: string | undefined;
  const parts: string[] = [];
  for (const raw of texts) {
    const text = raw.replace(/^﻿/, '').replace(/(\r?\n)+$/, '');
    if (!text) continue;
    const [first, ...rest] = text.split(/\r?\n/);
    if (header === undefined) {
      header = first;
      parts.push(text);
    } else {
      parts.push(first === header ? rest.join('\n') : text);
    }
  }
  return parts.filter(Boolean).join('\n');
}

function vendorNumber(value?: string): string {
  const result = value ?? process.env.APPLE_VENDOR_NUMBER;
  if (!result) throw new Error('Pass vendorNumber or set APPLE_VENDOR_NUMBER (App Store Connect → Payments and Financial Reports)');
  return result;
}

// Segment URLs are presigned; they must not leak into errors or responses.
async function downloadSegment(url: string, checksum?: string): Promise<Buffer> {
  // Do not expose signed URLs, including fetch/URL parser exception messages.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
    const res = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(5 * 60_000) });
    if (!res.ok) throw new Error();
    const bytes = await readBoundedResponse(res);
    if (checksum) {
      const digest = createHash('md5').update(bytes).digest();
      if (checksum.toLowerCase() !== digest.toString('hex') && checksum !== digest.toString('base64')) throw new Error();
    }
    return bytes;
  } catch {
    throw new Error('Analytics segment download failed: check HTTPS access, expiry, the 32 MiB download limit and the MD5 checksum; no report was saved');
  }
}

function withoutSegmentUrls(result: any) {
  return {
    ...result,
    data: (result.data ?? []).map((segment: any) => ({
      ...segment,
      attributes: { checksum: segment.attributes?.checksum, sizeInBytes: segment.attributes?.sizeInBytes },
    })),
  };
}

export const reportTools = [
  {
    name: 'apple_get_sales_report',
    description: 'Download a Sales and Trends report (units, installs, proceeds by territory/device) as rows. Needs the vendor number; data for a day usually appears the next day. reportSubType and version must suit the reportType (SALES uses SUMMARY); Apple names the accepted values in its error.',
    schema: z.object({
      vendorNumber: id.optional().describe('Defaults to APPLE_VENDOR_NUMBER'),
      reportType: z.enum(['SALES', 'PRE_ORDER', 'NEWSSTAND', 'SUBSCRIPTION', 'SUBSCRIPTION_EVENT', 'SUBSCRIBER',
        'SUBSCRIPTION_OFFER_CODE_REDEMPTION', 'INSTALLS', 'FIRST_ANNUAL', 'WIN_BACK_ELIGIBILITY']).default('SALES'),
      reportSubType: z.enum(['SUMMARY', 'DETAILED', 'SUMMARY_INSTALL_TYPE', 'SUMMARY_TERRITORY', 'SUMMARY_CHANNEL']).default('SUMMARY'),
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).default('DAILY'),
      reportDate: reportDate.optional().describe('Omit for the latest available report'),
      version: id.optional().describe('Report format version, e.g. 1_1; Apple names the accepted versions in its error if this is wrong'),
      ...preview,
    }),
    handler: async (client: AppleClient, args: any) => {
      const data = await client.request<Buffer>('/salesReports', { raw: true, params: {
        'filter[vendorNumber]': vendorNumber(args.vendorNumber),
        'filter[reportType]': args.reportType,
        'filter[reportSubType]': args.reportSubType,
        'filter[frequency]': args.frequency,
        ...(args.reportDate ? { 'filter[reportDate]': args.reportDate } : {}),
        ...(args.version ? { 'filter[version]': args.version } : {}),
      } });
      return tableResult(gunzipIfNeeded(data), args);
    },
  },
  {
    name: 'apple_get_finance_report',
    description: 'Download a monthly financial report (earnings by region) as rows',
    schema: z.object({
      vendorNumber: id.optional().describe('Defaults to APPLE_VENDOR_NUMBER'),
      reportType: z.enum(['FINANCIAL', 'FINANCE_DETAIL']).default('FINANCIAL'),
      regionCode: id.describe('Region code, e.g. ZZ for all regions, EU, US'),
      reportDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe('Fiscal month, YYYY-MM'),
      ...preview,
    }),
    handler: async (client: AppleClient, args: any) => {
      const data = await client.request<Buffer>('/financeReports', { raw: true, params: {
        'filter[vendorNumber]': vendorNumber(args.vendorNumber),
        'filter[reportType]': args.reportType,
        'filter[regionCode]': args.regionCode,
        'filter[reportDate]': args.reportDate,
      } });
      return tableResult(gunzipIfNeeded(data), args);
    },
  },
  {
    name: 'apple_list_analytics_report_requests',
    description: 'List App Analytics report requests for an app. Apple generates analytics reports only after a request exists.',
    schema: z.object({ appId: id, accessType: z.enum(['ONGOING', 'ONE_TIME_SNAPSHOT']).optional() }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/apps/${args.appId}/analyticsReportRequests`, {
      limit: '200',
      ...(args.accessType ? { 'filter[accessType]': args.accessType } : {}),
    }),
  },
  {
    name: 'apple_create_analytics_report_request',
    description: 'Ask Apple to start generating App Analytics reports (impressions, product page views, downloads, sessions, retention). ONGOING keeps producing daily data; the first reports take 1-2 days. Only one request per access type is allowed.',
    schema: z.object({ appId: id, accessType: z.enum(['ONGOING', 'ONE_TIME_SNAPSHOT']).default('ONGOING') }),
    handler: async (client: AppleClient, args: any) => client.request('/analyticsReportRequests', { method: 'POST', body: { data: {
      type: 'analyticsReportRequests',
      attributes: { accessType: args.accessType },
      relationships: { app: { data: { type: 'apps', id: args.appId } } },
    } } }),
  },
  {
    name: 'apple_list_analytics_reports',
    description: 'List the reports available for an analytics report request, e.g. "App Store Discovery and Engagement" or "App Downloads"',
    schema: z.object({ requestId: id, category: analyticsCategory.optional(), name: id.optional() }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/analyticsReportRequests/${args.requestId}/reports`, {
      limit: '200',
      ...(args.category ? { 'filter[category]': args.category } : {}),
      ...(args.name ? { 'filter[name]': args.name } : {}),
    }),
  },
  {
    name: 'apple_list_analytics_report_instances',
    description: 'List generated instances (one per processing date) of an analytics report',
    schema: z.object({
      reportId: id, granularity: granularity.optional(),
      processingDate: z.string().date().optional().describe('YYYY-MM-DD'),
    }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/analyticsReports/${args.reportId}/instances`, {
      limit: '200',
      ...(args.granularity ? { 'filter[granularity]': args.granularity } : {}),
      ...(args.processingDate ? { 'filter[processingDate]': args.processingDate } : {}),
    }),
  },
  {
    name: 'apple_download_analytics_report',
    description: 'Download every segment of an analytics report instance, decompress and merge them into rows',
    schema: z.object({ instanceId: id, ...preview }),
    handler: async (client: AppleClient, args: any) => {
      const segments = await allPages(client, `/analyticsReportInstances/${args.instanceId}/segments`, { limit: '200' });
      const texts: string[] = [];
      if (segments.data.length === 0) throw new Error('No analytics segments are available yet; no report was saved');
      let totalBytes = 0;
      for (const segment of segments.data) {
        const text = gunzipIfNeeded(await downloadSegment(segment.attributes.url, segment.attributes.checksum));
        totalBytes += Buffer.byteLength(text);
        if (totalBytes > MAX_REPORT_TEXT_BYTES) throw new Error('Merged report exceeds the 64 MiB text limit; no report was saved');
        texts.push(text);
      }
      return { ...tableResult(mergeSegments(texts), args), segments: segments.data.length };
    },
  },
  {
    name: 'apple_list_analytics_report_segments',
    description: 'List the segment files of an analytics report instance (size and checksum, without download URLs)',
    schema: z.object({ instanceId: id }),
    handler: async (client: AppleClient, args: any) => withoutSegmentUrls(
      await allPages(client, `/analyticsReportInstances/${args.instanceId}/segments`, { limit: '200' }),
    ),
  },
];

import { z } from 'zod';
import { GoogleClient } from './client.js';

// Android vitals through the Play Developer Reporting API (v1beta1).
// DAILY data uses the America/Los_Angeles calendar and lags 1-2 days.

const packageName = z.string().trim()
  .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/, 'Expected an Android package name such as com.example.app')
  .describe('Android package name');
const date = z.string().date().describe('YYYY-MM-DD (America/Los_Angeles calendar)');

interface MetricSetDef {
  resource: 'crashrate' | 'anrrate' | 'slowstartrate' | 'slowrenderingrate' | 'excessivewakeuprate'
    | 'stuckbackgroundwakelockrate' | 'lmkrate' | 'bitmapmemoryusage' | 'anonrssandswapmemoryusage' | 'errorCounts';
  set: string;
  metrics: string[];
  requiredDimension?: string;
}

// Google's bad-behavior thresholds are judged on the user-perceived 28-day rates
export const METRIC_SETS: Record<string, MetricSetDef> = {
  crash: { resource: 'crashrate', set: 'crashRateMetricSet', metrics: ['crashRate', 'userPerceivedCrashRate', 'userPerceivedCrashRate28dUserWeighted', 'distinctUsers'] },
  anr: { resource: 'anrrate', set: 'anrRateMetricSet', metrics: ['anrRate', 'userPerceivedAnrRate', 'userPerceivedAnrRate28dUserWeighted', 'distinctUsers'] },
  slowStart: { resource: 'slowstartrate', set: 'slowStartRateMetricSet', metrics: ['slowStartRate', 'distinctUsers'], requiredDimension: 'startType' },
  slowRendering: { resource: 'slowrenderingrate', set: 'slowRenderingRateMetricSet', metrics: ['slowRenderingRate20Fps', 'slowRenderingRate30Fps', 'distinctUsers'] },
  excessiveWakeup: { resource: 'excessivewakeuprate', set: 'excessiveWakeupRateMetricSet', metrics: ['excessiveWakeupRate', 'distinctUsers'] },
  stuckWakelock: { resource: 'stuckbackgroundwakelockrate', set: 'stuckBackgroundWakelockRateMetricSet', metrics: ['stuckBgWakelockRate', 'distinctUsers'] },
  lmk: { resource: 'lmkrate', set: 'lmkRateMetricSet', metrics: ['userPerceivedLmkRate', 'distinctUsers'] },
  bitmapMemory: { resource: 'bitmapmemoryusage', set: 'bitmapMemoryUsageMetricSet', metrics: ['bitmapMemoryUsageP50', 'bitmapMemoryUsageP90', 'distinctUsers'] },
  anonMemory: { resource: 'anonrssandswapmemoryusage', set: 'anonRssAndSwapMemoryUsageMetricSet', metrics: ['anonRssAndSwapMemoryUsageP50', 'anonRssAndSwapMemoryUsageP90', 'distinctUsers'] },
  errorCount: { resource: 'errorCounts', set: 'errorCountMetricSet', metrics: ['errorReportCount', 'distinctUsers'], requiredDimension: 'reportType' },
};

function metricSetApi(client: GoogleClient, def: MetricSetDef): any {
  return def.resource === 'errorCounts' ? client.reporting.vitals.errors.counts : (client.reporting.vitals as any)[def.resource];
}

type GoogleDate = { year?: number | null; month?: number | null; day?: number | null };

function toDateString(value: GoogleDate): string {
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function toDateTime(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day, timeZone: { id: 'America/Los_Angeles' } };
}

function shiftDays(value: string, days: number): string {
  const result = new Date(`${value}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** errors.issues/reports.search take the interval as flattened query parameters. */
export function intervalParams(startDate?: string, endDate?: string) {
  const params: Record<string, string | number> = {};
  for (const [key, value] of [['startTime', startDate], ['endTime', endDate]] as const) {
    if (!value) continue;
    const [year, month, day] = value.split('-').map(Number);
    Object.assign(params, {
      [`interval.${key}.year`]: year, [`interval.${key}.month`]: month, [`interval.${key}.day`]: day,
      [`interval.${key}.timeZone.id`]: 'America/Los_Angeles',
    });
  }
  return params;
}

/** Flattens Google's row format into { date, <dimension>: value, <metric>: value }. */
export function flattenRows(rows: any[] = []) {
  return rows.map(row => {
    const flat: Record<string, string | number | null> = {};
    if (row.startTime) flat.date = toDateString(row.startTime);
    for (const dimension of row.dimensions ?? []) {
      flat[dimension.dimension] = dimension.stringValue ?? dimension.int64Value ?? dimension.valueLabel ?? null;
    }
    for (const metric of row.metrics ?? []) {
      flat[metric.metric] = metric.decimalValue?.value ?? null;
    }
    return flat;
  });
}

const errorSearch = {
  packageName,
  startDate: date.optional(),
  endDate: date.optional(),
  pageToken: z.string().trim().min(1).optional().describe('nextPageToken from the previous call; keep the other arguments unchanged'),
};

export const vitalsTools = [
  {
    name: 'google_query_vitals',
    description: 'Query Android vitals (crash, ANR, slow start, slow rendering, wakeups, wakelocks, LMK, memory, error counts) by day, optionally split by versionCode, countryCode, deviceModel or apiLevel. Defaults to the last 28 days that Google has data for. Rates are returned exactly as the API reports them. Google judges its bad-behavior thresholds on the user-perceived 28-day rates, which the crash and ANR defaults include.',
    schema: z.object({
      packageName,
      metricSet: z.enum(Object.keys(METRIC_SETS) as [string, ...string[]]).default('crash'),
      metrics: z.array(z.string().trim().min(1)).optional().describe('Override the default metrics for the set'),
      dimensions: z.array(z.string().trim().min(1)).default([]).describe('e.g. versionCode, countryCode, deviceModel, apiLevel'),
      startDate: date.optional(),
      endDate: date.optional().describe('Exclusive end date; defaults to the freshest day available'),
      days: z.number().int().min(1).max(365).default(28).describe('Used when startDate is omitted'),
      filter: z.string().trim().min(1).optional().describe('AIP-160 filter, e.g. versionCode = 123'),
      maxRows: z.number().int().min(1).max(10_000).default(500),
    }),
    handler: async (client: GoogleClient, args: any) => {
      const def = METRIC_SETS[args.metricSet];
      const api = metricSetApi(client, def);
      const name = `apps/${args.packageName}/${def.set}`;
      let endDate = args.endDate;
      if (!endDate) {
        const info = await api.get({ name });
        const daily = info.data.freshnessInfo?.freshnesses?.find((entry: any) => entry.aggregationPeriod === 'DAILY');
        if (!daily?.latestEndTime) throw new Error(`Google reports no DAILY data for ${def.set} yet`);
        endDate = toDateString(daily.latestEndTime);
      }
      const startDate = args.startDate ?? shiftDays(endDate, -args.days);
      if (startDate >= endDate) throw new Error('startDate must be before the exclusive endDate');
      const dimensions = [...args.dimensions];
      if (def.requiredDimension && !dimensions.includes(def.requiredDimension)) dimensions.unshift(def.requiredDimension);
      // Page requests must repeat the first request's parameters exactly, so pageSize stays fixed
      const pageSize = args.maxRows;
      const rows: any[] = [];
      const visited = new Set<string>();
      let pageToken: string | undefined;
      do {
        const res = await api.query({ name, requestBody: {
          timelineSpec: { aggregationPeriod: 'DAILY', startTime: toDateTime(startDate), endTime: toDateTime(endDate) },
          metrics: args.metrics ?? def.metrics,
          dimensions,
          ...(args.filter ? { filter: args.filter } : {}),
          pageSize,
          ...(pageToken ? { pageToken } : {}),
        } });
        rows.push(...flattenRows(res.data.rows));
        pageToken = res.data.nextPageToken ?? undefined;
        if (pageToken && rows.length < args.maxRows) {
          if (visited.has(pageToken)) throw new Error('Google vitals pagination repeated a page token');
          visited.add(pageToken);
        }
      } while (pageToken && rows.length < args.maxRows);
      const truncated = Boolean(pageToken) || rows.length > args.maxRows;
      return {
        metricSet: def.set, startDate, endDateExclusive: endDate, dimensions,
        rows: rows.slice(0, args.maxRows), ...(truncated ? { truncated: true } : {}),
      };
    },
  },
  {
    name: 'google_list_vitals_anomalies',
    description: 'List anomalies Google detected in Android vitals (sudden crash/ANR spikes) with the affected metric and dimensions',
    schema: z.object({
      packageName,
      filter: z.string().trim().min(1).optional().describe('e.g. activeBetween("2026-10-01T00:00:00Z", UNBOUNDED)'),
      maxResults: z.number().int().min(1).max(1000).default(100),
    }),
    handler: async (client: GoogleClient, args: any) => {
      const anomalies: any[] = [];
      const visited = new Set<string>();
      let pageToken: string | undefined;
      do {
        const res = await client.reporting.anomalies.list({
          parent: `apps/${args.packageName}`, pageSize: 100,
          ...(args.filter ? { filter: args.filter } : {}),
          ...(pageToken ? { pageToken } : {}),
        });
        anomalies.push(...(res.data.anomalies ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
        if (pageToken && anomalies.length < args.maxResults) {
          if (visited.has(pageToken)) throw new Error('Google anomalies pagination repeated a page token');
          visited.add(pageToken);
        }
      } while (pageToken && anomalies.length < args.maxResults);
      return {
        anomalies: anomalies.slice(0, args.maxResults),
        ...(pageToken || anomalies.length > args.maxResults ? { truncated: true } : {}),
      };
    },
  },
  {
    name: 'google_search_vitals_error_issues',
    description: 'Search crash and ANR clusters (error issues) with counts, affected versions, cause and location, most frequent first. Read the stack trace with google_search_vitals_error_reports.',
    schema: z.object({
      ...errorSearch,
      filter: z.string().trim().min(1).optional().describe('AIP-160, e.g. errorIssueType = CRASH AND versionCode = 123'),
      orderBy: z.string().trim().min(1).default('errorReportCount desc'),
      pageSize: z.number().int().min(1).max(1000).default(20),
    }),
    handler: async (client: GoogleClient, args: any) => {
      const res = await client.reporting.vitals.errors.issues.search({
        parent: `apps/${args.packageName}`,
        pageSize: args.pageSize,
        orderBy: args.orderBy,
        ...(args.filter ? { filter: args.filter } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
        ...intervalParams(args.startDate, args.endDate),
      } as any);
      return res.data;
    },
  },
  {
    name: 'google_search_vitals_error_reports',
    description: 'Fetch individual crash/ANR reports with the full stack trace (reportText), device and app version. Filter by issue with errorIssueId from google_search_vitals_error_issues.',
    schema: z.object({
      ...errorSearch,
      filter: z.string().trim().min(1).optional().describe('AIP-160, e.g. errorIssueId = 1234567890 AND versionCode = 123'),
      pageSize: z.number().int().min(1).max(100).default(5),
    }),
    handler: async (client: GoogleClient, args: any) => {
      const res = await client.reporting.vitals.errors.reports.search({
        parent: `apps/${args.packageName}`,
        pageSize: args.pageSize,
        ...(args.filter ? { filter: args.filter } : {}),
        ...(args.pageToken ? { pageToken: args.pageToken } : {}),
        ...intervalParams(args.startDate, args.endDate),
      } as any);
      return res.data;
    },
  },
];

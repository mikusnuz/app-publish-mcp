import jwt from 'jsonwebtoken';
import { DownloadLimitError, readBoundedResponse } from './downloads.js';
import { createReadStream, readFileSync, statSync } from 'node:fs';

const MAX_UPLOAD_ERROR_DETAIL_LENGTH = 1_024;

function sanitizeUploadErrorDetail(value: string): string {
  const redacted = value
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, match => {
      const queryStart = match.indexOf('?');
      return queryStart === -1 ? match : `${match.slice(0, queryStart)}?[REDACTED]`;
    })
    .replace(
      /\b((?:x-amz-(?:signature|credential|security-token)|signature|token|credential)=)[^&\s"'<>]*/gi,
      '$1[REDACTED]',
    );
  if (redacted.length <= MAX_UPLOAD_ERROR_DETAIL_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_UPLOAD_ERROR_DETAIL_LENGTH - 3)}...`;
}

export interface AppleKeyConfig {
  keyId: string;
  issuerId?: string;
  p8Path: string;
  keyType?: 'TEAM' | 'INDIVIDUAL';
}

export interface AppleConfig extends AppleKeyConfig {
  /** Optional key for Sales/Finance/Analytics reports, e.g. a Sales and Reports key */
  reportsKey?: AppleKeyConfig;
  /** Optional Admin key for analytics requests and as a reporting/finance fallback. */
  adminKey?: AppleKeyConfig;
}

export type AppleKeyPurpose = 'default' | 'reports' | 'finance' | 'admin';

const REPORT_PATH = /^\/(salesReports|analyticsReportRequests|analyticsReports|analyticsReportInstances|analyticsReportSegments)(\/|$)|^\/apps\/[^/]+\/(relationships\/)?analyticsReportRequests(\/|$)/;

/**
 * Picks the key for a request by API, never by retrying with a stronger key:
 * changing analytics report requests needs Admin, reading reports needs a
 * reports-capable role, everything else uses the main key.
 */
export function keyPurpose(method: string, url: string): AppleKeyPurpose {
  const path = new URL(url, 'https://api.appstoreconnect.apple.com').pathname.replace(/^\/v\d+/, '');
  if (method !== 'GET' && /^\/analyticsReportRequests(\/|$)/.test(path)) return 'admin';
  // Sales and Reports keys, Apple's suggestion for reporting, cannot read finance reports
  if (/^\/financeReports(\/|$)/.test(path)) return 'finance';
  return REPORT_PATH.test(path) ? 'reports' : 'default';
}

export class AppleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'AppleApiError';
  }
}

export class AppleClient {
  private config: AppleConfig;
  private baseOrigin = 'https://api.appstoreconnect.apple.com';
  private baseUrl = 'https://api.appstoreconnect.apple.com/v1';
  private tokens = new Map<string, { token: string; exp: number }>();

  constructor(config: AppleConfig) {
    this.config = config;
  }

  /** The key used for a purpose: reports fall back to the Admin key, then to the main key. */
  keyFor(purpose: AppleKeyPurpose = 'default'): AppleKeyConfig {
    if (purpose === 'admin') return this.config.adminKey ?? this.config;
    if (purpose === 'finance') return this.config.adminKey ?? this.config.reportsKey ?? this.config;
    if (purpose === 'reports') return this.config.reportsKey ?? this.config.adminKey ?? this.config;
    return this.config;
  }

  private getToken(purpose: AppleKeyPurpose = 'default'): string {
    const key = this.keyFor(purpose);
    const now = Math.floor(Date.now() / 1000);
    const cached = this.tokens.get(key.keyId);
    if (cached && now < cached.exp - 60) return cached.token;

    const privateKey = readFileSync(key.p8Path, 'utf8');
    const keyType = key.keyType ?? 'TEAM';
    if (keyType === 'TEAM' && !key.issuerId) {
      throw new Error('Apple team API keys require an issuerId');
    }

    // Allow modest clock skew without exceeding Apple's 20-minute token lifetime.
    const issuedAt = now - 60;
    const payload: Record<string, string | number> = {
      iat: issuedAt,
      exp: issuedAt + 20 * 60,
      aud: 'appstoreconnect-v1',
    };
    if (keyType === 'INDIVIDUAL') {
      payload.sub = 'user';
    } else {
      payload.iss = key.issuerId!;
    }

    const token = jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: key.keyId, typ: 'JWT' },
    });
    this.tokens.set(key.keyId, { token, exp: issuedAt + 20 * 60 });
    return token;
  }

  async request<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      params?: Record<string, string>;
      /** Return the response body as a Buffer (gzip reports) instead of parsing JSON */
      raw?: boolean;
    } = {},
  ): Promise<T> {
    const { method = 'GET', body, params, raw } = options;
    let url = path.startsWith('http')
      ? path
        : /^\/v\d+\//.test(path)
        ? `${this.baseOrigin}${path}`
        : `${this.baseUrl}${path}`;
    if (params) {
      const parsedUrl = new URL(url);
      for (const [name, value] of Object.entries(params)) {
        parsedUrl.searchParams.set(name, value);
      }
      url = parsedUrl.toString();
    }

    const purpose = keyPurpose(method, url);
    const maxAttempts = method === 'GET' ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.getToken(purpose)}`,
            'Content-Type': 'application/json',
            ...(raw ? { Accept: 'application/a-gzip, application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          const text = await res.text();
          const retryable = res.status === 429 || res.status >= 500;
          if (retryable && attempt < maxAttempts) {
            const retryAfter = Number(res.headers.get('retry-after'));
            const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1_000, 30_000)
              : 500 * 2 ** (attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
          throw new AppleApiError(
            `Apple API ${method} ${path} → ${res.status}: ${text}`,
            res.status,
            method,
            path,
            text,
          );
        }

        if (raw) {
          if (res.status === 204) throw new Error(`Apple API ${method} ${path} returned no content`);
          return await readBoundedResponse(res) as T;
        }
        if (res.status === 204) return {} as T;
        return await res.json() as T;
      } catch (error) {
        if (error instanceof AppleApiError || error instanceof DownloadLimitError || attempt === maxAttempts) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }

    throw new Error(`Apple API ${method} ${path} failed after retries`);
  }

  async upload(url: string, filePath: string, contentType: string): Promise<any> {
    const data = readFileSync(filePath);
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        'Content-Type': contentType,
      },
      body: data,
      signal: AbortSignal.timeout(15 * 60_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apple upload → ${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
  }

  async uploadOperation(
    operation: {
      method?: string;
      url?: string;
      requestHeaders?: Array<{ name?: string; value?: string }>;
      length?: number;
      offset?: number;
    },
    filePath: string,
  ): Promise<void> {
    if (!operation.url || !operation.method) {
      throw new Error('Apple upload operation missing url or method');
    }
    let uploadUrl: URL;
    try {
      uploadUrl = new URL(operation.url);
    } catch {
      throw new Error('Apple upload operation URL is invalid');
    }
    if (uploadUrl.protocol !== 'https:') {
      throw new Error('Apple upload operation URL must use HTTPS');
    }

    const fileSize = statSync(filePath).size;
    const start = operation.offset ?? 0;
    const len = operation.length ?? fileSize - start;
    if (!Number.isSafeInteger(start) || start < 0) {
      throw new Error(`Apple upload operation has an invalid offset: ${start}`);
    }
    if (!Number.isSafeInteger(len) || len < 1) {
      throw new Error(`Apple upload operation has an invalid length: ${len}`);
    }
    if (start + len > fileSize) {
      throw new Error(
        `Apple upload operation range exceeds the local file: offset ${start}, length ${len}, fileSize ${fileSize}`,
      );
    }

    const headers: Record<string, string> = {};
    for (const h of operation.requestHeaders ?? []) {
      if (h.name && h.value !== undefined) headers[h.name] = h.value;
    }
    const contentLengthEntry = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === 'content-length',
    );
    if (contentLengthEntry) {
      const value = contentLengthEntry[1].trim();
      if (!/^\d+$/.test(value) || Number(value) !== len) {
        throw new Error(
          `Apple upload operation Content-Length mismatch: expected ${len}, received ${contentLengthEntry[1]}`,
        );
      }
    } else {
      headers['Content-Length'] = String(len);
    }

    const method = operation.method.toUpperCase();
    const maxAttempts = method === 'PUT' ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const stream = createReadStream(filePath, {
        start,
        end: start + len - 1,
      });
      let res: Response;
      try {
        // Presigned upload requests contain Apple's headers plus the exact stream
        // length when Apple omitted it, preventing chunked transfer encoding.
        // A fresh range stream is created for every retry so large files never need
        // to be buffered in memory and a failed request can be replayed safely.
        res = await fetch(operation.url, {
          method,
          headers,
          body: stream as unknown as BodyInit,
          duplex: 'half',
          redirect: 'error',
          signal: AbortSignal.timeout(15 * 60_000),
        } as RequestInit & { duplex: 'half' });
      } catch (error) {
        stream.destroy();
        if (attempt === maxAttempts) {
          const detail = sanitizeUploadErrorDetail(
            error instanceof Error ? error.message : String(error),
          );
          throw new Error(`Apple upload operation failed after ${attempt} attempt(s): ${detail}`);
        }
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
        continue;
      }
      stream.destroy();

      if (res.ok) return;

      const text = sanitizeUploadErrorDetail(await res.text());
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxAttempts) {
        const retryAfterValue = res.headers.get('retry-after');
        const retryAfterSeconds = retryAfterValue === null ? Number.NaN : Number(retryAfterValue);
        const retryAfterDate = retryAfterValue === null ? Number.NaN : Date.parse(retryAfterValue);
        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? retryAfterSeconds * 1_000
          : Number.isFinite(retryAfterDate)
            ? Math.max(0, retryAfterDate - Date.now())
            : 500 * 2 ** (attempt - 1);
        await new Promise(resolve => setTimeout(resolve, Math.min(retryAfterMs, 30_000)));
        continue;
      }

      throw new Error(`Apple upload operation → ${res.status}: ${text}`);
    }

    throw new Error('Apple upload operation failed after retries');
  }

}

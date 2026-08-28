import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

export interface AppleConfig {
  keyId: string;
  issuerId?: string;
  p8Path: string;
  vendorNumber?: string;
  keyType?: 'TEAM' | 'INDIVIDUAL';
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
  private token: string | null = null;
  private tokenExp = 0;

  constructor(config: AppleConfig) {
    this.config = config;
  }

  private getToken(): string {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && now < this.tokenExp - 60) return this.token;

    const privateKey = readFileSync(this.config.p8Path, 'utf8');
    const keyType = this.config.keyType ?? 'TEAM';
    if (keyType === 'TEAM' && !this.config.issuerId) {
      throw new Error('Apple team API keys require an issuerId');
    }

    const payload: Record<string, string | number> = {
      iat: now,
      exp: now + 20 * 60, // 20 minutes
      aud: 'appstoreconnect-v1',
    };
    if (keyType === 'INDIVIDUAL') {
      payload.sub = 'user';
    } else {
      payload.iss = this.config.issuerId!;
    }

    this.token = jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: this.config.keyId, typ: 'JWT' },
    });
    this.tokenExp = now + 20 * 60;
    return this.token;
  }

  async request<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      params?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const { method = 'GET', body, params } = options;
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

    const maxAttempts = method === 'GET' ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json',
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

        if (res.status === 204) return {} as T;
        return await res.json() as T;
      } catch (error) {
        if (error instanceof AppleApiError || attempt === maxAttempts) throw error;
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
    const fullBytes = readFileSync(filePath);
    const start = operation.offset ?? 0;
    const len = operation.length ?? fullBytes.length - start;
    const slice = fullBytes.subarray(start, start + len);

    const headers: Record<string, string> = {};
    for (const h of operation.requestHeaders ?? []) {
      if (h.name && h.value !== undefined) headers[h.name] = h.value;
    }

    const res = await fetch(operation.url, {
      method: operation.method,
      headers,
      body: slice,
      signal: AbortSignal.timeout(15 * 60_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apple upload → ${res.status}: ${text}`);
    }
  }

  get vendorNumber() {
    return this.config.vendorNumber;
  }
}

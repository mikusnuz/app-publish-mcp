import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

interface AppleConfig {
  keyId: string;
  issuerId: string;
  p8Path: string;
  vendorNumber?: string;
}

export class AppleClient {
  private config: AppleConfig;
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
    const payload = {
      iss: this.config.issuerId,
      iat: now,
      exp: now + 20 * 60, // 20 minutes
      aud: 'appstoreconnect-v1',
    };

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
    let url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apple API ${method} ${path} → ${res.status}: ${text}`);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
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
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apple upload → ${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
  }

  get vendorNumber() {
    return this.config.vendorNumber;
  }
}

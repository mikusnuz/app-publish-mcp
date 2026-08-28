#!/usr/bin/env node
/**
 * Interactive OAuth flow for Google Play Console.
 *
 * Usage:
 *   npx app-publish-mcp auth google
 *
 * Opens browser → user logs in → tokens saved to ~/.app-publish-mcp/google.json
 * The MCP server auto-loads this file on startup.
 */

import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.app-publish-mcp');
const GOOGLE_TOKEN_PATH = join(CONFIG_DIR, 'google.json');
export const GOOGLE_OAUTH_CALLBACK_HOST = '127.0.0.1';

// Embedded OAuth client — registered as "Desktop app" type so no client secret leak risk
const EMBEDDED_CLIENT_ID = ''; // will be set by user or embedded
const SCOPES = ['https://www.googleapis.com/auth/androidpublisher'];

export interface TokenStore {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  savedAt?: string;
}

export function getGoogleTokenPath(): string {
  return GOOGLE_TOKEN_PATH;
}

export function parseGoogleTokenStore(value: unknown): TokenStore | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.clientId !== 'string' || candidate.clientId.trim() === '' ||
    typeof candidate.clientSecret !== 'string' || candidate.clientSecret.trim() === '' ||
    typeof candidate.refreshToken !== 'string' || candidate.refreshToken.trim() === ''
  ) {
    return null;
  }
  return {
    clientId: candidate.clientId,
    clientSecret: candidate.clientSecret,
    refreshToken: candidate.refreshToken,
    ...(typeof candidate.savedAt === 'string' ? { savedAt: candidate.savedAt } : {}),
  };
}

export function loadSavedGoogleToken(tokenPath: string = GOOGLE_TOKEN_PATH): TokenStore | null {
  if (!existsSync(tokenPath)) return null;
  try {
    if (process.platform !== 'win32') {
      chmodSync(dirname(tokenPath), 0o700);
      chmodSync(tokenPath, 0o600);
    }
    return parseGoogleTokenStore(JSON.parse(readFileSync(tokenPath, 'utf-8')));
  } catch {
    return null;
  }
}

export function saveGoogleToken(token: TokenStore, tokenPath: string = GOOGLE_TOKEN_PATH): void {
  const configDir = dirname(tokenPath);
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') chmodSync(configDir, 0o700);
  writeFileSync(tokenPath, JSON.stringify(token, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  if (process.platform !== 'win32') chmodSync(tokenPath, 0o600);
}

export function createOAuthState(): string {
  return randomBytes(32).toString('hex');
}

export function createPkceValues(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(64).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function oauthStateMatches(expected: string, received: string | null): boolean {
  if (!received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length
    && timingSafeEqual(expectedBytes, receivedBytes);
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin'
    ? { file: 'open', args: [url] }
    : process.platform === 'win32'
      ? { file: 'rundll32', args: ['url.dll,FileProtocolHandler', url] }
      : { file: 'xdg-open', args: [url] };

  execFile(command.file, command.args, error => {
    if (error) {
      console.warn(`Could not open a browser automatically: ${error.message}`);
    }
  });
}

async function authGoogle(clientId: string, clientSecret: string): Promise<void> {
  const callbackHost = GOOGLE_OAUTH_CALLBACK_HOST;
  const state = createOAuthState();
  const { codeVerifier, codeChallenge } = createPkceValues();

  // Start local callback server
  const authorization = await new Promise<{
    code: string;
    oauth2: OAuth2Client;
    redirectUri: string;
  }>((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    let oauth2: OAuth2Client | undefined;
    let redirectUri: string | undefined;

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${callbackHost}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const returnedState = url.searchParams.get('state');

      if (!oauthStateMatches(state, returnedState)) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid OAuth state');
        return;
      }

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Authentication failed</h1><p>You can close this tab.</p>');
        finish(new Error(`Auth failed: ${error}`));
        return;
      }

      if (!code || !oauth2 || !redirectUri) {
        res.writeHead(400);
        res.end('Missing code');
        finish(new Error('OAuth callback did not include an authorization code'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fff">
          <div style="text-align:center">
            <h1 style="font-size:48px;margin-bottom:8px">✓</h1>
            <h2>Authorization received</h2>
            <p style="color:#888">The terminal is completing authentication. You can close this tab.</p>
          </div>
        </body></html>
      `);
      finish(undefined, { code, oauth2, redirectUri });
    });

    const finish = (
      error?: Error,
      value?: { code: string; oauth2: OAuth2Client; redirectUri: string },
    ) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (server.listening) server.close();
      if (error) reject(error);
      else resolve(value!);
    };

    server.on('error', error => finish(error));

    server.listen(0, callbackHost, () => {
      const address = server.address() as AddressInfo | null;
      if (!address) {
        finish(new Error('Could not determine the local OAuth callback port'));
        return;
      }

      redirectUri = `http://${callbackHost}:${address.port}/callback`;
      oauth2 = new OAuth2Client(clientId, clientSecret, redirectUri);
      const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state,
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: codeChallenge,
      });

      console.log('\n🔐 Opening browser for Google authentication...\n');
      console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);
      openBrowser(authUrl);
    });

    // Timeout after 2 minutes
    timeout = setTimeout(() => finish(new Error('Authentication timed out (2 min)')), 120_000);
  });

  // Exchange code for tokens
  const { tokens } = await authorization.oauth2.getToken({
    code: authorization.code,
    codeVerifier,
    redirect_uri: authorization.redirectUri,
  });

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received. Try revoking app access at https://myaccount.google.com/permissions and retry.');
  }

  saveGoogleToken({
    clientId,
    clientSecret,
    refreshToken: tokens.refresh_token,
    savedAt: new Date().toISOString(),
  });

  console.log(`✅ Google credentials saved to ${GOOGLE_TOKEN_PATH}`);
  console.log('   The MCP server will auto-load these on next startup.');
}

// ── CLI entry ──
async function main() {
  const args = process.argv.slice(2);

  if (args[0] !== 'auth') {
    // Not an auth command — this file should not be the entry point for MCP server
    console.error('Usage: app-publish-mcp auth google');
    console.error('       app-publish-mcp auth google --client-id=XXX --client-secret=YYY');
    process.exit(1);
  }

  const target = args[1];

  if (target === 'google') {
    let clientId = '';
    let clientSecret = '';

    // Parse --client-id and --client-secret from args
    for (const arg of args) {
      if (arg.startsWith('--client-id=')) clientId = arg.slice('--client-id='.length);
      if (arg.startsWith('--client-secret=')) clientSecret = arg.slice('--client-secret='.length);
    }

    // Check env vars as fallback
    if (!clientId) clientId = process.env.GOOGLE_CLIENT_ID || '';
    if (!clientSecret) clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

    if (!clientId || !clientSecret) {
      console.error('❌ OAuth Client ID and Secret required.\n');
      console.error('Get them from: Google Cloud Console → APIs & Services → Credentials → Create OAuth Client ID (Desktop app)\n');
      console.error('Then run:');
      console.error('  app-publish-mcp auth google --client-id=YOUR_ID --client-secret=YOUR_SECRET\n');
      console.error('Or set env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET');
      process.exit(1);
    }

    await authGoogle(clientId, clientSecret);
  } else {
    console.error(`Unknown auth target: ${target}`);
    console.error('Available: google');
    process.exit(1);
  }
}

// Export for CLI usage (called from cli.ts)
export { main as runAuthCli };

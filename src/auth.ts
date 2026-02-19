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

import { OAuth2Client } from 'google-auth-library';
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.app-publish-mcp');
const GOOGLE_TOKEN_PATH = join(CONFIG_DIR, 'google.json');

// Embedded OAuth client — registered as "Desktop app" type so no client secret leak risk
const EMBEDDED_CLIENT_ID = ''; // will be set by user or embedded
const SCOPES = ['https://www.googleapis.com/auth/androidpublisher'];

interface TokenStore {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  savedAt: string;
}

export function getGoogleTokenPath(): string {
  return GOOGLE_TOKEN_PATH;
}

export function loadSavedGoogleToken(): TokenStore | null {
  if (!existsSync(GOOGLE_TOKEN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(GOOGLE_TOKEN_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveToken(token: TokenStore): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(GOOGLE_TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function authGoogle(clientId: string, clientSecret: string): Promise<void> {
  const oauth2 = new OAuth2Client(clientId, clientSecret, 'http://localhost:19847/callback');

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  // Start local callback server
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:19847`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Authentication failed</h1><p>${error}</p><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`Auth failed: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end('Missing code');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fff">
          <div style="text-align:center">
            <h1 style="font-size:48px;margin-bottom:8px">✓</h1>
            <h2>Authentication successful</h2>
            <p style="color:#888">You can close this tab.</p>
          </div>
        </body></html>
      `);
      server.close();
      resolve(code);
    });

    server.listen(19847, () => {
      console.log('\n🔐 Opening browser for Google authentication...\n');
      console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);

      // Open browser
      const { exec } = require('child_process');
      const cmd = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} "${authUrl}"`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out (2 min)'));
    }, 120_000);
  });

  // Exchange code for tokens
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received. Try revoking app access at https://myaccount.google.com/permissions and retry.');
  }

  saveToken({
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
      if (arg.startsWith('--client-id=')) clientId = arg.split('=')[1];
      if (arg.startsWith('--client-secret=')) clientSecret = arg.split('=')[1];
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

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

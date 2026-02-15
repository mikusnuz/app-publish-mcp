#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppleClient } from './apple/client.js';
import { GoogleClient } from './google/client.js';
import { appleTools } from './apple/tools.js';
import { googleTools } from './google/tools.js';

const server = new McpServer({
  name: 'app-publish-mcp',
  version: '0.1.0',
});

// ── Initialize clients from env ──
let appleClient: AppleClient | null = null;
let googleClient: GoogleClient | null = null;

const appleKeyId = process.env.APPLE_KEY_ID;
const appleIssuerId = process.env.APPLE_ISSUER_ID;
const appleP8Path = process.env.APPLE_P8_PATH;

if (appleKeyId && appleIssuerId && appleP8Path) {
  appleClient = new AppleClient({
    keyId: appleKeyId,
    issuerId: appleIssuerId,
    p8Path: appleP8Path,
    vendorNumber: process.env.APPLE_VENDOR_NUMBER,
  });
}

const googleSaPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
if (googleSaPath) {
  googleClient = new GoogleClient(googleSaPath);
}

// ── Register Apple tools ──
for (const tool of appleTools) {
  server.tool(tool.name, tool.description, tool.schema.shape, async (args: any) => {
    if (!appleClient) {
      return {
        content: [{ type: 'text' as const, text: 'Apple client not configured. Set APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_P8_PATH env vars.' }],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(appleClient, args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
    }
  });
}

// ── Register Google tools ──
for (const tool of googleTools) {
  server.tool(tool.name, tool.description, tool.schema.shape, async (args: any) => {
    if (!googleClient) {
      return {
        content: [{ type: 'text' as const, text: 'Google client not configured. Set GOOGLE_SERVICE_ACCOUNT_PATH env var.' }],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(googleClient, args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
    }
  });
}

// ── Start ──
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`app-publish-mcp running (Apple: ${appleClient ? 'OK' : 'N/A'}, Google: ${googleClient ? 'OK' : 'N/A'})`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

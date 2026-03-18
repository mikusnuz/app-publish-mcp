#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppleClient } from './apple/client.js';
import { GoogleClient } from './google/client.js';
import { appleTools } from './apple/tools.js';
import { googleTools } from './google/tools.js';
import { loadSavedGoogleToken } from './auth.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const server = new McpServer({
  name: 'app-publish-mcp',
  version: pkg.version,
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

// Google auth: env vars > saved token file (~/.app-publish-mcp/google.json)
const googleSaPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;

if (googleSaPath) {
  googleClient = new GoogleClient({ serviceAccountPath: googleSaPath });
} else if (googleClientId && googleClientSecret && googleRefreshToken) {
  googleClient = new GoogleClient({ clientId: googleClientId, clientSecret: googleClientSecret, refreshToken: googleRefreshToken });
} else {
  // Auto-load from saved token file
  const saved = loadSavedGoogleToken();
  if (saved) {
    googleClient = new GoogleClient({ clientId: saved.clientId, clientSecret: saved.clientSecret, refreshToken: saved.refreshToken });
  }
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

// ── Prompts ──

server.prompt(
  'app_release_checklist',
  'Guided checklist for releasing an app update on iOS and/or Android. Walks through each step from version creation to submission.',
  {
    platform: z.enum(['ios', 'android', 'both']).describe('Target platform(s) for the release'),
    appId: z.string().describe('App ID (Apple App ID or Android package name)'),
    version: z.string().describe('Version string to release (e.g. 1.2.0)'),
  },
  ({ platform, appId, version }) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `Guide me through releasing version ${version} for app ${appId} on ${platform === 'both' ? 'iOS and Android' : platform === 'ios' ? 'iOS' : 'Android'}.`,
            '',
            platform === 'ios' || platform === 'both' ? [
              '## iOS Release Checklist',
              '1. Use apple_list_apps to verify the app exists and get the app ID',
              '2. Use apple_list_builds to check for an uploaded build matching this version',
              '3. Use apple_create_version to create a new App Store version',
              '4. Use apple_list_version_localizations to get existing localizations',
              '5. Use apple_update_version_localization to update whatsNew / release notes for each locale',
              '6. Use apple_assign_build to attach the build to the version',
              '7. Use apple_update_review_detail to set reviewer contact info and demo account if needed',
              '8. Use apple_get_age_rating to verify age rating is correct',
              '9. Use apple_submit_for_review to submit for App Review',
              '',
            ].join('\n') : '',
            platform === 'android' || platform === 'both' ? [
              '## Android Release Checklist',
              '1. Use google_create_edit to start an edit session',
              '2. Use google_get_details to verify app details are current',
              '3. Use google_list_listings to check store listings across languages',
              '4. Use google_update_listing to update descriptions / release notes for each language',
              '5. Use google_upload_bundle to upload the .aab if not already uploaded',
              '6. Use google_create_release to create a release on the target track (e.g. production)',
              '7. Use google_validate_edit to check for errors before committing',
              '8. Use google_commit_edit to publish the changes',
              '',
            ].join('\n') : '',
            'For each step, confirm the result before proceeding. Report any errors and suggest fixes.',
          ].filter(Boolean).join('\n'),
        },
      },
    ],
  }),
);

server.prompt(
  'app_store_optimization',
  'App Store Optimization (ASO) review — analyzes current listing metadata and provides actionable improvement recommendations for both iOS and Android.',
  {
    platform: z.enum(['ios', 'android']).describe('Which platform to review'),
    appId: z.string().describe('App ID (Apple App ID) or Android package name'),
  },
  ({ platform, appId }) => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `Perform an App Store Optimization (ASO) audit for ${appId} on ${platform === 'ios' ? 'iOS App Store' : 'Google Play Store'}.`,
            '',
            platform === 'ios' ? [
              'Steps:',
              `1. Use apple_get_app with appId="${appId}" to get overall app info`,
              `2. Use apple_get_app_info with appId="${appId}" to check categories`,
              `3. Use apple_list_versions with appId="${appId}" to find the latest live version`,
              '4. Use apple_list_version_localizations to get all localized metadata',
              '5. Use apple_list_screenshot_sets for each localization to verify screenshots exist',
              `6. Use apple_list_reviews with appId="${appId}" and sort="-createdDate" to get recent reviews`,
            ].join('\n') : [
              'Steps:',
              `1. Use google_create_edit with packageName="${appId}" to start an edit session`,
              `2. Use google_get_details to check app details (contact info, default language)`,
              `3. Use google_list_listings to get all localized store listings`,
              `4. For each listing language, use google_get_listing to get full title, short/full description`,
              `5. Use google_list_images for each language to check screenshots, feature graphic, icon`,
              `6. Use google_list_reviews with packageName="${appId}" to get recent reviews`,
              '7. Use google_delete_edit to discard the edit session (read-only audit)',
            ].join('\n'),
            '',
            'Analyze and report:',
            '- **Title**: Is it keyword-rich and within character limits?',
            '- **Description**: Does it include relevant keywords? Is it compelling?',
            '- **Keywords** (iOS only): Are they well-optimized?',
            '- **Screenshots**: Are all required device sizes covered? Are they high quality?',
            '- **Localization coverage**: Which languages are missing?',
            '- **Recent reviews**: Common complaints or praise themes?',
            '- **Recommendations**: Specific actionable improvements ranked by impact',
          ].join('\n'),
        },
      },
    ],
  }),
);

// ── Resources ──

server.resource(
  'config',
  'app-publish://config',
  {
    description: 'Current server configuration — shows which platform accounts (Apple / Google) are connected and their auth method.',
    mimeType: 'application/json',
  },
  async () => {
    const config: Record<string, any> = {
      server: {
        name: 'app-publish-mcp',
        version: pkg.version,
      },
      apple: {
        connected: !!appleClient,
        keyId: appleKeyId ? `${appleKeyId.slice(0, 4)}...` : null,
        issuerId: appleIssuerId ? `${appleIssuerId.slice(0, 8)}...` : null,
        vendorNumber: process.env.APPLE_VENDOR_NUMBER ? 'set' : null,
      },
      google: {
        connected: !!googleClient,
        authMethod: googleSaPath ? 'service_account' : (googleClientId ? 'oauth2' : (loadSavedGoogleToken() ? 'saved_token' : 'none')),
      },
      tools: {
        apple: appleTools.length,
        google: googleTools.length,
        total: appleTools.length + googleTools.length,
      },
    };

    return {
      contents: [
        {
          uri: 'app-publish://config',
          mimeType: 'application/json',
          text: JSON.stringify(config, null, 2),
        },
      ],
    };
  },
);

server.resource(
  'supported-platforms',
  'app-publish://supported-platforms',
  {
    description: 'List of all supported tools grouped by platform and category with their descriptions.',
    mimeType: 'application/json',
  },
  async () => {
    const platforms = {
      apple: {
        name: 'Apple App Store Connect',
        configured: !!appleClient,
        tools: appleTools.map(t => ({ name: t.name, description: t.description })),
      },
      google: {
        name: 'Google Play Console',
        configured: !!googleClient,
        tools: googleTools.map(t => ({ name: t.name, description: t.description })),
      },
    };

    return {
      contents: [
        {
          uri: 'app-publish://supported-platforms',
          mimeType: 'application/json',
          text: JSON.stringify(platforms, null, 2),
        },
      ],
    };
  },
);

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

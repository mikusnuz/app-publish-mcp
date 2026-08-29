#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppleClient } from './apple/client.js';
import { GoogleClient } from './google/client.js';
import { appleTools } from './apple/tools.js';
import { googleTools } from './google/tools.js';
import { loadSavedGoogleToken } from './auth.js';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

// Load a project-local .env when present, with the package root as a fallback
// for direct checkouts. Existing process values and the working directory win.
const envPaths = [join(process.cwd(), '.env'), join(__dirname, '..', '.env')];
for (const envPath of new Set(envPaths)) {
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

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
const appleKeyType = process.env.APPLE_KEY_TYPE === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'TEAM';

if (appleKeyId && appleP8Path && (appleKeyType === 'INDIVIDUAL' || appleIssuerId)) {
  appleClient = new AppleClient({
    keyId: appleKeyId,
    issuerId: appleIssuerId,
    p8Path: appleP8Path,
    keyType: appleKeyType,
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
        content: [{ type: 'text' as const, text: 'Apple client not configured. Set APPLE_KEY_ID and APPLE_P8_PATH, plus APPLE_ISSUER_ID for team keys. Set APPLE_KEY_TYPE=INDIVIDUAL for an individual key.' }],
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
        content: [{ type: 'text' as const, text: 'Google client not configured. Set GOOGLE_SERVICE_ACCOUNT_PATH, provide GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN, or run app-publish-mcp auth google.' }],
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
  'Guided checklist for releasing an app update on iOS and/or Android, from signed artifact upload through review and release status.',
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
            'Prerequisite: first-time store setup is complete and the user has supplied a correctly signed build artifact.',
            '',
            platform === 'ios' || platform === 'both' ? [
              '## iOS Release Checklist',
              '1. Use apple_list_apps to verify the app exists and get the app ID',
              '2. Use apple_create_version or apple_update_version plus the localization tools to prepare the version, release settings, and metadata',
              '3. Use apple_upload_build to upload the signed IPA and wait for import; resume an asynchronous upload with apple_get_build_upload or apple_wait_for_build_upload',
              '4. Use apple_set_build_encryption to answer export-compliance encryption for the imported build; if true, the user may still need a manual encryption declaration, supporting documents, and appEncryptionDeclaration linkage in App Store Connect',
              '5. Use apple_assign_build to attach the imported build to the version',
              '6. Use apple_update_review_detail and apple_get_age_rating to verify review metadata',
              '7. Use apple_submit_for_review to submit for App Review',
              '8. For an update (not a first version), optionally configure a seven-day phased release before release',
              '9. After approval, call apple_release_version only when the version is PENDING_DEVELOPER_RELEASE, then monitor or manage any phased release',
              '',
            ].join('\n') : '',
            platform === 'android' || platform === 'both' ? [
              '## Android Release Checklist',
              '1. Use google_create_edit to start an edit, or google_get_edit to verify a resumed edit',
              '2. Use google_get_details and the listing tools to verify store metadata',
              '3. Use google_list_bundles or google_list_apks to reuse an artifact already in the edit',
              '4. Use google_upload_bundle or google_upload_apk only when the artifact is missing',
              '5. If needed, use google_update_data_safety only with a current, user-reviewed CSV export',
              '6. Use google_create_release to create the target-track release with the exact versionCodes set',
              '7. Use google_validate_edit to check for errors before committing',
              '8. Use google_commit_edit to commit the changes. Store review, managed publishing, or a staged rollout can delay public availability.',
              '9. Use google_list_release_statuses after commit to inspect review and publishing state',
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
        keyType: appleKeyType,
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

// ── Smithery Sandbox ──

export function createSandboxServer() {
  const sandbox = new McpServer({
    name: 'app-publish-mcp',
    version: pkg.version,
  });

  // Register Apple tools with null client (will show "not configured" at runtime)
  for (const tool of appleTools) {
    sandbox.tool(tool.name, tool.description, tool.schema.shape, async () => {
      return { content: [{ type: 'text' as const, text: 'sandbox' }] };
    });
  }

  // Register Google tools with null client
  for (const tool of googleTools) {
    sandbox.tool(tool.name, tool.description, tool.schema.shape, async () => {
      return { content: [{ type: 'text' as const, text: 'sandbox' }] };
    });
  }

  sandbox.prompt(
    'app_release_checklist',
    'Guided checklist for releasing an app update on iOS and/or Android.',
    {
      platform: z.enum(['ios', 'android', 'both']).describe('Target platform(s)'),
      appId: z.string().describe('App ID'),
      version: z.string().describe('Version string'),
    },
    ({ platform, appId, version }) => ({
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `Release ${version} for ${appId} on ${platform}.` } }],
    }),
  );

  sandbox.prompt(
    'app_store_optimization',
    'App Store Optimization (ASO) review.',
    {
      platform: z.enum(['ios', 'android']).describe('Which platform to review'),
      appId: z.string().describe('App ID or package name'),
    },
    ({ platform, appId }) => ({
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `ASO audit for ${appId} on ${platform}.` } }],
    }),
  );

  return sandbox;
}

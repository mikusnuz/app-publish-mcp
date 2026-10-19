import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('read-only stdio registration and ASO prompt do not create or discard Google drafts', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    stderr: 'pipe',
    env: {
      PATH: process.env.PATH ?? '',
      APP_PUBLISH_READ_ONLY: 'true',
      APPLE_KEY_ID: '', APPLE_P8_PATH: '', APPLE_ISSUER_ID: '', APPLE_KEY_TYPE: 'TEAM',
      APPLE_REPORTS_KEY_ID: '', APPLE_REPORTS_P8_PATH: '', APPLE_ADMIN_KEY_ID: '', APPLE_ADMIN_P8_PATH: '',
      GOOGLE_SERVICE_ACCOUNT_PATH: '', GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test', GOOGLE_REFRESH_TOKEN: 'test',
    },
  });
  const client = new Client({ name: 'readonly-test', version: '1' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    for (const name of ['google_create_edit', 'google_delete_edit', 'google_commit_edit', 'apple_submit_review_submission']) {
      assert.equal(tools.some(tool => tool.name === name), false, name);
    }
    assert.ok(tools.some(tool => tool.name === 'google_query_vitals'));
    const prompts = await client.listPrompts();
    assert.equal(prompts.prompts.some(prompt => prompt.name === 'app_release_checklist'), false);
    const prompt = await client.getPrompt({ name: 'app_store_optimization', arguments: { platform: 'android', appId: 'com.example.app' } });
    assert.doesNotMatch(JSON.stringify(prompt), /google_create_edit|google_delete_edit/);
    assert.match(JSON.stringify(prompt), /existing editId/);
  } finally { await client.close(); await transport.close(); }
});

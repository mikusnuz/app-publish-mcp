import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AppleApiError, AppleClient } from '../src/apple/client.js';
import { appleTools } from '../src/apple/tools.js';

function appleTool(name: string) {
  const tool = appleTools.find(candidate => candidate.name === name);
  assert.ok(tool, `Missing Apple tool ${name}`);
  return tool;
}

function createReviewFlowFixture(options: {
  submissionId?: string;
  preexistingReady?: boolean;
  initialVersionIds?: string[];
  createError?: Error;
  createdAfterError?: boolean;
  attachError?: Error;
  attachApplied?: boolean;
  submitError?: Error;
  stateAfterSubmitError?: string;
  submissionAppId?: string;
  submissionPlatform?: string;
} = {}) {
  const submissionId = options.submissionId ?? 'submission-1';
  const calls: any[] = [];
  let attachedVersionIds = [...(options.initialVersionIds ?? [])];
  let readyListReads = 0;
  let submitAttempted = false;
  let cancelCount = 0;
  const client = {
    request: async (path: string, requestOptions?: any) => {
      calls.push([path, requestOptions]);
      if (path === '/appStoreVersions/version-1') {
        return {
          data: {
            type: 'appStoreVersions',
            id: 'version-1',
            attributes: { platform: 'IOS' },
            relationships: { app: { data: { type: 'apps', id: 'app-1' } } },
          },
        };
      }
      if (path === '/reviewSubmissions' && requestOptions?.method === undefined) {
        readyListReads += 1;
        const readyExists = options.preexistingReady
          || (options.createdAfterError === true && readyListReads > 1);
        return {
          data: readyExists
            ? [{ type: 'reviewSubmissions', id: submissionId }]
            : [],
        };
      }
      if (path === '/reviewSubmissions' && requestOptions?.method === 'POST') {
        if (options.createError) throw options.createError;
        return { data: { type: 'reviewSubmissions', id: submissionId } };
      }
      if (path === `/reviewSubmissions/${submissionId}` && requestOptions?.method === undefined) {
        return {
          data: {
            type: 'reviewSubmissions',
            id: submissionId,
            attributes: {
              platform: options.submissionPlatform ?? 'IOS',
              state: submitAttempted
                ? options.stateAfterSubmitError ?? 'READY_FOR_REVIEW'
                : 'READY_FOR_REVIEW',
            },
            relationships: {
              app: {
                data: { type: 'apps', id: options.submissionAppId ?? 'app-1' },
              },
            },
          },
        };
      }
      if (path === `/reviewSubmissions/${submissionId}/items`) {
        return {
          data: attachedVersionIds.map((versionId, index) => ({
            type: 'reviewSubmissionItems',
            id: `item-${index + 1}`,
            relationships: {
              appStoreVersion: {
                data: { type: 'appStoreVersions', id: versionId },
              },
            },
          })),
        };
      }
      if (path === '/reviewSubmissionItems' && requestOptions?.method === 'POST') {
        if (options.attachError) {
          if (options.attachApplied) attachedVersionIds = ['version-1'];
          throw options.attachError;
        }
        attachedVersionIds = ['version-1'];
        return { data: { type: 'reviewSubmissionItems', id: 'item-1' } };
      }
      if (path === `/reviewSubmissions/${submissionId}` && requestOptions?.method === 'PATCH') {
        if (requestOptions.body?.data?.attributes?.canceled === true) {
          cancelCount += 1;
          return { data: { type: 'reviewSubmissions', id: submissionId } };
        }
        submitAttempted = true;
        if (options.submitError) throw options.submitError;
        return {
          data: {
            type: 'reviewSubmissions',
            id: submissionId,
            attributes: { state: 'WAITING_FOR_REVIEW' },
          },
        };
      }
      throw new Error(`Unexpected request ${path}`);
    },
  };

  return {
    client,
    calls,
    getCancelCount: () => cancelCount,
  };
}

test('apple_upload_build reserves, uploads, commits SHA-256, and waits for COMPLETE', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-build-upload-'));
  try {
    const filePath = join(directory, 'Signed.IPA');
    const bytes = Buffer.from('signed-ipa-payload');
    writeFileSync(filePath, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push(['request', path, options]);
        if (path === '/buildUploads') {
          return { data: { type: 'buildUploads', id: 'upload-1' } };
        }
        if (path === '/buildUploadFiles') {
          return {
            data: {
              type: 'buildUploadFiles',
              id: 'file-1',
              attributes: {
                uploadOperations: [
                  { method: 'PUT', url: 'https://upload.example/1', offset: 0, length: 6 },
                  {
                    method: 'PUT',
                    url: 'https://upload.example/2',
                    offset: 6,
                    length: bytes.length - 6,
                  },
                ],
              },
            },
          };
        }
        if (path === '/buildUploadFiles/file-1') {
          return {
            data: {
              type: 'buildUploadFiles',
              id: 'file-1',
              attributes: {
                assetDeliveryState: { state: 'UPLOAD_COMPLETE' },
                sourceFileChecksums: { file: { hash: sha256, algorithm: 'SHA_256' } },
                uploadOperations: [{ url: 'https://upload.example/presigned-secret' }],
              },
            },
          };
        }
        if (path === '/buildUploads/upload-1') {
          return {
            data: {
              type: 'buildUploads',
              id: 'upload-1',
              attributes: { state: { state: 'COMPLETE', errors: [] } },
              relationships: { build: { data: { type: 'builds', id: 'build-1' } } },
            },
          };
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async (operation: any, localPath: string) => {
        calls.push(['uploadOperation', operation, localPath]);
      },
    };

    const tool = appleTool('apple_upload_build');
    const input = tool.schema.parse({
      appId: 'app-1',
      filePath,
      versionString: '1.2.0',
      buildNumber: '42',
      expectedFileSize: bytes.length,
      expectedSha256: sha256.toUpperCase(),
    });
    const result = await tool.handler(client as any, input);

    const createUpload = calls.find(call => call[1] === '/buildUploads');
    assert.deepEqual(createUpload[2].body.data.attributes, {
      cfBundleShortVersionString: '1.2.0',
      cfBundleVersion: '42',
      platform: 'IOS',
    });
    assert.deepEqual(createUpload[2].body.data.relationships.app.data, {
      type: 'apps',
      id: 'app-1',
    });

    const createFile = calls.find(call => call[1] === '/buildUploadFiles');
    assert.deepEqual(createFile[2].body.data.attributes, {
      assetType: 'ASSET',
      fileName: 'Signed.IPA',
      fileSize: bytes.length,
      uti: 'com.apple.ipa',
    });
    assert.equal(calls.filter(call => call[0] === 'uploadOperation').length, 2);

    const commit = calls.find(call => call[1] === '/buildUploadFiles/file-1');
    assert.equal(commit[2].body.data.attributes.uploaded, true);
    assert.deepEqual(commit[2].body.data.attributes.sourceFileChecksums, {
      file: { hash: sha256, algorithm: 'SHA_256' },
    });
    const status = calls.find(call => call[1] === '/buildUploads/upload-1');
    assert.deepEqual(status[2].params, {
      include: 'build',
      'fields[builds]': 'version,processingState,usesNonExemptEncryption',
    });
    assert.equal(result.success, true);
    assert.equal(result.buildUploadId, 'upload-1');
    assert.equal(result.buildUploadFileId, 'file-1');
    assert.equal(result.sha256, sha256);
    assert.equal(result.buildUploadFile.id, 'file-1');
    assert.equal(result.committedFile, undefined);
    assert.equal(JSON.stringify(result).includes('presigned-secret'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_build rejects extension, size, and checksum mismatches before API calls', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-build-validation-'));
  try {
    const ipaPath = join(directory, 'Build.ipa');
    const zipPath = join(directory, 'Build.zip');
    writeFileSync(ipaPath, 'payload');
    writeFileSync(zipPath, 'payload');
    let requestCount = 0;
    const client = {
      request: async () => { requestCount += 1; return {}; },
      uploadOperation: async () => {},
    };
    const tool = appleTool('apple_upload_build');
    const common = {
      appId: 'app-1',
      versionString: '1.0',
      buildNumber: '1',
      waitForProcessing: false,
      timeoutSeconds: 10,
      pollIntervalSeconds: 1,
      platform: 'IOS',
    };

    await assert.rejects(
      tool.handler(client as any, { ...common, filePath: zipPath }),
      /requires a \.ipa file/,
    );
    await assert.rejects(
      tool.handler(client as any, { ...common, filePath: ipaPath, expectedFileSize: 8 }),
      /fileSize mismatch/,
    );
    await assert.rejects(
      tool.handler(client as any, {
        ...common,
        filePath: ipaPath,
        expectedSha256: '0'.repeat(64),
      }),
      /SHA-256 mismatch/,
    );
    assert.equal(requestCount, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_build removes an uncommitted reservation after upload failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-build-cleanup-'));
  try {
    const filePath = join(directory, 'Build.ipa');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/buildUploads' && options?.method === 'POST') {
          return { data: { id: 'upload-cleanup' } };
        }
        if (path === '/buildUploadFiles') {
          return {
            data: {
              id: 'file-cleanup',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/buildUploads/upload-cleanup' && options?.method === 'DELETE') return {};
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => { throw new Error('presigned upload failed'); },
    };

    const input = appleTool('apple_upload_build').schema.parse({
      appId: 'app-1',
      filePath,
      versionString: '1.0',
      buildNumber: '1',
      waitForProcessing: false,
    });
    await assert.rejects(
      appleTool('apple_upload_build').handler(client as any, input),
      /upload-cleanup failed before processing; reservation cleanup succeeded/,
    );
    assert.ok(calls.some(call => (
      call[0] === '/buildUploads/upload-cleanup' && call[1]?.method === 'DELETE'
    )));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_build cleans up a definitively rejected commit without reconciliation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-build-commit-rejected-'));
  try {
    const filePath = join(directory, 'Build.ipa');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/buildUploads' && options?.method === 'POST') {
          return { data: { id: 'upload-rejected' } };
        }
        if (path === '/buildUploadFiles' && options?.method === 'POST') {
          return {
            data: {
              id: 'file-rejected',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/buildUploadFiles/file-rejected' && options?.method === 'PATCH') {
          throw new AppleApiError(
            'Apple rejected the build upload file commit',
            422,
            'PATCH',
            path,
            '{"errors":[{"code":"ENTITY_ERROR"}]}',
          );
        }
        if (path === '/buildUploads/upload-rejected' && options?.method === 'DELETE') {
          return {};
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    const input = appleTool('apple_upload_build').schema.parse({
      appId: 'app-1',
      filePath,
      versionString: '1.0',
      buildNumber: '1',
      waitForProcessing: false,
    });
    await assert.rejects(
      appleTool('apple_upload_build').handler(client as any, input),
      /upload-rejected file file-rejected commit was rejected; reservation cleanup succeeded.*Apple rejected/,
    );
    assert.equal(calls.some(call => (
      call[0] === '/buildUploads/upload-rejected' && call[1]?.method === 'DELETE'
    )), true);
    assert.equal(calls.some(call => (
      call[0] === '/buildUploadFiles/file-rejected' && call[1]?.method === undefined
    )), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_build reconciles an ambiguous 409 commit response without deleting', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-build-commit-loss-'));
  try {
    const filePath = join(directory, 'Build.ipa');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    let uploadStatusReads = 0;
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/buildUploads' && options?.method === 'POST') {
          return { data: { id: 'upload-commit-loss' } };
        }
        if (path === '/buildUploadFiles' && options?.method === 'POST') {
          return {
            data: {
              id: 'file-commit-loss',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/buildUploadFiles/file-commit-loss' && options?.method === 'PATCH') {
          throw new AppleApiError(
            'Apple reported a commit conflict',
            409,
            'PATCH',
            path,
            '{"errors":[{"code":"ENTITY_ERROR.RELATIONSHIP.INVALID"}]}',
          );
        }
        if (path === '/buildUploadFiles/file-commit-loss' && options?.method === undefined) {
          return {
            data: {
              id: 'file-commit-loss',
              attributes: {
                assetDeliveryState: { state: 'UPLOAD_COMPLETE' },
                sourceFileChecksums: {
                  file: { hash: 'server-checksum', algorithm: 'SHA_256' },
                },
              },
            },
          };
        }
        if (path === '/buildUploads/upload-commit-loss' && options?.method === undefined) {
          uploadStatusReads += 1;
          return {
            data: {
              id: 'upload-commit-loss',
              attributes: {
                state: {
                  state: uploadStatusReads === 1 ? 'PROCESSING' : 'COMPLETE',
                  errors: [],
                },
              },
            },
          };
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    const input = appleTool('apple_upload_build').schema.parse({
      appId: 'app-1',
      filePath,
      versionString: '1.0',
      buildNumber: '1',
      pollIntervalSeconds: 1,
    });
    const result = await appleTool('apple_upload_build').handler(client as any, input);

    assert.equal(result.success, true);
    assert.equal(result.completed, true);
    assert.equal(result.buildUploadFile.assetDeliveryState.state, 'UPLOAD_COMPLETE');
    assert.equal(calls.filter(call => (
      call[0] === '/buildUploadFiles/file-commit-loss' && call[1]?.method === 'PATCH'
    )).length, 1);
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
    const fileStatusRead = calls.find(call => (
      call[0] === '/buildUploadFiles/file-commit-loss' && call[1]?.method === undefined
    ));
    assert.equal(
      fileStatusRead[1].params['fields[buildUploadFiles]'].includes('uploadOperations'),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_build retains IDs when commit reconciliation cannot read status', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-build-commit-ambiguous-'));
  try {
    const filePath = join(directory, 'Build.ipa');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/buildUploads' && options?.method === 'POST') {
          return { data: { id: 'upload-ambiguous' } };
        }
        if (path === '/buildUploadFiles' && options?.method === 'POST') {
          return {
            data: {
              id: 'file-ambiguous',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/buildUploadFiles/file-ambiguous' && options?.method === 'PATCH') {
          throw new Error('commit response lost');
        }
        if (path === '/buildUploadFiles/file-ambiguous' && options?.method === undefined) {
          throw new Error('file status unavailable');
        }
        if (path === '/buildUploads/upload-ambiguous' && options?.method === undefined) {
          return {
            data: { attributes: { state: { state: 'AWAITING_UPLOAD' } } },
          };
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    const input = appleTool('apple_upload_build').schema.parse({
      appId: 'app-1',
      filePath,
      versionString: '1.0',
      buildNumber: '1',
      waitForProcessing: false,
    });
    await assert.rejects(
      appleTool('apple_upload_build').handler(client as any, input),
      /upload-ambiguous file file-ambiguous commit outcome is ambiguous; no cleanup was attempted/,
    );
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_build retains an awaiting upload after an ambiguous commit retry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-build-commit-retry-'));
  try {
    const filePath = join(directory, 'Build.ipa');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/buildUploads' && options?.method === 'POST') {
          return { data: { id: 'upload-awaiting' } };
        }
        if (path === '/buildUploadFiles' && options?.method === 'POST') {
          return {
            data: {
              id: 'file-awaiting',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/buildUploadFiles/file-awaiting' && options?.method === 'PATCH') {
          throw new Error('commit response unavailable');
        }
        if (path === '/buildUploadFiles/file-awaiting' && options?.method === undefined) {
          return {
            data: {
              id: 'file-awaiting',
              attributes: { assetDeliveryState: { state: 'AWAITING_UPLOAD' } },
            },
          };
        }
        if (path === '/buildUploads/upload-awaiting' && options?.method === undefined) {
          return {
            data: { attributes: { state: { state: 'AWAITING_UPLOAD' } } },
          };
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    const input = appleTool('apple_upload_build').schema.parse({
      appId: 'app-1',
      filePath,
      versionString: '1.0',
      buildNumber: '1',
      waitForProcessing: false,
    });
    await assert.rejects(
      appleTool('apple_upload_build').handler(client as any, input),
      /upload-awaiting file file-awaiting commit outcome is ambiguous; retained for reconciliation/,
    );
    assert.equal(calls.filter(call => (
      call[0] === '/buildUploadFiles/file-awaiting' && call[1]?.method === 'PATCH'
    )).length, 2);
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_build cleans up when no-wait status is already FAILED', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-build-failed-status-'));
  try {
    const filePath = join(directory, 'Build.ipa');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/buildUploads' && options?.method === 'POST') {
          return { data: { id: 'upload-failed-status' } };
        }
        if (path === '/buildUploadFiles') {
          return {
            data: {
              id: 'file-failed-status',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/buildUploadFiles/file-failed-status') {
          return { data: { id: 'file-failed-status', attributes: {} } };
        }
        if (path === '/buildUploads/upload-failed-status' && options?.method === undefined) {
          return {
            data: {
              attributes: {
                state: {
                  state: 'FAILED',
                  errors: [{ code: 'INVALID_BINARY' }],
                },
              },
            },
          };
        }
        if (path === '/buildUploads/upload-failed-status' && options?.method === 'DELETE') {
          return {};
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    const input = appleTool('apple_upload_build').schema.parse({
      appId: 'app-1',
      filePath,
      versionString: '1.0',
      buildNumber: '1',
      waitForProcessing: false,
    });
    await assert.rejects(
      appleTool('apple_upload_build').handler(client as any, input),
      /INVALID_BINARY.*reservation cleanup succeeded/,
    );
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('AppleClient uploadOperation streams only the requested range and retries transient failures', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-upload-operation-'));
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  try {
    const filePath = join(directory, 'range.ipa');
    writeFileSync(filePath, '0123456789');
    const requests: any[] = [];
    globalThis.setTimeout = ((callback: (...args: any[]) => void) => {
      callback();
      return 0 as any;
    }) as typeof setTimeout;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const chunks: Buffer[] = [];
      for await (const chunk of init?.body as any) chunks.push(Buffer.from(chunk));
      requests.push({
        body: Buffer.concat(chunks).toString(),
        headers: init?.headers,
        method: init?.method,
        duplex: (init as any)?.duplex,
        redirect: init?.redirect,
      });
      if (requests.length === 1) {
        return new Response('retry', { status: 503, headers: { 'retry-after': '0' } });
      }
      if (requests.length === 2) throw new Error('temporary network error');
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const client = new AppleClient({ keyId: 'unused', issuerId: 'unused', p8Path: 'unused' });
    await client.uploadOperation({
      method: 'PUT',
      url: 'https://upload.example/presigned?secret=redacted',
      offset: 2,
      length: 4,
      requestHeaders: [{ name: 'x-apple-header', value: 'required' }],
    }, filePath);

    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.equal(request.body, '2345');
      assert.equal(request.method, 'PUT');
      assert.equal(request.duplex, 'half');
      assert.equal(request.redirect, 'error');
      assert.deepEqual(request.headers, {
        'x-apple-header': 'required',
        'Content-Length': '4',
      });
      assert.equal((request.headers as any).Authorization, undefined);
      assert.equal((request.headers as any)['Content-Type'], undefined);
    }

    await client.uploadOperation({
      method: 'PUT',
      url: 'https://upload.example/presigned',
      offset: 2,
      length: 4,
      requestHeaders: [{ name: 'content-length', value: '4' }],
    }, filePath);
    assert.deepEqual(requests[3].headers, { 'content-length': '4' });

    await assert.rejects(
      client.uploadOperation({
        method: 'PUT',
        url: 'https://upload.example/content-length-mismatch',
        offset: 2,
        length: 4,
        requestHeaders: [{ name: 'Content-Length', value: '5' }],
      }, filePath),
      /Content-Length mismatch/,
    );

    await assert.rejects(
      client.uploadOperation({
        method: 'PUT',
        url: 'https://upload.example/out-of-range',
        offset: 9,
        length: 2,
      }, filePath),
      /range exceeds the local file/,
    );
    assert.equal(requests.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('AppleClient uploadOperation blocks redirects and redacts bounded error details', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-upload-error-'));
  const originalFetch = globalThis.fetch;
  try {
    const filePath = join(directory, 'error.ipa');
    writeFileSync(filePath, 'abc');
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestInit = init;
      for await (const _chunk of init?.body as any) {
        // Consume the request stream as a real fetch implementation would.
      }
      const secretUrl =
        'https://storage.example/object?X-Amz-Signature=super-secret&X-Amz-Credential=credential';
      return new Response(`failure at ${secretUrl} ${'x'.repeat(3_000)}`, { status: 400 });
    }) as typeof fetch;

    const client = new AppleClient({ keyId: 'unused', issuerId: 'unused', p8Path: 'unused' });
    await assert.rejects(
      client.uploadOperation({
        method: 'PUT',
        url: 'https://upload.example/presigned?private=operation-secret',
        offset: 0,
        length: 3,
      }, filePath),
      (error: Error) => {
        assert.equal(error.message.includes('super-secret'), false);
        assert.equal(error.message.includes('credential'), false);
        assert.equal(error.message.includes('operation-secret'), false);
        assert.match(error.message, /\[REDACTED\]/);
        assert.ok(error.message.length < 1_100);
        return true;
      },
    );
    assert.equal(requestInit?.redirect, 'error');
    assert.deepEqual(requestInit?.headers, { 'Content-Length': '3' });
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('build status tools expose status and surface FAILED details', async () => {
  const getTool = appleTool('apple_get_build_upload');
  const waitTool = appleTool('apple_wait_for_build_upload');
  const calls: any[] = [];
  const client = {
    request: async (...args: any[]) => {
      calls.push(args);
      return {
        data: {
          id: 'upload-1',
          attributes: {
            state: {
              state: calls.length === 1 ? 'COMPLETE' : 'FAILED',
              errors: [{ code: 'INVALID_BINARY', description: 'Invalid binary' }],
            },
          },
        },
      };
    },
  };

  const status = await getTool.handler(client as any, { buildUploadId: 'upload-1' });
  assert.equal(status.data.attributes.state.state, 'COMPLETE');
  await assert.rejects(
    waitTool.handler(client as any, {
      buildUploadId: 'upload-1',
      timeoutSeconds: 1,
      pollIntervalSeconds: 1,
    }),
    /INVALID_BINARY/,
  );
  assert.deepEqual(calls[2], [
    '/buildUploads/upload-1',
    { method: 'DELETE' },
  ]);
});

test('apple_delete_build_upload only discards awaiting or failed reservations', async () => {
  const calls: any[] = [];
  let state = 'AWAITING_UPLOAD';
  const client = {
    request: async (path: string, options?: any) => {
      calls.push([path, options]);
      if (options?.method === 'DELETE') return {};
      return {
        data: { attributes: { state: { state } } },
      };
    },
  };
  const tool = appleTool('apple_delete_build_upload');

  const awaitingResult = await tool.handler(client as any, {
    buildUploadId: 'upload-recovery',
  });
  assert.deepEqual(awaitingResult, {
    success: true,
    buildUploadId: 'upload-recovery',
    previousState: 'AWAITING_UPLOAD',
  });

  state = 'PROCESSING';
  await assert.rejects(
    tool.handler(client as any, { buildUploadId: 'upload-recovery' }),
    /cannot be deleted in state PROCESSING/,
  );

  state = 'FAILED';
  const failedResult = await tool.handler(client as any, {
    buildUploadId: 'upload-recovery',
  });
  assert.equal(failedResult.previousState, 'FAILED');
  assert.equal(calls.filter(call => call[1]?.method === 'DELETE').length, 2);
  assert.equal(calls[0][1]?.method, undefined);
  assert.equal(calls[1][1]?.method, 'DELETE');
});

test('apple_wait_for_build_upload retains PROCESSING uploads on timeout', async () => {
  const calls: any[] = [];
  const client = {
    request: async (...args: any[]) => {
      calls.push(args);
      return {
        data: {
          attributes: { state: { state: 'PROCESSING' } },
        },
      };
    },
  };

  await assert.rejects(
    appleTool('apple_wait_for_build_upload').handler(client as any, {
      buildUploadId: 'upload-processing',
      timeoutSeconds: 0,
      pollIntervalSeconds: 1,
    }),
    /Timed out.*PROCESSING/,
  );
  assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
});

test('apple_submit_for_review creates, attaches, and submits normally', async () => {
  const fixture = createReviewFlowFixture();
  const tool = appleTool('apple_submit_for_review');
  const input = tool.schema.parse({
    appId: 'app-1',
    versionId: 'version-1',
  });
  const result = await tool.handler(fixture.client as any, input);

  assert.equal(result.data.id, 'submission-1');
  assert.equal(result.data.attributes.state, 'WAITING_FOR_REVIEW');
  assert.equal(fixture.calls.some(call => (
    call[0] === '/reviewSubmissions' && call[1]?.method === 'POST'
  )), true);
  assert.equal(fixture.calls.some(call => (
    call[0] === '/reviewSubmissionItems' && call[1]?.method === 'POST'
  )), true);
  const submitCall = fixture.calls.find(call => (
    call[0] === '/reviewSubmissions/submission-1'
    && call[1]?.body?.data?.attributes?.submitted === true
  ));
  assert.ok(submitCall);
});

test('apple_submit_for_review cancels a new submission after a definitive attach rejection', async () => {
  const fixture = createReviewFlowFixture({
    attachError: new AppleApiError(
      'Apple rejected the review item',
      422,
      'POST',
      '/reviewSubmissionItems',
      '{"errors":[{"code":"ENTITY_ERROR"}]}',
    ),
  });
  const input = appleTool('apple_submit_for_review').schema.parse({
    appId: 'app-1',
    versionId: 'version-1',
  });

  await assert.rejects(
    appleTool('apple_submit_for_review').handler(fixture.client as any, input),
    /submission-1 item attach was rejected; new submission cleanup succeeded/,
  );
  assert.equal(fixture.getCancelCount(), 1);
  assert.equal(fixture.calls.some(call => (
    call[1]?.body?.data?.attributes?.submitted === true
  )), false);
});

test('apple_submit_for_review reconciles an ambiguous attach that created the item', async () => {
  const fixture = createReviewFlowFixture({
    attachError: new Error('item response lost'),
    attachApplied: true,
  });
  const input = appleTool('apple_submit_for_review').schema.parse({
    appId: 'app-1',
    versionId: 'version-1',
  });

  const result = await appleTool('apple_submit_for_review').handler(
    fixture.client as any,
    input,
  );
  assert.equal(result.data.attributes.state, 'WAITING_FOR_REVIEW');
  assert.equal(fixture.getCancelCount(), 0);
  assert.equal(fixture.calls.filter(call => (
    call[0] === '/reviewSubmissions/submission-1/items'
  )).length, 2);
});

test('apple_submit_for_review reconciles an ambiguous submit that reached review', async () => {
  const fixture = createReviewFlowFixture({
    submitError: new Error('submit response lost'),
    stateAfterSubmitError: 'WAITING_FOR_REVIEW',
  });
  const input = appleTool('apple_submit_for_review').schema.parse({
    appId: 'app-1',
    versionId: 'version-1',
  });

  const result = await appleTool('apple_submit_for_review').handler(
    fixture.client as any,
    input,
  );
  assert.equal(result.success, true);
  assert.equal(result.reconciled, true);
  assert.equal(result.submissionId, 'submission-1');
  assert.equal(result.data.attributes.state, 'WAITING_FOR_REVIEW');
  assert.equal(fixture.getCancelCount(), 0);
});

test('apple_submit_for_review resumes an explicit matching submission without duplicate attach', async () => {
  const fixture = createReviewFlowFixture({ initialVersionIds: ['version-1'] });
  const input = appleTool('apple_submit_for_review').schema.parse({
    appId: 'app-1',
    versionId: 'version-1',
    submissionId: 'submission-1',
  });

  const result = await appleTool('apple_submit_for_review').handler(
    fixture.client as any,
    input,
  );
  assert.equal(result.data.attributes.state, 'WAITING_FOR_REVIEW');
  assert.equal(fixture.calls.some(call => (
    call[0] === '/reviewSubmissions' && call[1]?.method === 'POST'
  )), false);
  assert.equal(fixture.calls.some(call => call[0] === '/reviewSubmissionItems'), false);

  const mismatched = createReviewFlowFixture({
    initialVersionIds: ['version-1'],
    submissionAppId: 'app-2',
  });
  await assert.rejects(
    appleTool('apple_submit_for_review').handler(mismatched.client as any, input),
    /submission-1 cannot be resumed.*does not match app app-1/,
  );

  const otherVersion = createReviewFlowFixture({
    initialVersionIds: ['version-other'],
  });
  await assert.rejects(
    appleTool('apple_submit_for_review').handler(otherVersion.client as any, input),
    /submission-1 already contains App Store version version-other instead of version-1/,
  );
});

test('apple_submit_for_review requires explicit consent for every preflight draft', async () => {
  const existing = createReviewFlowFixture({
    preexistingReady: true,
    initialVersionIds: ['version-1'],
  });
  const input = appleTool('apple_submit_for_review').schema.parse({
    appId: 'app-1',
    versionId: 'version-1',
  });
  await assert.rejects(
    appleTool('apple_submit_for_review').handler(existing.client as any, input),
    /READY_FOR_REVIEW submission submission-1 already exists.*retry with submissionId=submission-1/,
  );
  assert.equal(existing.calls.some(call => call[0] === '/reviewSubmissionItems'), false);
  assert.equal(existing.calls.some(call => (
    call[0] === '/reviewSubmissions' && call[1]?.method === 'POST'
  )), false);
});

test('apple_submit_for_review reports but never mutates a candidate after create response loss', async () => {
  const fixture = createReviewFlowFixture({
    createError: new Error('create response lost'),
    createdAfterError: true,
  });
  const input = appleTool('apple_submit_for_review').schema.parse({
    appId: 'app-1',
    versionId: 'version-1',
  });

  await assert.rejects(
    appleTool('apple_submit_for_review').handler(fixture.client as any, input),
    /creation outcome is ambiguous.*candidate IDs: submission-1.*explicit submissionId/,
  );
  assert.equal(fixture.calls.some(call => call[0] === '/reviewSubmissionItems'), false);
  assert.equal(fixture.calls.some(call => (
    call[0] === '/reviewSubmissions/submission-1' && call[1]?.method === 'PATCH'
  )), false);
});

test('app and build submission fields use the current PATCH schemas', async () => {
  const calls: any[] = [];
  const client = {
    request: async (...args: any[]) => { calls.push(args); return { ok: true }; },
  };

  await appleTool('apple_update_app').handler(client as any, {
    appId: 'app-1',
    contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
    primaryLocale: 'en-US',
  });
  await appleTool('apple_set_build_encryption').handler(client as any, {
    buildId: 'build-1',
    usesNonExemptEncryption: false,
  });
  const nonExemptResult = await appleTool('apple_set_build_encryption').handler(client as any, {
    buildId: 'build-2',
    usesNonExemptEncryption: true,
  });

  assert.equal(calls[0][0], '/apps/app-1');
  assert.deepEqual(calls[0][1].body.data, {
    type: 'apps',
    id: 'app-1',
    attributes: {
      contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT',
      primaryLocale: 'en-US',
    },
  });
  assert.equal(calls[1][0], '/builds/build-1');
  assert.deepEqual(calls[1][1].body.data.attributes, {
    usesNonExemptEncryption: false,
  });
  assert.match(nonExemptResult.exportComplianceNote, /may require an app encryption declaration/);
});

test('version release settings validate scheduling and support focused updates', async () => {
  const calls: any[] = [];
  const client = {
    request: async (...args: any[]) => { calls.push(args); return { ok: true }; },
  };
  const createTool = appleTool('apple_create_version');
  const updateTool = appleTool('apple_update_version');
  const scheduledDate = '2026-09-01T10:00:00+09:00';

  const createInput = createTool.schema.parse({
    appId: 'app-1',
    versionString: '2.0',
    releaseType: 'SCHEDULED',
    earliestReleaseDate: scheduledDate,
  });
  await createTool.handler(client as any, createInput);
  const updateInput = updateTool.schema.parse({
    versionId: 'version-1',
    versionString: '2.0.1',
    copyright: '2026 Example',
    releaseType: 'SCHEDULED',
    earliestReleaseDate: scheduledDate,
  });
  await updateTool.handler(client as any, updateInput);
  await updateTool.handler(client as any, updateTool.schema.parse({
    versionId: 'version-1',
    earliestReleaseDate: '2026-09-02T10:00:00+09:00',
  }));
  await updateTool.handler(client as any, updateTool.schema.parse({
    versionId: 'version-1',
    releaseType: 'SCHEDULED',
  }));

  assert.deepEqual(calls[0][1].body.data.attributes, {
    versionString: '2.0',
    platform: 'IOS',
    releaseType: 'SCHEDULED',
    earliestReleaseDate: scheduledDate,
  });
  assert.equal(calls[1][0], '/appStoreVersions/version-1');
  assert.deepEqual(calls[1][1].body.data.attributes, {
    versionString: '2.0.1',
    copyright: '2026 Example',
    releaseType: 'SCHEDULED',
    earliestReleaseDate: scheduledDate,
  });
  assert.deepEqual(calls[2][1].body.data.attributes, {
    earliestReleaseDate: '2026-09-02T10:00:00+09:00',
  });
  assert.deepEqual(calls[3][1].body.data.attributes, {
    releaseType: 'SCHEDULED',
  });

  assert.equal(createTool.schema.safeParse({
    appId: 'app-1',
    versionString: '2.0',
    releaseType: 'SCHEDULED',
    earliestReleaseDate: '2026-02-29T10:00:00Z',
  }).success, false);
  await assert.rejects(
    createTool.handler(client as any, {
      appId: 'app-1',
      versionString: '2.0',
      platform: 'IOS',
      releaseType: 'SCHEDULED',
    }),
    /SCHEDULED releases require earliestReleaseDate/,
  );
  await assert.rejects(
    createTool.handler(client as any, {
      appId: 'app-1',
      versionString: '2.0',
      platform: 'IOS',
      earliestReleaseDate: scheduledDate,
    }),
    /only valid when releaseType is SCHEDULED/,
  );
  await assert.rejects(
    updateTool.handler(client as any, {
      versionId: 'version-1',
      releaseType: 'MANUAL',
      earliestReleaseDate: scheduledDate,
    }),
    /only valid when releaseType is SCHEDULED/,
  );
  await assert.rejects(
    updateTool.handler(client as any, {
      versionId: 'version-1',
      releaseType: 'SCHEDULED',
      earliestReleaseDate: null,
    }),
    /releaseType=SCHEDULED cannot be combined with earliestReleaseDate=null/,
  );
  await assert.rejects(
    updateTool.handler(client as any, { versionId: 'version-1' }),
    /At least one App Store version attribute/,
  );
});

test('manual and phased release tools send official release resource payloads', async () => {
  const calls: any[] = [];
  const client = {
    request: async (...args: any[]) => { calls.push(args); return { data: { id: 'phase-1' } }; },
  };

  await appleTool('apple_release_version').handler(client as any, { versionId: 'version-1' });
  const createInput = appleTool('apple_create_phased_release').schema.parse({
    versionId: 'version-1',
  });
  await appleTool('apple_create_phased_release').handler(client as any, createInput);
  await appleTool('apple_get_phased_release').handler(client as any, { versionId: 'version-1' });
  await appleTool('apple_update_phased_release').handler(client as any, {
    phasedReleaseId: 'phase-1',
    state: 'COMPLETE',
  });
  await appleTool('apple_delete_phased_release').handler(client as any, {
    phasedReleaseId: 'phase-1',
  });

  assert.deepEqual(calls[0][1].body.data.relationships.appStoreVersion.data, {
    type: 'appStoreVersions',
    id: 'version-1',
  });
  assert.equal(calls[1][1].body.data.attributes.phasedReleaseState, 'INACTIVE');
  assert.equal(calls[2][0], '/appStoreVersions/version-1/appStoreVersionPhasedRelease');
  assert.equal(calls[3][1].body.data.attributes.phasedReleaseState, 'COMPLETE');
  assert.equal(calls[4][1].method, 'DELETE');
  assert.equal(appleTool('apple_create_phased_release').schema.safeParse({
    versionId: 'version-1',
    state: 'PAUSED',
  }).success, false);
  assert.equal(appleTool('apple_update_phased_release').schema.safeParse({
    phasedReleaseId: 'phase-1',
    state: 'INACTIVE',
  }).success, false);
});

test('availability tools create inline territories and patch existing records', async () => {
  const calls: any[] = [];
  const client = {
    request: async (...args: any[]) => { calls.push(args); return { ok: true }; },
  };
  const createTool = appleTool('apple_create_availability');
  const createInput = createTool.schema.parse({
    appId: 'app-1',
    territories: [
      { territoryId: 'USA' },
      { territoryId: 'KOR', releaseDate: null },
    ],
  });
  await createTool.handler(client as any, createInput);
  await appleTool('apple_update_territory_availability').handler(client as any, {
    territoryAvailabilityId: 'territory-record-1',
    available: false,
    releaseDate: null,
  });
  await appleTool('apple_update_territory_availability').handler(client as any, {
    territoryAvailabilityId: 'territory-record-1',
    preOrderEnabled: true,
  });

  const body = calls[0][1].body;
  assert.equal(calls[0][0], '/v2/appAvailabilities');
  assert.equal(body.data.attributes.availableInNewTerritories, true);
  assert.deepEqual(body.data.relationships.territoryAvailabilities.data, [
    { type: 'territoryAvailabilities', id: '${territoryAvailability-0}' },
    { type: 'territoryAvailabilities', id: '${territoryAvailability-1}' },
  ]);
  assert.deepEqual(body.included[0].attributes, {
    available: true,
    preOrderEnabled: false,
  });
  assert.deepEqual(body.included[1].relationships.territory.data, {
    type: 'territories',
    id: 'KOR',
  });
  assert.equal(calls[1][0], '/territoryAvailabilities/territory-record-1');
  assert.deepEqual(calls[1][1].body.data.attributes, {
    available: false,
    releaseDate: null,
  });
  assert.deepEqual(calls[2][1].body.data.attributes, {
    preOrderEnabled: true,
  });

  assert.equal(createTool.schema.safeParse({
    appId: 'app-1',
    territories: [{ territoryId: 'USA', releaseDate: '2026-02-29' }],
  }).success, false);
  await assert.rejects(
    createTool.handler(client as any, {
      appId: 'app-1',
      availableInNewTerritories: true,
      territories: [{
        territoryId: 'USA',
        available: true,
        preOrderEnabled: true,
      }],
    }),
    /preOrderEnabled=true requires a non-null releaseDate/,
  );
  await assert.rejects(
    appleTool('apple_update_territory_availability').handler(client as any, {
      territoryAvailabilityId: 'territory-record-1',
      preOrderEnabled: true,
      releaseDate: null,
    }),
    /preOrderEnabled=true cannot be combined with releaseDate=null/,
  );

  await assert.rejects(
    createTool.handler(client as any, {
      appId: 'app-1',
      availableInNewTerritories: true,
      territories: [
        { territoryId: 'USA', available: true, preOrderEnabled: false },
        { territoryId: 'USA', available: true, preOrderEnabled: false },
      ],
    }),
    /Duplicate Apple territory ID/,
  );
});

test('apple_upload_screenshot reserves, uploads, and commits the checksum', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-screenshot-upload-'));
  try {
    const filePath = join(directory, 'screen.png');
    const bytes = Buffer.from('png-payload');
    writeFileSync(filePath, bytes);
    const checksum = createHash('md5').update(bytes).digest('hex');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push(['request', path, options]);
        if (path === '/appScreenshots' && options?.method === 'POST') {
          return {
            data: {
              id: 'screenshot-normal',
              attributes: {
                uploadOperations: [
                  { method: 'PUT', url: 'https://upload.example/one', offset: 0, length: 4 },
                  {
                    method: 'PUT',
                    url: 'https://upload.example/two',
                    offset: 4,
                    length: bytes.length - 4,
                  },
                ],
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-normal' && options?.method === 'PATCH') {
          return { data: { id: 'screenshot-normal' } };
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async (operation: any, localPath: string) => {
        calls.push(['uploadOperation', operation, localPath]);
      },
    };

    const input = appleTool('apple_upload_screenshot').schema.parse({
      screenshotSetId: 'set-1',
      filePath,
      fileName: 'screen.png',
      fileSize: bytes.length,
    });
    const result = await appleTool('apple_upload_screenshot').handler(client as any, input);

    assert.deepEqual(result, { success: true, screenshotId: 'screenshot-normal' });
    assert.equal(calls.filter(call => call[0] === 'uploadOperation').length, 2);
    const commit = calls.find(call => (
      call[1] === '/appScreenshots/screenshot-normal' && call[2]?.method === 'PATCH'
    ));
    assert.deepEqual(commit[2].body.data.attributes, {
      uploaded: true,
      sourceFileChecksum: checksum,
    });
    assert.equal(calls.some(call => call[2]?.method === 'DELETE'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_screenshot cleans up its reservation after a chunk upload failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-screenshot-chunk-'));
  try {
    const filePath = join(directory, 'screen.png');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/appScreenshots' && options?.method === 'POST') {
          return {
            data: {
              id: 'screenshot-chunk',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-chunk' && options?.method === 'DELETE') {
          return {};
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => { throw new Error('chunk upload failed'); },
    };

    await assert.rejects(
      appleTool('apple_upload_screenshot').handler(client as any, {
        screenshotSetId: 'set-1',
        filePath,
        fileName: 'screen.png',
      }),
      /screenshot-chunk failed before commit; reservation cleanup succeeded.*chunk upload failed/,
    );
    assert.equal(calls.some(call => (
      call[0] === '/appScreenshots/screenshot-chunk' && call[1]?.method === 'DELETE'
    )), true);
    assert.equal(calls.some(call => call[1]?.method === 'PATCH'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_screenshot cleans up a definitively rejected commit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-screenshot-rejected-'));
  try {
    const filePath = join(directory, 'screen.png');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/appScreenshots' && options?.method === 'POST') {
          return {
            data: {
              id: 'screenshot-rejected',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-rejected' && options?.method === 'PATCH') {
          throw new AppleApiError(
            'Apple rejected the screenshot commit',
            422,
            'PATCH',
            path,
            '{"errors":[{"code":"ENTITY_ERROR"}]}',
          );
        }
        if (path === '/appScreenshots/screenshot-rejected' && options?.method === 'DELETE') {
          return {};
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    await assert.rejects(
      appleTool('apple_upload_screenshot').handler(client as any, {
        screenshotSetId: 'set-1',
        filePath,
        fileName: 'screen.png',
      }),
      /screenshot-rejected commit was rejected; reservation cleanup succeeded.*Apple rejected/,
    );
    assert.equal(calls.some(call => call[1]?.method === undefined), false);
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_screenshot reconciles an ambiguous 409 commit that reached Apple', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-screenshot-reconciled-'));
  try {
    const filePath = join(directory, 'screen.png');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/appScreenshots' && options?.method === 'POST') {
          return {
            data: {
              id: 'screenshot-reconciled',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-reconciled' && options?.method === 'PATCH') {
          throw new AppleApiError(
            'Apple reported a screenshot commit conflict',
            409,
            'PATCH',
            path,
            '{"errors":[{"code":"ENTITY_ERROR.RELATIONSHIP.INVALID"}]}',
          );
        }
        if (path === '/appScreenshots/screenshot-reconciled' && options?.method === undefined) {
          return {
            data: {
              id: 'screenshot-reconciled',
              attributes: { assetDeliveryState: { state: 'UPLOAD_COMPLETE' } },
            },
          };
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    const result = await appleTool('apple_upload_screenshot').handler(client as any, {
      screenshotSetId: 'set-1',
      filePath,
      fileName: 'screen.png',
    });
    assert.deepEqual(result, { success: true, screenshotId: 'screenshot-reconciled' });
    assert.equal(calls.filter(call => call[1]?.method === 'PATCH').length, 1);
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
    const statusRead = calls.find(call => call[1]?.method === undefined);
    assert.equal(
      statusRead[1].params['fields[appScreenshots]'].includes('uploadOperations'),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_screenshot retains its ID after an ambiguous commit retry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-screenshot-retained-'));
  try {
    const filePath = join(directory, 'screen.png');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/appScreenshots' && options?.method === 'POST') {
          return {
            data: {
              id: 'screenshot-retained',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-retained' && options?.method === 'PATCH') {
          throw new AppleApiError(
            'Apple commit service unavailable',
            503,
            'PATCH',
            path,
            '{"errors":[{"code":"SERVICE_UNAVAILABLE"}]}',
          );
        }
        if (path === '/appScreenshots/screenshot-retained' && options?.method === undefined) {
          return {
            data: {
              id: 'screenshot-retained',
              attributes: { assetDeliveryState: { state: 'AWAITING_UPLOAD' } },
            },
          };
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    await assert.rejects(
      appleTool('apple_upload_screenshot').handler(client as any, {
        screenshotSetId: 'set-1',
        filePath,
        fileName: 'screen.png',
      }),
      /screenshot-retained commit outcome is ambiguous; screenshot was retained.*remained AWAITING_UPLOAD/,
    );
    assert.equal(calls.filter(call => call[1]?.method === 'PATCH').length, 2);
    assert.equal(calls.filter(call => call[1]?.method === undefined).length, 2);
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_screenshot retains its ID when commit status cannot be read', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-screenshot-status-'));
  try {
    const filePath = join(directory, 'screen.png');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/appScreenshots' && options?.method === 'POST') {
          return {
            data: {
              id: 'screenshot-status',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-status' && options?.method === 'PATCH') {
          throw new Error('commit response unavailable');
        }
        if (path === '/appScreenshots/screenshot-status' && options?.method === undefined) {
          throw new Error('status unavailable');
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    await assert.rejects(
      appleTool('apple_upload_screenshot').handler(client as any, {
        screenshotSetId: 'set-1',
        filePath,
        fileName: 'screen.png',
      }),
      /screenshot-status commit outcome is ambiguous; screenshot was retained.*Status read failed: status unavailable/,
    );
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_screenshot preserves FAILED details and cleans up', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-screenshot-failed-'));
  try {
    const filePath = join(directory, 'screen.png');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/appScreenshots' && options?.method === 'POST') {
          return {
            data: {
              id: 'screenshot-failed',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-failed' && options?.method === 'PATCH') {
          throw new AppleApiError(
            'Apple commit timed out',
            408,
            'PATCH',
            path,
            '{"errors":[{"code":"REQUEST_TIMEOUT"}]}',
          );
        }
        if (path === '/appScreenshots/screenshot-failed' && options?.method === undefined) {
          return {
            data: {
              id: 'screenshot-failed',
              attributes: {
                assetDeliveryState: {
                  state: 'FAILED',
                  errors: [{ code: 'INVALID_IMAGE', description: 'Invalid dimensions' }],
                },
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-failed' && options?.method === 'DELETE') {
          return {};
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    await assert.rejects(
      appleTool('apple_upload_screenshot').handler(client as any, {
        screenshotSetId: 'set-1',
        filePath,
        fileName: 'screen.png',
      }),
      /screenshot-failed delivery failed:.*INVALID_IMAGE.*Invalid dimensions.*reservation cleanup succeeded/,
    );
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('apple_upload_screenshot rechecks state after a retry is rejected', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'app-publish-screenshot-retry-rejected-'));
  try {
    const filePath = join(directory, 'screen.png');
    writeFileSync(filePath, 'payload');
    const calls: any[] = [];
    let commitAttempts = 0;
    let statusReads = 0;
    const client = {
      request: async (path: string, options?: any) => {
        calls.push([path, options]);
        if (path === '/appScreenshots' && options?.method === 'POST') {
          return {
            data: {
              id: 'screenshot-retry-rejected',
              attributes: {
                uploadOperations: [{
                  method: 'PUT',
                  url: 'https://upload.example/chunk',
                  offset: 0,
                  length: 7,
                }],
              },
            },
          };
        }
        if (path === '/appScreenshots/screenshot-retry-rejected' && options?.method === 'PATCH') {
          commitAttempts += 1;
          if (commitAttempts === 1) throw new Error('initial commit response was lost');
          throw new AppleApiError(
            'Apple rejected the duplicate commit',
            422,
            'PATCH',
            path,
            '{"errors":[{"code":"ENTITY_ERROR"}]}',
          );
        }
        if (
          path === '/appScreenshots/screenshot-retry-rejected'
          && options?.method === undefined
        ) {
          statusReads += 1;
          return {
            data: {
              id: 'screenshot-retry-rejected',
              attributes: {
                assetDeliveryState: {
                  state: statusReads === 1 ? 'AWAITING_UPLOAD' : 'UPLOAD_COMPLETE',
                },
              },
            },
          };
        }
        throw new Error(`Unexpected request ${path}`);
      },
      uploadOperation: async () => {},
    };

    const result = await appleTool('apple_upload_screenshot').handler(client as any, {
      screenshotSetId: 'set-1',
      filePath,
      fileName: 'screen.png',
    });
    assert.deepEqual(result, {
      success: true,
      screenshotId: 'screenshot-retry-rejected',
    });
    assert.equal(commitAttempts, 2);
    assert.equal(statusReads, 2);
    assert.equal(calls.some(call => call[1]?.method === 'DELETE'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

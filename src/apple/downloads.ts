export const MAX_REPORT_DOWNLOAD_BYTES = 32 * 1024 * 1024;
export const MAX_REPORT_TEXT_BYTES = 64 * 1024 * 1024;

export class DownloadLimitError extends Error {}

/** Bound the bytes consumed, including responses without Content-Length. */
export async function readBoundedResponse(response: Response, limit = MAX_REPORT_DOWNLOAD_BYTES): Promise<Buffer> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) {
    await response.body?.cancel();
    throw new DownloadLimitError(`Report download exceeds the ${limit}-byte limit`);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new DownloadLimitError(`Report download exceeds the ${limit}-byte limit`);
      chunks.push(value);
    }
    return Buffer.concat(chunks, total);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

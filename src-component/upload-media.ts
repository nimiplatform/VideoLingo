import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import { sourceAssetPath, type VideoLingoProject } from '../src-electron/project-types.js';

export async function uploadProjectMedia(projectId: string, file: File, storage: NimiLocalAppClient['storage'],
  attach: (name: string, uploadId: string) => Promise<VideoLingoProject>, signal: AbortSignal, progress: (bytes: number) => void) {
  if (!file.size || file.size > 4 * 1024 ** 3) throw new Error('Choose a non-empty media file up to 4 GB');
  const uploadId = crypto.randomUUID(), relativePath = sourceAssetPath(projectId, file.name, uploadId);
  signal.throwIfAborted();
  async function* body() {
    const reader = file.stream().getReader(); let received = 0;
    try {
      while (true) {
        signal.throwIfAborted(); const part = await reader.read(); if (part.done) break;
        signal.throwIfAborted(); received += part.value.byteLength; yield part.value; progress(received);
      }
    } finally { await reader.cancel(); }
  }
  try {
    await storage.assets.write({ relativePath, body: body(), mediaType: file.type || 'application/octet-stream' });
    signal.throwIfAborted(); return await attach(file.name, uploadId);
  } catch (error) {
    // Only this attempt's new UUID path is removed; the previous source stays bound.
    try { await storage.assets.remove(relativePath); } catch { /* Preserve the upload/attachment failure. */ }
    throw error;
  }
}

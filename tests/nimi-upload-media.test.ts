import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadProjectMedia } from '../src-component/upload-media.ts';

test('canceling an import removes only its unbound upload and never attaches partial media', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', controller = new AbortController();
  let uploadPath = '', attached = false; const removed: string[] = [];
  const storage = { assets: {
    write: async ({ relativePath, body }: { relativePath: string; body: AsyncIterable<Uint8Array> }) => {
      uploadPath = relativePath;
      for await (const part of body) { assert.ok(part.length); controller.abort(); }
    },
    remove: async (path: string) => { removed.push(path); },
  } };
  await assert.rejects(uploadProjectMedia(id, new File(['actual input bytes'], 'clip.mp4', { type: 'video/mp4' }), storage as never,
    async () => { attached = true; throw new Error('Must not attach'); }, controller.signal, () => {}), /abort/i);
  assert.match(uploadPath, new RegExp(`^projects/${id}/input/[0-9a-f-]+\\.mp4$`));
  assert.deepEqual(removed, [uploadPath]); assert.equal(attached, false);
});

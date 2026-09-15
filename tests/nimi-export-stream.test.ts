import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Projects } from '../src-electron/projects.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('an incomplete managed stream cannot replace an existing user export', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'videolingo-export-test-'));
  const filename = path.join(directory, 'video.mp4');
  await writeFile(filename, 'original user file');
  const projects = new Projects({ storage: {
    readJson: async () => ({ value: { id, chunks: [], outputPaths: [], state: 'transcribed' } }),
    assets: { stat: async () => ({ sizeBytes: 100 }), read: async () => ({ range: { length: 100 }, body: (async function* () { yield Buffer.from('short'); })() }) },
  } as never, aiConfig: {} as never, ai: {} as never }, process.cwd());
  try {
    await assert.rejects(projects.exportAsset(id, `projects/${id}/results/video.mp4`, filename), /all bytes/);
    assert.equal(await readFile(filename, 'utf8'), 'original user file');
    assert.deepEqual(await readdir(directory), ['video.mp4']);
    await assert.rejects(projects.exportInfo(id, 'projects/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/file'), /this project/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

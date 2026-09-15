import test from 'node:test';
import assert from 'node:assert/strict';
import { Projects } from '../src-electron/projects.ts';
import { DEFAULT_BUSINESS_SETTINGS } from '../src-electron/business-settings.ts';
import type { VideoLingoProject } from '../src-electron/project-types.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture() {
  const prefix = `projects/${id}/`;
  const records = new Map<string, unknown>();
  const project: VideoLingoProject = { id, title: 'Lifecycle fixture', createdAt: '', updatedAt: '', state: 'transcribed', languageHint: 'en',
    source: { assetPath: prefix + 'input/source.mp4', name: 'source.mp4', mediaType: 'video/mp4', sizeBytes: 4, sha256: 'fixture' },
    chunks: [{ assetPath: prefix + 'chunks/0.wav', offsetSeconds: 0, durationSeconds: 1, resultPath: prefix + 'chunks/0.transcription.json' }],
    currentChunk: 1, transcript: 'Retained original text', wordCount: 3, outputPaths: [prefix + 'results/words.csv'],
    dubbing: { state: 'completed', key: 'old', input: { voiceKind: 'preset', voiceId: 'chosen', burnSubtitles: true }, jobs: {}, voices: {}, audio: {}, files: {} } };
  records.set(prefix + 'project.json', structuredClone(project)); records.set(prefix + 'chunks/0.transcription.json', { text: 'Original' });
  const assets = new Map([prefix + 'input/source.mp4', prefix + 'chunks/0.wav', prefix + 'results/words.csv', prefix + 'dubbing/run/speech.wav',
    prefix + 'voice-reference/reference.wav', `projects/${other}/input/other.mp4`].map(path => [path, Buffer.from(path)]));
  let failRemoval = false, modelCalls = 0;
  const app = new Projects({ storage: {
    readJson: async (path: string) => ({ value: structuredClone(records.get(path)) }),
    writeJson: async (path: string, value: unknown) => { records.set(path, structuredClone(value)); },
    removeJson: async (path: string) => ({ removed: records.delete(path) }),
    assets: {
      list: async ({ prefix, cursor }: { prefix: string; cursor?: string }) => { const all = [...assets].filter(([path]) => path.startsWith(prefix)); const offset = Number(cursor || 0);
        return { assets: all.slice(offset, offset + 2).map(([relativePath, data]) => ({ relativePath, sizeBytes: data.length })), nextCursor: offset + 2 < all.length ? String(offset + 2) : '' }; },
      remove: async (path: string) => { if (failRemoval) { failRemoval = false; throw new Error('Storage interrupted'); } return { removed: assets.delete(path) }; },
      stat: async (path: string) => ({ sizeBytes: assets.get(path)!.length }),
    },
  } as never, aiConfig: {} as never, ai: { text: {}, scenarioJobs: { get: async () => { modelCalls++; throw new Error('Unexpected model access'); } } } as never }, process.cwd());
  return { app, assets, records, project, prefix, failNextRemoval: () => { failRemoval = true; }, modelCalls: () => modelCalls };
}

test('archiving keeps readable files and blocks mutation until explicitly restored', async () => {
  const f = fixture(), before = [...f.assets];
  assert.ok((await f.app.archive(id, true)).archivedAt);
  assert.ok((await f.app.exportInfo(id, f.project.source!.assetPath)).sizeBytes);
  await assert.rejects(f.app.updateSettings(id, { ...DEFAULT_BUSINESS_SETTINGS }), /Restore the archived/);
  assert.deepEqual([...f.assets], before);
  assert.equal((await f.app.archive(id, false)).archivedAt, undefined);
  assert.equal(f.modelCalls(), 0);
});

test('voice preferences can be saved for future single and batch work without changing completed media', async () => {
  const f = fixture(), before = structuredClone(f.project), assets = [...f.assets];
  const saved = await f.app.updateDubbingSettings(id, { voiceKind: 'preset', voiceId: 'chosen-voice', burnSubtitles: false });
  assert.deepEqual(saved.dubbingSettings, { voiceKind: 'preset', voiceId: 'chosen-voice', burnSubtitles: false });
  assert.deepEqual(saved.dubbing, before.dubbing);
  assert.deepEqual(saved.source, before.source);
  assert.deepEqual([...f.assets], assets);
  assert.equal(f.modelCalls(), 0);
});

test('deleting dubbing keeps the source, subtitles and supplied reference', async () => {
  const f = fixture(), result = await f.app.clear(id, 'dubbing');
  assert.equal(result.dubbing, undefined); assert.equal(result.transcript, f.project.transcript);
  assert.ok(f.assets.has(f.project.source!.assetPath)); assert.ok(f.assets.has(f.prefix + 'voice-reference/reference.wav'));
  assert.ok(![...f.assets.keys()].some(path => path.startsWith(f.prefix + 'dubbing/')));
  assert.equal(f.modelCalls(), 0);
});

test('interrupted media cleanup is retryable and cannot remove another project', async () => {
  const f = fixture(); f.failNextRemoval();
  await assert.rejects(f.app.clear(id, 'media'), /Storage interrupted/);
  assert.equal((await f.app.get(id)).cleanupPending, 'media');
  await assert.rejects(f.app.updateSettings(id, { ...DEFAULT_BUSINESS_SETTINGS }), /pending media cleanup/);
  const result = await f.app.clear(id, 'media');
  assert.equal(result.state, 'empty'); assert.equal(result.cleanupPending, undefined);
  assert.equal(result.source, undefined); assert.equal(result.chunks.length, 0);
  assert.ok(![...f.assets.keys()].some(path => path.startsWith(f.prefix)));
  assert.ok(f.assets.has(`projects/${other}/input/other.mp4`));
  assert.ok(!f.records.has(f.prefix + 'chunks/0.transcription.json'));
  assert.equal(f.modelCalls(), 0);
});

test('business settings are saved without deleting existing results or invoking AI', async () => {
  const f = fixture();
  const saved = await f.app.updateSettings(id, { ...DEFAULT_BUSINESS_SETTINGS, maxSplitLength: 40, subtitleMaxLength: 120, minSubtitleDuration: .5 });
  assert.equal(saved.settings?.maxSplitLength, 40); assert.equal(saved.transcript, f.project.transcript);
  assert.deepEqual(saved.outputPaths, f.project.outputPaths);
  await assert.rejects(f.app.updateSettings(id, { ...DEFAULT_BUSINESS_SETTINGS, rawSampleRate: 17000 }), /supported MP3/);
  await assert.rejects(f.app.updateSettings(id, { ...DEFAULT_BUSINESS_SETTINGS, customTermsAssetPath: `projects/${other}/terms/file.xlsx` }), /this project/);
  assert.equal(f.modelCalls(), 0);
});

// Deterministic subtitle/storage boundaries; no successful AI substitute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Projects } from '../src-electron/projects.ts';
import { formatSrt, parseSrt, subtitleIssues, subtitleOutputs, subtitleKey, type SubtitleContent } from '../src-electron/subtitles.ts';
import type { VideoLingoProject } from '../src-electron/project-types.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const display = formatSrt([{ start: 100, end: 1000, text: 'First line.' }, { start: 1200, end: 2300, text: 'Second line.' }]);
const audio = formatSrt([{ start: 100, end: 2300, text: 'First line. Second line.' }]);
const content: SubtitleContent = { display: { source: display, translation: display }, dubbing: { source: audio, translation: audio } };

function setup(input = content) {
  const assets = new Map<string, Uint8Array>(), records = new Map<string, VideoLingoProject>();
  const files = Object.fromEntries(Object.entries(subtitleOutputs(input)).map(([name, text]) => {
    const path = `projects/${id}/translation/original/${name}`; assets.set(path, Buffer.from(text)); return [name, path];
  }));
  const original: VideoLingoProject = { id, title: 'Subtitle fixture', state: 'transcribed', createdAt: '', updatedAt: '', languageHint: 'en', currentChunk: 1,
    chunks: [{ assetPath: `projects/${id}/audio.wav`, offsetSeconds: 0, durationSeconds: 4 }], outputPaths: [`projects/${id}/results/words.csv`],
    source: { name: 'source.mp4', mediaType: 'video/mp4', assetPath: `projects/${id}/source.mp4`, sizeBytes: 1, sha256: 'original' },
    transcript: 'Original ASR', translation: { state: 'completed', key: 'original', input: { targetLanguage: 'zh', reflect: true }, files, jobs: {}, completedSteps: [] },
    separation: { state: 'completed', selectionKey: '', pairs: [], currentChunk: 1, vocalsPath: 'vocals', backgroundPath: 'background' },
    subtitleVideo: { translationKey: 'original', assetPath: 'previous.mp4' },
    dubbing: { state: 'completed', key: 'old', input: { voiceKind: 'preset', voiceId: 'test', burnSubtitles: true }, jobs: {}, voices: {}, audio: {}, files: {} } };
  records.set(id, structuredClone(original)); records.set(other, { ...structuredClone(original), id: other });
  let aiCalls = 0, failWrite = false;
  const projects = new Projects({ storage: {
    readJson: async (path: string) => ({ value: structuredClone(records.get(path.split('/')[1]!)!) }),
    writeJson: async (path: string, value: VideoLingoProject) => { records.set(path.split('/')[1]!, structuredClone(value)); },
    assets: {
      read: async ({ relativePath }: { relativePath: string }) => { const bytes = assets.get(relativePath)!; if (!bytes) throw new Error('Missing fixture asset');
        return { range: { length: bytes.byteLength }, body: (async function* () { yield bytes; })() }; },
      stat: async (relativePath: string) => ({ sizeBytes: assets.get(relativePath)!.byteLength }),
      write: async ({ relativePath, body }: { relativePath: string; body: Uint8Array }) => { if (failWrite) throw new Error('Storage refused write'); assets.set(relativePath, body); },
    },
  } as never, aiConfig: { get: async () => { aiCalls++; throw new Error('No AI in proofreading'); } } as never, ai: {} as never }, process.cwd());
  return { projects, records, assets, original, aiCalls: () => aiCalls, failWrites: () => { failWrite = true; } };
}

test('SRT validation identifies exact bad cues without adjusting their endpoints', () => {
  assert.deepEqual(parseSrt(display.replaceAll('\n\n', '\n\n\n')), parseSrt(display));
  const bad = formatSrt([{ start: 1000, end: 1000, text: 'Zero' }, { start: 500, end: 5000, text: 'Overlap' }]);
  const value = { ...content, display: { source: bad, translation: bad } };
  const issues = subtitleIssues(value, 4000);
  assert.ok(issues.some(issue => issue.includes('#1: end must be after start')));
  assert.ok(issues.some(issue => issue.includes('#2: time exceeds source duration')));
  assert.ok(issues.some(issue => issue.includes('#2: overlaps')));
  assert.equal(parseSrt(value.display.source)[0]!.end, 1000);
  assert.throws(() => parseSrt('1\n00:00:aa,000 --> 00:00:02,000\nText'), /cue 1/);
  assert.ok(subtitleIssues({ ...content, display: { source: display, translation: audio } }, 4000).some(issue => issue.includes('counts differ')));
});

test('invalid original drafts remain exportable but cannot start rendering, dubbing or final export', async () => {
  const bad = formatSrt([{ start: 1000, end: 1000, text: 'Unaligned original' }]);
  const f = setup({ display: { source: bad, translation: bad }, dubbing: { source: bad, translation: bad } });
  const assetPath = f.original.translation!.files['output/src.srt']!;
  assert.ok((await f.projects.subtitles(id)).issues.length);
  assert.ok((await f.projects.exportInfo(id, assetPath, true)).sizeBytes > 0);
  await assert.rejects(f.projects.exportInfo(id, assetPath), /proofreading required/);
  await assert.rejects(f.projects.renderSubtitles(id), /proofreading required/);
  delete f.records.get(id)!.separation;
  await assert.rejects(f.projects.dub(id, { voiceKind: 'preset', voiceId: 'test', burnSubtitles: true }), /proofreading required/);
  assert.equal(f.aiCalls(), 0);
});

test('saving user text preserves ASR and original assets, keeps audio segmentation, and invalidates derived media', async () => {
  const f = setup(), before = new Map([...f.assets].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const loaded = await f.projects.subtitles(id);
  const updated = await f.projects.saveSubtitles(id, { ...loaded, display: { ...loaded.display, translation: loaded.display.translation.replace('First line.', 'User edit.') } });
  assert.equal(updated.transcript, 'Original ASR'); assert.deepEqual(updated.translation, f.original.translation);
  assert.equal(updated.subtitleVideo, undefined); assert.equal(updated.dubbing, undefined);
  assert.notEqual(subtitleKey(updated), 'original');
  for (const [path, bytes] of before) assert.deepEqual(f.assets.get(path), bytes);
  const saved = await f.projects.subtitles(id);
  assert.equal(saved.origin, 'user'); assert.equal(saved.issues.length, 0);
  assert.equal(parseSrt(saved.display.source).length, 2); assert.equal(parseSrt(saved.dubbing.source).length, 1);
  assert.ok(saved.display.translation.includes('User edit.')); assert.equal(f.aiCalls(), 0);
  assert.equal(f.records.get(other)!.subtitleRevision, undefined);
  await assert.rejects(f.projects.saveSubtitles(id, loaded), /changed; reload/);
  await assert.rejects(f.projects.exportInfo(other, saved.files['output/trans.srt']!, true), /this project/);
  await assert.rejects(f.projects.exportInfo(id, f.original.translation!.files['output/src.srt']!), /current subtitle revision/);
  assert.ok((await f.projects.exportInfo(id, f.original.translation!.files['output/src.srt']!, true)).sizeBytes > 0);
});

test('a draft with pairing errors can be saved and reloaded, while consumers remain blocked', async () => {
  const f = setup(), loaded = await f.projects.subtitles(id);
  await f.projects.saveSubtitles(id, { ...loaded, display: { source: display, translation: audio } });
  const saved = await f.projects.subtitles(id);
  assert.equal(saved.display.translation, audio); assert.ok(saved.issues.some(issue => issue.includes('counts differ')));
  await assert.rejects(f.projects.validateSubtitles(id), /proofreading required/);
  assert.ok((await f.projects.exportInfo(id, saved.files['output/trans.srt']!, true)).sizeBytes > 0);
});

test('failed storage and an active batch cannot replace the saved subtitle revision', async () => {
  const f = setup(), loaded = await f.projects.subtitles(id);
  f.projects.claim([id], 'batch'); await assert.rejects(f.projects.saveSubtitles(id, loaded), /Pause the batch/); f.projects.release('batch');
  f.failWrites(); await assert.rejects(f.projects.saveSubtitles(id, loaded), /Storage refused/);
  assert.equal(f.records.get(id)!.subtitleRevision, undefined);
  assert.deepEqual(f.records.get(id)!.dubbing, f.original.dubbing);
});

// Queue control tests use persisted state fixtures and refusals, not successful model doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNimiError } from '@nimiplatform/sdk/types';
import { Batches, type Batch, type BatchItemInput } from '../src-electron/batches.ts';
import type { VideoLingoProject } from '../src-electron/project-types.ts';
import { DEFAULT_BUSINESS_SETTINGS } from '../src-electron/business-settings.ts';

const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function setup() {
  const data = new Map<string, unknown>();
  const projects = new Map<string, VideoLingoProject>([first, second].map(id => [id, { id, title: id, createdAt: '', updatedAt: '', state: 'ready',
    chunks: [], currentChunk: 0, outputPaths: [], languageHint: '', source: { assetPath: `projects/${id}/input/clip.mp4`, mediaType: 'video/mp4', name: 'clip.mp4', sizeBytes: 1, sha256: id } }]));
  const started: string[] = [], released: string[] = [];
  const storage = { readJson: async (key: string) => { if (!data.has(key)) throw createNimiError({ message: 'Missing record', reasonCode: 'APP_STORAGE_ENTRY_NOT_FOUND' }); return { value: structuredClone(data.get(key)) }; },
    writeJson: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); } };
  const methods = { get: async (id: string) => structuredClone(projects.get(id)!),
    setWorkflow: async (id: string, workflowId: string) => { projects.get(id)!.workflowId = workflowId; },
    start: async (id: string): Promise<VideoLingoProject> => { started.push(id); throw createNimiError({ message: `Refused ${id}`, reasonCode: 'APP_AUTHORIZATION_DENIED', retryable: false }); },
    settled: async (id: string) => structuredClone(projects.get(id)!), control: async (id: string) => structuredClone(projects.get(id)!),
    claim: () => {}, release: (id: string) => { released.push(id); },
    splitNlp: async () => { throw new Error('Not expected'); }, translate: async () => { throw new Error('Not expected'); }, validateSubtitles: async () => {},
    separate: async () => { throw new Error('Not expected'); }, dub: async () => { throw new Error('Not expected'); }, renderSubtitles: async () => { throw new Error('Not expected'); } };
  const make = () => new Batches(storage as never, methods);
  const items: BatchItemInput[] = [first, second].map(projectId => ({ projectId, sourceLanguage: 'en', targetLanguage: 'Chinese', burnSubtitles: false }));
  return { data, projects, methods, started, released, make, items };
}

test('batch errors remain on their ordered entry and completed entries are skipped on explicit retry', async () => {
  const f = setup();
  // The second entry already has durable business results. No model is called for it.
  Object.assign(f.projects.get(second)!, { transcript: 'Existing source', languageHint: 'en', detectedLanguage: 'en', state: 'transcribed', nlp: { state: 'completed' },
    translation: { state: 'completed', input: { targetLanguage: 'Chinese', reflect: true } } });
  const batches = f.make(), batch = await batches.create('Two projects', f.items);
  await batches.resume(batch.id); let result = await batches.settled(batch.id);
  assert.equal(result.state, 'completed-with-errors');
  assert.deepEqual(result.items.map(item => item.state), ['failed', 'completed']);
  assert.equal(result.items[0]!.step, 'transcribe');
  assert.equal(result.items[0]!.failure?.reasonCode, 'APP_AUTHORIZATION_DENIED');
  assert.deepEqual(f.started, [first]);
  await batches.resume(batch.id); result = await batches.settled(batch.id);
  assert.deepEqual(f.started, [first, first]);
  assert.equal(result.items[1]!.state, 'completed');
});

test('restart presents a persisted running batch as interrupted without dispatch', async () => {
  const f = setup(), batches = f.make(), batch = await batches.create('Restart', f.items);
  const stored = f.data.get(`batches/${batch.id}.json`) as { state: string }; stored.state = 'running';
  const item = f.data.get(`batches/${batch.id}/items/${batch.items[0]!.id}.json`) as { state: string }; item.state = 'running';
  const restarted = f.make();
  assert.equal((await restarted.get(batch.id)).state, 'interrupted');
  assert.deepEqual(f.started, []);
});

test('the single-project subtitle action uses existing results and reaches the original final rendering step', async () => {
  const f = setup(); let renders = 0;
  Object.assign(f.projects.get(first)!, { transcript: 'Existing source', detectedLanguage: 'en', state: 'transcribed', nlp: { state: 'completed' },
    translation: { state: 'completed', key: 'existing-translation', input: { targetLanguage: 'Chinese', reflect: true } } });
  f.methods.renderSubtitles = async () => { renders++; throw new Error('Rendering deliberately refused'); };
  const batches = f.make(); const run = await batches.runProject(first, 'subtitles');
  const result = await batches.settled(run.id);
  assert.equal(result.purpose, 'subtitles'); assert.equal(f.projects.get(first)!.workflowId, run.id);
  assert.equal(renders, 1); assert.deepEqual(f.started, []);
  assert.equal(result.items[0]!.step, 'subtitle-video'); assert.match(result.items[0]!.error!, /Rendering deliberately refused/);
});

test('enabling vocal enhancement never reuses an existing original-track transcript', async () => {
  const f = setup();
  Object.assign(f.projects.get(first)!, { transcript: 'Original-track result', wordCount: 3, languageHint: 'en', state: 'transcribed',
    settings: { ...DEFAULT_BUSINESS_SETTINGS, sourceLanguage: 'en', targetLanguage: 'Chinese', vocalEnhancement: true },
    separation: { state: 'completed', sourceSettings: { sourceHash: first }, vocalsPath: `projects/${first}/separation/vocals.wav` } });
  const batches = f.make(), batch = await batches.create('Enhanced input', [f.items[0]!]);
  await batches.resume(batch.id); const result = await batches.settled(batch.id);
  assert.deepEqual(f.started, [first]); assert.equal(result.items[0]!.step, 'transcribe');
  assert.equal(result.items[0]!.failure?.reasonCode, 'APP_AUTHORIZATION_DENIED');
});

test('an explicit change from an en hint to automatic recognition requires a new transcription', async () => {
  const f = setup();
  Object.assign(f.projects.get(first)!, { transcript: 'Hinted result', wordCount: 3, languageHint: 'en', detectedLanguage: 'en', state: 'transcribed' });
  const batches = f.make(), batch = await batches.create('Automatic input', [{ ...f.items[0]!, sourceLanguage: '' }]);
  await batches.resume(batch.id); await batches.settled(batch.id);
  assert.deepEqual(f.started, [first]);
});

test('an audio source finishes at subtitle generation without a video step', async () => {
  const f = setup();
  Object.assign(f.projects.get(first)!, { transcript: 'Existing audio result', languageHint: 'en', state: 'transcribed', nlp: { state: 'completed' },
    translation: { state: 'completed', key: 'existing-audio-translation', input: { targetLanguage: 'Chinese', reflect: true } } });
  f.projects.get(first)!.source!.mediaType = 'audio/wav';
  let rendered = false; f.methods.renderSubtitles = async () => { rendered = true; throw new Error('Audio must not render video'); };
  const batches = f.make(), batch = await batches.create('Audio output', [{ ...f.items[0]!, burnSubtitles: true }]);
  await batches.resume(batch.id); const result = await batches.settled(batch.id);
  assert.equal(result.state, 'completed'); assert.equal(result.items[0]!.step, 'translate');
  assert.equal(rendered, false); assert.deepEqual(f.started, []);
});

test('pause during stage start cancels once it starts and never dispatches the next entry', async () => {
  const f = setup();
  let startResolve!: (project: VideoLingoProject) => void, startedResolve!: () => void, canceled = 0;
  const starting = new Promise<void>(resolve => { startedResolve = resolve; });
  f.methods.start = async id => { f.started.push(id); startedResolve(); return new Promise(resolve => { startResolve = resolve; }); };
  f.methods.control = async id => { canceled++; return f.projects.get(id)!; };
  const batches = f.make(), batch = await batches.create('Pause', f.items);
  await batches.resume(batch.id); await starting;
  const stopping = batches.pause(batch.id); startResolve(f.projects.get(first)!);
  const stopped = await stopping;
  assert.equal(stopped.state, 'paused'); assert.equal(stopped.items[0]!.state, 'paused'); assert.equal(stopped.items[1]!.state, 'queued');
  assert.ok(canceled >= 1); assert.deepEqual(f.started, [first]);
});

test('changed source is refused rather than borrowing another input under a saved queue entry', async () => {
  const f = setup(), batches = f.make(), batch = await batches.create('Changed', [f.items[0]!]);
  f.projects.get(first)!.source!.sha256 = 'different';
  await batches.resume(batch.id); const result = await batches.settled(batch.id);
  assert.equal(result.items[0]!.state, 'failed'); assert.match(result.items[0]!.error!, /source changed/); assert.deepEqual(f.started, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createNimiError } from '@nimiplatform/sdk/types';
import { Projects } from '../src-electron/projects.ts';
import type { VideoLingoProject } from '../src-electron/project-types.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(kind: 'transcribe' | 'separate', reason: string) {
  const capabilityContract = kind === 'transcribe' ? 'audio.transcribe' : 'audio.separate';
  const resource = { oneofKind: 'local', local: { loadoutRef: 'selection' } };
  const intent = { capabilityContract, route: { oneofKind: 'local', local: {} } };
  const selectionKey = JSON.stringify({ intent, resource });
  let project: VideoLingoProject = { id, title: 'Recovery fixture', createdAt: '', updatedAt: '', state: 'interrupted', languageHint: 'en',
    source: { name: 'source.wav', assetPath: `projects/${id}/input/source.wav`, mediaType: 'audio/wav', sizeBytes: 1, sha256: 'fixture' },
    chunks: [{ assetPath: 'chunk0', offsetSeconds: 0, durationSeconds: 1, resultPath: 'completed0' }, { assetPath: 'chunk1', offsetSeconds: 1, durationSeconds: 1 }],
    currentChunk: 1, outputPaths: [], selectionKey,
    ...(kind === 'transcribe' ? { runtimeJobId: 'expired' } : { transcript: 'Already transcribed', separation: { state: 'interrupted' as const, selectionKey,
      currentChunk: 1, runtimeJobId: 'expired', pairs: [{ jobId: 'done', vocalsArtifactId: 'v', backgroundArtifactId: 'b', vocalsPath: 'v0', backgroundPath: 'b0', sampleRateHz: 16000, channels: 1 }] } }) };
  if (project.separation) project.separation.chunks = project.chunks.map(({ resultPath: _result, ...chunk }) => chunk);
  let gets = 0, submissions = 0;
  const app = new Projects({ storage: {
    readJson: async () => ({ value: structuredClone(project) }), writeJson: async (_: string, value: VideoLingoProject) => { project = structuredClone(value); },
    assets: { read: async () => ({ body: (async function* () { yield new Uint8Array([1]); })() }) },
  } as never, aiConfig: { get: async () => ({ config: { capabilities: [intent] }, effectiveSelections: [{ capabilityContract, state: 'ready', resource }] }) } as never,
    ai: { text: {} as never, scenarioJobs: {
      get: async () => { gets++; throw createNimiError({ message: reason, reasonCode: reason, retryable: false }); },
      submit: async () => { submissions++; throw createNimiError({ message: 'Submission deliberately refused', reasonCode: 'APP_AUTHORIZATION_DENIED', retryable: false }); },
    } as never } }, process.cwd());
  return { app, read: () => project, counts: () => ({ gets, submissions }) };
}

for (const kind of ['transcribe', 'separate'] as const) {
  test(`${kind} expires only its missing Job and preserves completed blocks`, async () => {
    const f = fixture(kind, 'NOT_FOUND');
    await (kind === 'transcribe' ? f.app.start(id, 'en') : f.app.separate(id));
    await f.app.settled(id);
    assert.deepEqual(f.counts(), { gets: 1, submissions: 1 });
    assert.deepEqual(f.read().invalidatedJobIds, ['expired']);
    assert.equal(f.read().chunks[0]!.resultPath, 'completed0');
    if (kind === 'separate') assert.equal(f.read().separation!.pairs[0]!.jobId, 'done');
    assert.match(kind === 'transcribe' ? f.read().error! : f.read().separation!.error!, /Submission deliberately refused/);
  });
  for (const reason of ['SESSION_INVALID', 'APP_AUTHORIZATION_DENIED']) test(`${kind} preserves the Job on ${reason}`, async () => {
    const f = fixture(kind, reason);
    await assert.rejects(kind === 'transcribe' ? f.app.start(id, 'en') : f.app.separate(id));
    assert.deepEqual(f.counts(), { gets: 1, submissions: 0 });
    assert.equal(kind === 'transcribe' ? f.read().runtimeJobId : f.read().separation!.runtimeJobId, 'expired');
  });
  test(`${kind} allows an inactive missing reference to be stopped without inference`, async () => {
    const f = fixture(kind, 'NOT_FOUND');
    await f.app.control(id, 'cancel');
    assert.equal(kind === 'transcribe' ? f.read().runtimeJobId : f.read().separation!.runtimeJobId, undefined);
    assert.equal(f.read().chunks[0]!.resultPath, 'completed0');
    assert.deepEqual(f.counts(), { gets: 1, submissions: 0 });
  });
}

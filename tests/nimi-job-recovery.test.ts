import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createNimiError } from '@nimiplatform/sdk/types';
import { ModelOperations } from '../src-electron/model-operations.ts';

for (const reason of ['NOT_FOUND', 'SESSION_INVALID', 'APP_AUTHORIZATION_DENIED']) {
  test(`only explicit missing Job permits a new submission: ${reason}`, async () => {
    const spec = { type: 'text-annotate', language: 'en', texts: ['Source'] };
    const key = createHash('sha256').update(JSON.stringify(spec)).digest('hex');
    const jobs = { [key]: 'expired-job' };
    let submitted = 0, invalidated = 0;
    const model = new ModelOperations({ storage: {} as never, ai: { text: {} as never, scenarioJobs: {
      get: async () => { throw createNimiError({ message: reason, reasonCode: reason, retryable: false }); },
      submit: async () => { submitted++; throw createNimiError({ message: 'New submission denied', reasonCode: 'APP_AUTHORIZATION_DENIED', retryable: false }); },
    } as never } }, { workspace: '.', assetPrefix: '', signal: new AbortController().signal, guard: () => {}, onVoice: async () => {}, onJob: async () => {},
      onMissingJob: async id => { assert.equal(id, 'expired-job'); invalidated++; } });
    await assert.rejects(model.annotationHandler(jobs, async () => {}).annotate!({ language: spec.language, texts: spec.texts }));
    assert.equal(submitted, reason === 'NOT_FOUND' ? 1 : 0);
    assert.equal(invalidated, submitted);
    assert.equal(jobs[key], reason === 'NOT_FOUND' ? undefined : 'expired-job');
  });
}

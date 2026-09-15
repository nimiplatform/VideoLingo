import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNimiError, extractNimiErrorFields } from '@nimiplatform/sdk/types';
import { runMediaWorker } from '../src-electron/media-worker.ts';

test('a Host model refusal crosses the real worker channel without a retry or output', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-model-error-'));
  let requests = 0;
  try {
    await assert.rejects(runMediaWorker(process.cwd(), { operation: 'translate-preview', workspace, text: 'A source line.', targetLanguage: '简体中文',
      sourceLanguage: 'en', reflect: true, selectionKey: 'unit-test-config' }, new AbortController().signal, false, {
      text: async () => { requests += 1; throw createNimiError({ message: 'Access denied', reasonCode: 'APP_AUTHORIZATION_DENIED', traceId: 'boundary-test-trace', actionHint: 'Review App Access', retryable: false }); },
    }), error => {
      assert.match(String(error), /Access denied/);
      assert.equal(extractNimiErrorFields(error).reasonCode, 'APP_AUTHORIZATION_DENIED');
      assert.equal(extractNimiErrorFields(error).retryable, false);
      assert.equal(extractNimiErrorFields(error).traceId, 'boundary-test-trace');
      assert.equal(extractNimiErrorFields(error).actionHint, 'Review App Access');
      return true;
    });
    assert.equal(requests, 1);
    await assert.rejects(access(path.join(workspace, 'translation-preview.json')));
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

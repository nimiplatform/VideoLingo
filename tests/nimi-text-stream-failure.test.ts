import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelOperations } from '../src-electron/model-operations.ts';
import { extractNimiErrorFields } from '@nimiplatform/sdk/types';

test('the current failed text stream is captured once without replay or request parameter changes', async () => {
  let calls = 0, canceled = 0; let captured: Record<string, unknown> | undefined; let sent: unknown;
  const model = new ModelOperations({ storage: {} as never, ai: { scenarioJobs: {} as never, text: {
    streamTurn: async (input: unknown) => {
      calls++; sent = input;
      return { cancel: async () => { canceled++; }, async *[Symbol.asyncIterator]() {
        yield { type: 'delta', itemIndex: 0, text: '{"incomplete":' };
        yield { type: 'failed', reasonCode: 'AI_OUTPUT_INVALID', traceId: 'failed-stream-fixture' };
      } };
    },
  } as never } }, { workspace: '.', assetPrefix: '', signal: new AbortController().signal, guard: () => {}, onJob: async () => {}, onVoice: async () => {},
    onTextFailure: async record => { captured = record; } });
  await assert.rejects(model.handlers(['translate_faithfulness']).text!({ prompt: 'Original prompt', step: 'translate_faithfulness', responseType: 'json', context: { chunkIndex: 3 } }), error => {
    assert.equal(extractNimiErrorFields(error).traceId, 'failed-stream-fixture'); return true;
  });
  assert.equal(calls, 1); assert.equal(canceled, 1);
  const input = sent as { messages: { text: string }[]; responseFormat: { type: string }; temperature?: number; maxTokens?: number };
  assert.equal(input.messages[0]!.text, 'Original prompt'); assert.equal(input.responseFormat.type, 'json-object');
  assert.equal(input.temperature, undefined); assert.equal(input.maxTokens, undefined);
  assert.deepEqual(captured?.requestContext, { chunkIndex: 3 });
  assert.deepEqual(captured?.events, [{ type: 'delta', itemIndex: 0, text: '{"incomplete":' }, { type: 'failed', reasonCode: 'AI_OUTPUT_INVALID', traceId: 'failed-stream-fixture' }]);
  assert.equal(captured?.truncated, false);
});

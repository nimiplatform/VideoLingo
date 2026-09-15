import test from 'node:test';
import assert from 'node:assert/strict';
import type { NimiAppAuthProjection } from '@nimiplatform/sdk/app';
import { createNimiError } from '@nimiplatform/sdk/types';
import { readStartupAccess } from '../src-component/startup-access.ts';

const ready: NimiAppAuthProjection = { mode: 'local-app', state: 'session-bound', sessionBound: true, reasonCode: 'action-executed', actionHint: '', retryable: false };
const transient: NimiAppAuthProjection = { mode: 'local-app', state: 'unavailable', sessionBound: false, reasonCode: 'runtime-service-unavailable', actionHint: '', retryable: true };

test('only marked startup transients are retried, then the recovered state is returned', async () => {
  let reads = 0;
  const delays: number[] = [];
  const value = await readStartupAccess(async () => ++reads === 1 ? transient : ready, new AbortController().signal,
    async delay => { delays.push(delay); });
  assert.equal(value.sessionBound, true);
  assert.equal(reads, 2);
  assert.deepEqual(delays, [500]);
});

test('persistent retryable startup failures stop after three reads', async () => {
  let reads = 0;
  const value = await readStartupAccess(async () => { reads += 1; return transient; }, new AbortController().signal, async () => {});
  assert.equal(value.sessionBound, false);
  assert.equal(reads, 3);
});

test('explicit access denial is never automatically retried', async () => {
  let reads = 0;
  const denied = { ...transient, reasonCode: 'access-denied' };
  assert.equal(await readStartupAccess(async () => { reads += 1; return denied; }, new AbortController().signal, async () => assert.fail()), denied);
  assert.equal(reads, 1);
  await assert.rejects(readStartupAccess(async () => { throw createNimiError({ reasonCode: 'APP_AUTHORIZATION_DENIED', message: 'Denied', retryable: true }); },
    new AbortController().signal, async () => assert.fail()), /Denied/);
});

test('unmarked errors do not become retryable by guessing their message', async () => {
  let reads = 0;
  await assert.rejects(readStartupAccess(async () => { reads += 1; throw new Error('runtime-service-unavailable'); },
    new AbortController().signal, async () => assert.fail()), /runtime-service-unavailable/);
  assert.equal(reads, 1);
});

test('an abandoned read cannot publish a late ready state', async () => {
  const controller = new AbortController();
  await assert.rejects(readStartupAccess(async () => { controller.abort(); return ready; }, controller.signal, async () => assert.fail()), /abort/i);
});

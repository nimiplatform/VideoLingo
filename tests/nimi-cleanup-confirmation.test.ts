import test from 'node:test';
import assert from 'node:assert/strict';
import { CleanupConfirmation } from '../src-component/cleanup-confirmation.ts';

const target = { projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'My video', kind: 'dubbing' as const };

test('opening and canceling cleanup never dispatches clear, even if a stale confirm event arrives', async () => {
  const dialog = new CleanupConfirmation(); let calls = 0;
  dialog.open(target); assert.equal(calls, 0);
  dialog.cancel(); await dialog.confirm(async () => { calls++; });
  assert.equal(calls, 0); assert.equal(dialog.target, null);
});

test('confirmation dispatches the shown project exactly once and locks dismissal while deleting', async () => {
  const dialog = new CleanupConfirmation(), mutable = { ...target }; dialog.open(mutable);
  mutable.projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let finish!: () => void; const requests: unknown[] = [];
  const operation = dialog.confirm(async value => { requests.push(value); await new Promise<void>(resolve => { finish = resolve; }); });
  dialog.cancel(); dialog.open({ ...target, kind: 'media' });
  await dialog.confirm(async value => { requests.push(value); });
  assert.equal(dialog.pending, true); assert.deepEqual(requests, [target]); assert.equal(dialog.target?.kind, 'dubbing');
  finish(); await operation; assert.equal(dialog.target, null); assert.equal(dialog.pending, false);
});

test('a failed clear keeps the original confirmation for explicit retry and never retries itself', async () => {
  const dialog = new CleanupConfirmation(); dialog.open({ ...target, kind: 'media' }); let calls = 0;
  await assert.rejects(dialog.confirm(async () => { calls++; throw new Error('Storage unavailable'); }), /Storage unavailable/);
  assert.equal(calls, 1); assert.equal(dialog.pending, false); assert.equal(dialog.target?.kind, 'media');
});

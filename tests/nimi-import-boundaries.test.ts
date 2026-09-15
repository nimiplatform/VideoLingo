import test from 'node:test';
import assert from 'node:assert/strict';
import { Projects } from '../src-electron/projects.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('URL and task-sheet boundaries reject unsupported input before touching services', async () => {
  let calls = 0;
  const fail = () => { calls++; throw new Error('Service must not be called'); };
  const projects = new Projects({ storage: { readJson: fail, assets: { stat: fail } } as never, aiConfig: {} as never, ai: {} as never }, process.cwd());
  await assert.rejects(projects.downloadUrl(id, { url: 'file:///C:/private.mp4', resolution: '1080' }), /HTTP/);
  await assert.rejects(projects.downloadUrl(id, { url: 'https://example.com/clip.mp4', resolution: '1080', cookiesAssetPath: `projects/${other}/download-cookies/cookie.txt` }), /this project/);
  await assert.rejects(projects.readTaskSheet(`projects/${other}/settings.xlsx`), /Upload the task sheet/);
  assert.equal(calls, 0);
});

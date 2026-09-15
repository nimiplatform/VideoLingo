// Verify frozen imports and the real worker transport. This never asserts AI success.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNimiError } from '@nimiplatform/sdk/types';
import { runMediaWorker, workerEnvironment } from '../src-electron/media-worker.ts';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import { createServer } from 'node:http';
import { checkWorkerEncoding } from '../tests/worker-encoding-check.ts';

const root = path.resolve('dist-electron-package/videolingo-shell-win32-x64/resources/videolingo');
await checkWorkerEncoding(root, true);
console.log('Packaged UTF-8 configuration, request and retained refusal passed without inference.');
// Exercise the renderer branch with exactly the Host's environment and port argv.
// No STREAMLIT_GLOBAL_DEVELOPMENT_MODE override: the packaged entry must set it.
const port = await new Promise((resolve, reject) => {
  const server = net.createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => resolve(address.port)); });
});
const environment = workerEnvironment(root);
assert.match(execFileSync(path.join(root, 'media-bin/deno.exe'), ['--version'], { encoding: 'utf8', windowsHide: true, env: environment }), /^deno 2\.8\.1/u);
assert.equal(environment.STREAMLIT_GLOBAL_DEVELOPMENT_MODE, undefined);
const renderer = spawn(path.join(root, 'backend/videolingo-backend.exe'), [String(port)], {
  cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '', startError;
renderer.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-10000); });
renderer.stdout.resume(); renderer.on('error', error => { startError = error; });
try {
  let healthy = false;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && renderer.exitCode === null && !startError) {
    try { if ((await fetch(`http://127.0.0.1:${port}/_stcore/health`, { signal: AbortSignal.timeout(1000) })).ok) { healthy = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(healthy, `Packaged renderer failed: ${startError?.message || stderr || renderer.exitCode}`);
  console.log('Packaged Streamlit renderer health passed using only the packaged entry and Host environment.');
} finally {
  if (renderer.exitCode === null && renderer.pid) {
    const closed = new Promise(resolve => renderer.once('exit', resolve)); renderer.kill(); await closed;
  }
}
const workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-packaged-boundary-'));
try {
  const sheet = path.join(workspace, 'tasks.xlsx');
  await copyFile(path.resolve('batch/tasks_setting.xlsx'), sheet);
  const parsed = await runMediaWorker(root, { operation: 'read-task-sheet', workspace, file: sheet }, AbortSignal.timeout(30000), true);
  assert.equal(parsed.rows[0].videoFile, 'https://www.youtube.com/watch?v=U4aFbyzrTdc');
  assert.equal(parsed.rows[0].targetLanguage, 'French');
  const media = await readFile(path.resolve('docs/public/videos/demo.mp4'));
  const sourceServer = createServer((request, response) => {
    if (request.url !== '/demo.mp4' || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': media.length });
    response.end(request.method === 'HEAD' ? undefined : media);
  });
  await new Promise(resolve => sourceServer.listen(0, '127.0.0.1', resolve));
  try {
    const imported = await runMediaWorker(root, { operation: 'download-url', workspace,
      url: `http://127.0.0.1:${sourceServer.address().port}/demo.mp4`, resolution: 'best', proxy: '' }, AbortSignal.timeout(60000), true);
    assert.deepEqual(await readFile(imported.file), media);
    assert.equal(imported.mediaType, 'video/mp4');
    console.log('Packaged task sheet parser and real loopback media download passed; no AI or external website was used.');
  } finally { await new Promise(resolve => sourceServer.close(resolve)); }
  await mkdir(path.join(workspace, 'output/log'), { recursive: true });
  await writeFile(path.join(workspace, 'output/log/split_by_nlp.txt'), 'A source line.');
  for (const operation of ['translate-preview', 'translate-subtitles']) {
    let requests = 0;
    const refuse = async () => {
      requests += 1;
      throw createNimiError({ message: 'Expected packaged Host refusal', reasonCode: 'APP_AUTHORIZATION_DENIED', retryable: false });
    };
    await assert.rejects(runMediaWorker(root, { operation, workspace, text: 'A source line.', sourceLanguage: 'en',
      targetLanguage: '简体中文', reflect: true, selectionKey: 'packaged-negative-check',
      businessSettings: { max_workers: 4, max_split_length: 20, summary_length: 8000, speed_factor: { min: 1, accept: 1.2, max: 1.4 },
        min_trim_duration: 3.5, subtitle: { max_length: 75, target_multiplier: 1.2 } } },
    AbortSignal.timeout(30000), true, { text: refuse, annotate: refuse }), /Expected packaged Host refusal/);
    assert.equal(requests, 1);
  }
  console.log('Packaged Python imports and framed Host refusal passed; installed App Access and user journeys remain separate.');
} finally { await rm(workspace, { recursive: true, force: true }); }

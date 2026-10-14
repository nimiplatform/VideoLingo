import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
const executable = process.platform === 'win32' ? 'python.exe' : 'python';
const tools = path.join(root, '.nimi/local/python-tools');
const toolsPython = path.join(tools, bin, executable);
const uv = path.join(tools, bin, process.platform === 'win32' ? 'uv.exe' : 'uv');
const businessPython = path.join(root, '.venv', bin, executable);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`VideoLingo business setup failed (${result.status})`);
}

if (!existsSync(uv)) {
  run('python', ['-m', 'venv', tools]);
  run(toolsPython, ['-m', 'pip', 'install', 'uv==0.12.22']);
}
if (!existsSync(businessPython)) run(uv, ['venv', '--python', '3.14.4', '.venv']);
run(businessPython, ['-c', 'import sys; assert sys.version_info[:3] == (3, 14, 4), "VideoLingo requires its pinned Python 3.14.4 business environment"']);
run(uv, ['pip', 'sync', '--python', businessPython, 'requirements-nimi.lock']);
run(process.execPath, ['scripts/prepare-media.mjs']);

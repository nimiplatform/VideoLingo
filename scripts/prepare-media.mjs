import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const root = process.cwd();
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const env = { PYTHONUTF8: '1', PYTHONNOUSERSITE: '1' };
for (const key of ['SystemRoot', 'WINDIR', 'SystemDrive', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
  if (process.env[key]) env[key] = process.env[key];
}
const ffmpeg = execFileSync(python, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8', windowsHide: true, env }).trim();
const require = createRequire(import.meta.url);
const ffprobe = require('@ffprobe-installer/ffprobe').path;
const deno = JSON.parse(execFileSync(python, ['-c', 'import json, deno; from importlib.metadata import distribution; d=distribution("deno"); print(json.dumps({"version": d.version, "binary": str(deno.find_deno_bin()), "license": str(d.locate_file(next(p for p in d.files if str(p).endswith("/licenses/LICENSE"))))}))'], { encoding: 'utf8', windowsHide: true, env }));
if (deno.version !== '2.8.1') throw new Error('Install the pinned Deno 2.8.1 download runtime');
const directory = path.join(root, '.nimi/local/media-bin');
await mkdir(directory, { recursive: true });
await copyFile(ffmpeg, path.join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
await copyFile(ffprobe, path.join(directory, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'));
await copyFile(deno.binary, path.join(directory, process.platform === 'win32' ? 'deno.exe' : 'deno'));
await copyFile(deno.license, path.join(directory, 'deno-LICENSE'));

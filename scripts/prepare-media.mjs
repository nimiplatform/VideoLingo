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
const directory = path.join(root, '.nimi/local/media-bin');
await mkdir(directory, { recursive: true });
await copyFile(ffmpeg, path.join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
await copyFile(ffprobe, path.join(directory, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'));

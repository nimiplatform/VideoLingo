import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const run = (binary, args) => execFileSync(binary, args, { cwd: root, stdio: 'inherit', windowsHide: true });
run(process.execPath, ['scripts/build-component.mjs']);
run(process.execPath, ['scripts/build-host.mjs', '--production']);
run(process.execPath, ['scripts/prepare-media.mjs']);
run(python, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--name', 'videolingo-backend',
  '--distpath', 'dist-python', '--workpath', '.nimi/local/pyinstaller-work', '--specpath', '.nimi/local',
  '--collect-all', 'streamlit', '--collect-all', 'altair', '--collect-all', 'autocorrect_py',
  '--copy-metadata', 'syllables',
  '--hidden-import', 'core.nimi_worker', '--hidden-import', 'core.asr_backend.audio_preprocess', '--hidden-import', 'core._6_gen_sub',
  '--add-data', `${path.join(root, 'st.py') }:.`, '--add-data', `${path.join(root, 'core')}:core`, '--add-data', `${path.join(root, 'translations')}:translations`,
  '--add-data', `${path.join(root, 'dist-component')}:dist-component`, '--add-data', `${path.join(root, 'docs/logo.png')}:docs`, '--add-data', `${path.join(root, 'docs/logo.svg')}:docs`,
  'scripts/backend-entry.py']);
const resources = path.join(root, '.nimi/local/production-resources/videolingo');
// This fixed build directory is inside the App; source/media storage is untouched.
await rm(resources, { recursive: true, force: true });
await mkdir(resources, { recursive: true });
await cp(path.join(root, 'dist-python/videolingo-backend'), path.join(resources, 'backend'), { recursive: true });
await cp(path.join(root, '.nimi/local/media-bin'), path.join(resources, 'media-bin'), { recursive: true });
await cp(path.join(root, 'custom_terms.xlsx'), path.join(resources, 'custom_terms.xlsx'));
run(process.execPath, ['scripts/package-electron-production.mjs']);

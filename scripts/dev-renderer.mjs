import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
for (const script of ['scripts/build-component.mjs', 'scripts/prepare-media.mjs']) execFileSync(process.execPath, [script], { stdio: 'inherit', windowsHide: true });
const python = path.join(process.cwd(), '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'SystemDrive', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PATH']) {
  if (process.env[key]) env[key] = process.env[key];
}
env.PYTHONUTF8 = '1';
env.PYTHONNOUSERSITE = '1';
const child = spawn(python, ['-X', 'utf8', '-m', 'streamlit', 'run', 'st.py', '--server.address=127.0.0.1', '--server.port=1467',
  '--server.headless=true', '--browser.gatherUsageStats=false'], { stdio: 'inherit', windowsHide: true, env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });

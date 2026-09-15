import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { app, BrowserWindow, ipcMain, Menu, protocol, session, webContents } from 'electron';
import { isAllowedElectronRendererUrl, registerNimiElectronAppAssetProtocolScheme, registerNimiElectronAppBridge } from '@nimiplatform/kit/shell/electron/main';
import { Projects } from './projects.js';
import type { DubbingInput, PreviewInput, TranslationInput } from './project-types.js';
import { workerEnvironment } from './media-worker.js';

declare const __NIMI_ELECTRON_PRODUCTION__: boolean;
const APP_ID = 'ai.nimi.videolingo';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(currentDir, '..');
const appRoot = __NIMI_ELECTRON_PRODUCTION__ ? path.join(process.resourcesPath, 'videolingo') : sourceRoot;
let backend: ChildProcess | undefined;
let projects: Projects | undefined;
const developmentUrl = readDevelopmentRendererUrl();
app.setName('VideoLingo');
app.setAppUserModelId('ai.nimi.apps.ai.nimi.videolingo');
Menu.setApplicationMenu(null);
registerNimiElectronAppAssetProtocolScheme(protocol);

void app.whenReady().then(async () => {
  const rendererUrl = developmentUrl || await startPackagedRenderer();
  const allowedRendererUrls = [rendererUrl];
  const text = (value: unknown) => typeof value === 'string' ? value : '';
  const bridge = registerNimiElectronAppBridge({
    appId: APP_ID, allowedRendererUrls, ipcMain,
    assetMediaPlatform: { protocol, webRequest: session.defaultSession.webRequest, webContents },
    appCommandHandlers: {
      'videolingo.projects.list': () => projects!.list(),
      'videolingo.project.get': ({ payload }) => projects!.get(text(payload.projectId)),
      'videolingo.project.create': ({ payload }) => projects!.create(text(payload.title)),
      'videolingo.project.attach-media': ({ payload }) => projects!.attach(text(payload.projectId), text(payload.name), text(payload.uploadId)),
      'videolingo.project.transcribe': ({ payload }) => projects!.start(text(payload.projectId), text(payload.languageHint)),
      'videolingo.project.separate': ({ payload }) => projects!.separate(text(payload.projectId)),
      'videolingo.project.split-nlp': ({ payload }) => projects!.splitNlp(text(payload.projectId)),
      'videolingo.project.translate': ({ payload }) => projects!.translate(text(payload.projectId), payload.input as TranslationInput),
      'videolingo.project.dub': ({ payload }) => projects!.dub(text(payload.projectId), payload.input as DubbingInput),
      'videolingo.project.preview': ({ payload }) => projects!.preview(text(payload.projectId), payload.input as PreviewInput),
      'videolingo.project.pause': ({ payload }) => projects!.control(text(payload.projectId), 'pause'),
      'videolingo.project.cancel': ({ payload }) => projects!.control(text(payload.projectId), 'cancel'),
    },
    onSessionInvalidated: () => projects?.invalidate(),
  });
  projects = new Projects(bridge.services, appRoot, __NIMI_ELECTRON_PRODUCTION__);
  const window = new BrowserWindow({ width: 1180, height: 850, minWidth: 540, minHeight: 560, title: 'VideoLingo', autoHideMenuBar: true,
    webPreferences: { preload: path.join(currentDir, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!isAllowedElectronRendererUrl(url, allowedRendererUrls)) event.preventDefault(); });
  await window.loadURL(rendererUrl);
}).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { projects?.invalidate(); backend?.kill(); });

function readDevelopmentRendererUrl(): string {
  const prefix = '--nimi-dev-renderer-url=';
  const values = process.argv.filter(value => value.startsWith(prefix));
  if (__NIMI_ELECTRON_PRODUCTION__ && (values.length || process.argv.includes('--nimi-dev-renderer-url'))) throw new Error('The production Host rejects development renderer arguments');
  if (values.length === 0) return '';
  if (values.length !== 1) throw new Error('The development renderer URL must be singular');
  const parsed = new URL(values[0]!.slice(prefix.length));
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !parsed.port
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('The renderer must use an exact loopback origin');
  return parsed.origin;
}

async function startPackagedRenderer(): Promise<string> {
  if (!__NIMI_ELECTRON_PRODUCTION__) throw new Error('Launch development through nimi-app dev');
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); });
  });
  const executable = path.join(appRoot, 'backend', process.platform === 'win32' ? 'videolingo-backend.exe' : 'videolingo-backend');
  backend = spawn(executable, [String(port)], { cwd: appRoot, env: workerEnvironment(appRoot), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let failure = '';
  backend.on('error', error => { failure = error.message; });
  backend.stderr?.on('data', data => { failure = (failure + String(data)).slice(-6000); });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null) throw new Error(`VideoLingo backend stopped: ${failure}`);
    try { if ((await fetch(`${origin}/_stcore/health`)).ok) return origin; } catch { /* Wait for this exact child server. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`VideoLingo backend did not become ready: ${failure}`);
}

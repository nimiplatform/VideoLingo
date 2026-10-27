import { hostReadFailure } from './host-read-error.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, session, webContents } from 'electron';
import { configureNimiElectronAppHostProfile } from '@nimiplatform/kit/shell/electron/host-profile';
import { Projects } from './projects.js';
import { Batches, type BatchItemInput } from './batches.js';
import type { DubbingInput, DownloadInput, PreviewInput, TranslationInput } from './project-types.js';
import type { SubtitleSaveInput } from './subtitles.js';
import type { BusinessSettings } from './business-settings.js';
import { workerEnvironment } from './media-worker.js';

declare const __NIMI_ELECTRON_PRODUCTION__: boolean;
try {
  configureNimiElectronAppHostProfile(app);
} catch (error) {
  process.stderr.write(`[nimi-app-host-profile] ${error instanceof Error ? error.message : String(error)}\n`);
  app.exit(78);
  throw error;
}
const {
  isAllowedElectronRendererUrl,
  registerNimiElectronAppAssetProtocolScheme,
  registerNimiElectronAppBridge,
} = await import('@nimiplatform/kit/shell/electron/main');

const APP_ID = 'ai.nimi.videolingo';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(currentDir, '..');
// Native presentation is separate from metadata.icon artwork shown in Nimi Home.
const nativeAppIconPath = path.join(sourceRoot, 'assets', 'native', process.platform === 'win32' ? 'windows.ico' : process.platform === 'darwin' ? 'macos.png' : 'app.png');
const appRoot = __NIMI_ELECTRON_PRODUCTION__ ? path.join(process.resourcesPath, 'videolingo') : sourceRoot;
let backend: ChildProcess | undefined;
let projects: Projects | undefined;
let batches: Batches | undefined;
let resettingRenderer = false;
let quitting = false;
app.setName('VideoLingo');
app.setAppUserModelId('ai.nimi.apps.ai.nimi.videolingo');
Menu.setApplicationMenu(null);
registerNimiElectronAppAssetProtocolScheme(protocol);

void app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(nativeAppIconPath);
  const developmentUrl = readDevelopmentRendererUrl();
  const rendererUrl = developmentUrl || await startPackagedRenderer();
  const allowedRendererUrls = [rendererUrl];
  const text = (value: unknown) => typeof value === 'string' ? value : '';
  const bridge = registerNimiElectronAppBridge({
    appId: APP_ID, allowedRendererUrls, ipcMain,
    assetMediaPlatform: { protocol, webRequest: session.defaultSession.webRequest, webContents },
    appCommandHandlers: {
      'videolingo.projects.list': async () => {
        try { return await projects!.list(); } catch (error) {
          console.warn('VideoLingo Host read failed', new Date().toISOString(), hostReadFailure('videolingo.projects.list', error), error instanceof Error ? error.stack : undefined); throw error;
        }
      },
      'videolingo.project.get': async ({ payload }) => {
        try { return await projects!.get(text(payload.projectId)); } catch (error) {
          console.warn('VideoLingo Host read failed', new Date().toISOString(), hostReadFailure('videolingo.project.get', error), error instanceof Error ? error.stack : undefined); throw error;
        }
      },
      'videolingo.project.create': ({ payload }) => projects!.create(text(payload.title)),
      'videolingo.project.update-dubbing-settings': ({ payload }) => projects!.updateDubbingSettings(text(payload.projectId), payload.input as DubbingInput),
      'videolingo.project.update-settings': ({ payload }) => projects!.updateSettings(text(payload.projectId), payload.settings as BusinessSettings),
      'videolingo.project.archive': ({ payload }) => projects!.archive(text(payload.projectId), payload.archived === true),
      'videolingo.project.clear': ({ payload }) => projects!.clear(text(payload.projectId), text(payload.kind) as 'media' | 'dubbing'),
      'videolingo.project.run-subtitles': ({ payload }) => batches!.runProject(text(payload.projectId), 'subtitles'),
      'videolingo.project.run-dubbing': ({ payload }) => batches!.runProject(text(payload.projectId), 'dubbing', payload.input as DubbingInput),
      'videolingo.project.attach-media': ({ payload }) => projects!.attach(text(payload.projectId), text(payload.name), text(payload.uploadId)),
      'videolingo.project.download-url': ({ payload }) => projects!.downloadUrl(text(payload.projectId), payload.input as DownloadInput),
      'videolingo.batch.read-task-sheet': ({ payload }) => projects!.readTaskSheet(text(payload.assetPath)),
      'videolingo.project.transcribe': ({ payload }) => projects!.start(text(payload.projectId), text(payload.languageHint)),
      'videolingo.project.separate': ({ payload }) => projects!.separate(text(payload.projectId)),
      'videolingo.project.split-nlp': ({ payload }) => projects!.splitNlp(text(payload.projectId)),
      'videolingo.project.translate': ({ payload }) => projects!.translate(text(payload.projectId), payload.input as TranslationInput),
      'videolingo.project.subtitles': ({ payload }) => projects!.subtitles(text(payload.projectId)),
      'videolingo.project.save-subtitles': ({ payload }) => projects!.saveSubtitles(text(payload.projectId), payload.input as SubtitleSaveInput),
      'videolingo.project.dub': ({ payload }) => projects!.dub(text(payload.projectId), payload.input as DubbingInput),
      'videolingo.project.render-subtitles': ({ payload }) => projects!.renderSubtitles(text(payload.projectId)),
      'videolingo.project.prepare-preview': ({ payload }) => projects!.prepareMediaPreview(text(payload.projectId)),
      'videolingo.project.export': async ({ payload }) => {
        const id = text(payload.projectId), assetPath = text(payload.assetPath);
        const subtitleDraft = payload.subtitleDraft === true;
        await projects!.exportInfo(id, assetPath, subtitleDraft);
        const result = await dialog.showSaveDialog({ title: subtitleDraft ? 'Export subtitle draft for proofreading' : 'Export VideoLingo result',
          defaultPath: (subtitleDraft ? 'draft-' : '') + path.basename(assetPath) });
        if (result.canceled || !result.filePath) return { canceled: true };
        return { canceled: false, ...await projects!.exportAsset(id, assetPath, result.filePath, subtitleDraft) };
      },
      'videolingo.project.export-subtitles': async ({ payload }) => {
        const id = text(payload.projectId), draft = payload.draft === true;
        const assetPath = await projects!.exportSubtitleZip(id, draft);
        const selected = await dialog.showSaveDialog({ title: draft ? 'Export subtitle drafts' : 'Export subtitles', defaultPath: draft ? 'subtitle-drafts.zip' : 'subtitles.zip' });
        if (selected.canceled || !selected.filePath) return { canceled: true };
        return { canceled: false, ...await projects!.exportAsset(id, assetPath, selected.filePath) };
      },
      'videolingo.batches.list': () => batches!.list(),
      'videolingo.batch.get': ({ payload }) => batches!.get(text(payload.batchId)),
      'videolingo.batch.create': ({ payload }) => batches!.create(text(payload.title), payload.items as BatchItemInput[]),
      'videolingo.batch.resume': ({ payload }) => batches!.resume(text(payload.batchId)),
      'videolingo.batch.pause': ({ payload }) => batches!.pause(text(payload.batchId)),
      'videolingo.batch.stop': ({ payload }) => batches!.stop(text(payload.batchId)),
      'videolingo.project.preview': ({ payload }) => projects!.preview(text(payload.projectId), payload.input as PreviewInput),
      'videolingo.project.pause': ({ payload }) => projects!.control(text(payload.projectId), 'pause'),
      'videolingo.project.cancel': ({ payload }) => projects!.control(text(payload.projectId), 'cancel'),
    },
    onSessionReady: services => {
      projects = new Projects(services, appRoot, __NIMI_ELECTRON_PRODUCTION__);
      batches = new Batches(services.storage, projects);
    },
    onSessionInvalidated: () => {
      console.warn('VideoLingo protected session invalidated', new Date().toISOString());
      batches?.invalidate(); projects?.invalidate();
      const windows = BrowserWindow.getAllWindows();
      if (quitting || windows.length === 0) return;
      resettingRenderer = true;
      try {
        for (const window of windows) window.destroy();
        void createMainWindow().catch(error => console.error('VideoLingo session renderer reset failed', error));
      } finally { resettingRenderer = false; }
    },
  });
  projects = new Projects(bridge.services, appRoot, __NIMI_ELECTRON_PRODUCTION__);
  batches = new Batches(bridge.services.storage, projects);
  await createMainWindow();
  async function createMainWindow() {
    const window = new BrowserWindow({
    icon: nativeAppIconPath, width: 1180, height: 850, minWidth: 540, minHeight: 560, title: 'VideoLingo', autoHideMenuBar: true,
      webPreferences: { preload: path.join(currentDir, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!isAllowedElectronRendererUrl(url, allowedRendererUrls)) event.preventDefault(); });
    await window.loadURL(rendererUrl);
  }
}).catch(error => {
  console.error(error);
  const details = error instanceof Error ? error.stack || error.message : String(error);
  const selected = dialog.showMessageBoxSync({ type: 'error', title: 'VideoLingo could not start',
    message: 'VideoLingo could not start. Copy the details to report this problem.',
    detail: details, buttons: ['Copy details', 'Close'], defaultId: 1, cancelId: 1, noLink: true });
  if (selected === 0) clipboard.writeText(details);
  app.quit();
});
app.on('window-all-closed', () => { if (!resettingRenderer && BrowserWindow.getAllWindows().length === 0) app.quit(); });
app.on('before-quit', () => { quitting = true; batches?.invalidate(); projects?.invalidate(); backend?.kill(); });

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
  backend.stdout?.resume();
  backend.stderr?.on('data', data => { failure = (failure + String(data)).slice(-6000); });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (failure && !backend.pid) throw new Error(`VideoLingo backend could not start: ${failure}`);
    if (backend.exitCode !== null) throw new Error(`VideoLingo backend stopped: ${failure}`);
    try { if ((await fetch(`${origin}/_stcore/health`)).ok) return origin; } catch { /* Wait for this exact child server. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`VideoLingo backend did not become ready: ${failure}`);
}

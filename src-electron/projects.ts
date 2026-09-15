import { validateDubbingInput } from './dubbing-settings.js';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { validateNimiLocalAppAudioSeparation, type NimiLocalAppAIConsumptionClient, type NimiLocalAppClient, type NimiLocalAppScenarioJob, type NimiLocalAppSpeechTranscript } from '@nimiplatform/sdk/app';
import { errorText, isWorking, projectId, sourceAssetPath, sourceLanguageFor, type AudioChunk, type DubbingInput, type DownloadInput, type TaskSheetRow, type PreviewInput, type TranslationInput, type VideoLingoProject } from './project-types.js';
import { runMediaWorker } from './media-worker.js';
import { ModelOperations } from './model-operations.js';
import { extractNimiErrorFields } from '@nimiplatform/sdk/types';
import { isMissingJob, retainedJob } from './job-recovery.js';
import { currentSubtitleRevision, subtitleFiles, subtitleKey, subtitleIssues, subtitleOutputs, SUBTITLE_FILES, SUBTITLE_LIMIT, type SubtitleReview, type SubtitleSaveInput } from './subtitles.js';
import { businessSettings, DEFAULT_BUSINESS_SETTINGS, pythonBusinessSettings, translationSettings, validateBusinessSettings, type BusinessSettings } from './business-settings.js';

type Services = { storage: NimiLocalAppClient['storage']; aiConfig: Pick<NimiLocalAppClient['aiConfig'], 'get'>; ai: Pick<NimiLocalAppAIConsumptionClient, 'scenarioJobs' | 'text'> };
type Activity = { runId: string; epoch: number; abort: AbortController; pause: boolean; runtimeJobId?: string; done?: Promise<void> };
type Prepared = { chunks: { file: string; offsetSeconds: number; durationSeconds: number }[]; sampleRateHz: number; channels: number };
type Consumed = { status: 'transcribed' | 'no-speech'; language: string; sourceLanguage: string; reportedLanguages: string[]; unreportedLanguageChunks: number; wordCount: number; text: string; files: string[] };
type AssembledSeparation = { vocalsFile: string; backgroundFile: string; sampleRateHz: number; channels: number; durationSeconds: number; frames: number };
const INDEX = 'projects/index.json';
const TRANSLATION_FILES: Record<string, readonly string[]> = {
  meaning: ['output/log/split_by_meaning.txt'], terminology: ['output/log/terminology.json'],
  translation: ['output/log/translation_results.xlsx'],
  'subtitle-splitting': ['output/log/translation_results_for_subtitles.xlsx', 'output/log/translation_results_remerged.xlsx'],
  timestamps: ['output/src.srt', 'output/trans.srt', 'output/src_trans.srt', 'output/trans_src.srt', 'output/audio/src_subs_for_audio.srt', 'output/audio/trans_subs_for_audio.srt'],
};
const TRANSLATION_MODEL_STEPS = ['split_by_meaning', 'summary', 'translate_faithfulness', 'translate_expressiveness', 'sub_trim', 'align_subs'];

function missing(error: unknown): boolean {
  const value = error as { reasonCode?: string; code?: string };
  const reason = (value?.reasonCode || value?.code || '').toUpperCase().replaceAll('-', '_');
  return reason === 'APP_STORAGE_ENTRY_NOT_FOUND' || reason.endsWith('_STORAGE_JSON_NOT_FOUND') || reason.endsWith('_STORAGE_ENTRY_NOT_FOUND') || reason === 'NOT_FOUND';
}

export class Projects {
  private epoch = 0;
  private mutation: Promise<unknown> = Promise.resolve();
  private activities = new Map<string, Activity>();
  private reservations = new Map<string, string>();
  private exports = new Set<AbortController>();
  constructor(private services: Services, private appRoot: string, private packaged = false) {}

  invalidate(): void {
    this.epoch += 1;
    for (const task of this.activities.values()) {
      task.abort.abort();
      if (task.runtimeJobId) void this.services.ai.scenarioJobs.cancel(task.runtimeJobId, 'videolingo-session-invalidated').catch(() => {});
    }
    this.activities.clear();
    this.reservations.clear();
    for (const controller of this.exports) controller.abort();
    this.exports.clear();
  }

  claim(ids: readonly string[], owner: string): void {
    for (const id of ids) {
      projectId(id);
      if (this.activities.has(id) || (this.reservations.has(id) && this.reservations.get(id) !== owner)) throw new Error('A batch project is already in use');
    }
    for (const id of ids) this.reservations.set(id, owner);
  }

  release(owner: string): void {
    for (const [id, value] of this.reservations) if (value === owner) this.reservations.delete(id);
  }

  private assertOwner(id: string, owner?: string): void {
    if (this.reservations.has(id) && this.reservations.get(id) !== owner) throw new Error('Pause the batch before editing its project');
  }

  private guard(epoch: number): void {
    if (epoch !== this.epoch) throw new Error('Nimi session changed; refresh the project list');
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(fn, fn);
    this.mutation = next.catch(() => {});
    return next;
  }

  private async ids(): Promise<string[]> {
    let value: unknown;
    try { value = (await this.services.storage.readJson(INDEX)).value; }
    catch (error) {
      if (missing(error)) return [];
      throw error;
    }
    if (!Array.isArray(value)) throw new Error('The project index is not readable');
    return value.map(projectId);
  }

  async get(id: string): Promise<VideoLingoProject> {
    projectId(id);
    const value = (await this.services.storage.readJson(`projects/${id}/project.json`)).value as unknown as VideoLingoProject;
    if (!value || value.id !== id || !Array.isArray(value.chunks) || !Array.isArray(value.outputPaths)) throw new Error('The project record is not readable');
    if (isWorking(value.state) && !this.activities.has(id)) {
      return { ...value, state: 'interrupted', ...(value.separation && ['running', 'receiving'].includes(value.separation.state)
        ? { separation: { ...value.separation, state: 'interrupted' } } : {}),
        ...(value.preview?.state === 'running' ? { preview: { ...value.preview, state: 'interrupted' } } : {}),
        ...(value.nlp?.state === 'running' ? { nlp: { ...value.nlp, state: 'interrupted' } } : {}),
        ...(value.translation?.state === 'running' ? { translation: { ...value.translation, state: 'interrupted' } } : {}),
        ...(value.dubbing?.state === 'running' ? { dubbing: { ...value.dubbing, state: 'interrupted' } } : {}) };
    }
    if (value.mediaPreview?.state === 'preparing' && !this.activities.has(id)) return { ...value, mediaPreview: { ...value.mediaPreview, state: 'interrupted' } };
    return value;
  }

  async list(): Promise<VideoLingoProject[]> {
    const epoch = this.epoch;
    const ids = await this.ids();
    const values = await Promise.all(ids.map(id => this.get(id)));
    this.guard(epoch);
    return values.map(value => isWorking(value.state) && !this.activities.has(value.id)
      ? { ...value, state: 'interrupted' as const } : value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async save(project: VideoLingoProject, epoch: number): Promise<VideoLingoProject> {
    this.guard(epoch);
    project.updatedAt = new Date().toISOString();
    await this.services.storage.writeJson(`projects/${project.id}/project.json`, JSON.parse(JSON.stringify(project)));
    this.guard(epoch);
    return project;
  }

  async create(title: string): Promise<VideoLingoProject> {
    const epoch = this.epoch;
    return this.serial(async () => {
      this.guard(epoch);
      const now = new Date().toISOString();
      const project: VideoLingoProject = { id: randomUUID(), title: title.trim().slice(0, 120) || 'Untitled project',
        createdAt: now, updatedAt: now, state: 'empty', chunks: [], currentChunk: 0, languageHint: '', outputPaths: [] };
      const ids = await this.ids();
      await this.save(project, epoch);
      this.guard(epoch);
      await this.services.storage.writeJson(INDEX, [...ids, project.id]);
      return project;
    });
  }

  async updateDubbingSettings(id: string, input: DubbingInput): Promise<VideoLingoProject> {
    const settings = validateDubbingInput(id, input);
    this.assertOwner(id); const epoch = this.epoch;
    return this.serial(async () => {
      this.assertOwner(id); const project = await this.get(id); this.assertEditable(project);
      if (this.activities.has(id)) throw new Error('Stop the current task before changing voice settings');
      if (settings.referenceAssetPath) {
        const asset = await this.services.storage.assets.stat(settings.referenceAssetPath);
        if (asset.sizeBytes <= 0 || asset.sizeBytes > 20 * 1024 ** 2) throw new Error('Reference must be at most 20 MiB');
      }
      project.dubbingSettings = { ...settings, ...(project.source?.mediaType.startsWith('audio/') ? { burnSubtitles: false } : {}) };
      return this.save(project, epoch);
    });
  }

  async attach(id: string, name: string, uploadId: string): Promise<VideoLingoProject> {
    this.assertOwner(id);
    const epoch = this.epoch;
    return this.serial(async () => {
      this.assertOwner(id, undefined);
      const project = await this.get(id); this.assertEditable(project);
      if (this.activities.has(id)) throw new Error('Stop the current task before changing its media');
      const assetPath = sourceAssetPath(id, name, uploadId);
      const asset = await this.services.storage.assets.stat(assetPath);
      if (asset.sizeBytes <= 0 || asset.sizeBytes > 4 * 1024 ** 3) throw new Error('Choose a non-empty media file up to 4 GB');
      project.source = { name, assetPath, mediaType: asset.mediaType || '', sizeBytes: asset.sizeBytes, sha256: asset.sha256 };
      project.state = 'ready'; project.chunks = []; project.currentChunk = 0; project.outputPaths = [];
      delete project.runId; delete project.runtimeJobId; delete project.error; delete project.transcript; delete project.wordCount; delete project.detectedLanguage; delete project.sourceLanguage; delete project.reportedLanguages; delete project.unreportedLanguageChunks;
      delete project.separation;
      delete project.nlp; delete project.preview; delete project.translation;
      delete project.dubbing; delete project.subtitleVideo;
      delete project.mediaPreview;
      delete project.downloadInput;
      return this.save(project, epoch);
    });
  }

  private assertEditable(project: VideoLingoProject): void {
    if (project.archivedAt) throw new Error('Restore the archived project before changing it');
    if (project.cleanupPending) throw new Error(`Finish the pending ${project.cleanupPending} cleanup before processing`);
  }

  private async quiescent(project: VideoLingoProject): Promise<void> {
    if (this.activities.has(project.id)) throw new Error('Pause or stop the current task first');
    for (const id of new Set([project.runtimeJobId, project.separation?.runtimeJobId, project.nlp?.runtimeJobId,
      project.translation?.runtimeJobId, project.preview?.runtimeJobId, project.dubbing?.runtimeJobId].filter((value): value is string => !!value))) {
      try {
        const job = (await this.services.ai.scenarioJobs.get(id)).job;
        if (!['completed', 'failed', 'canceled', 'timeout'].includes(job.status)) throw new Error('Stop the unfinished model Job before changing stored media');
      } catch (error) { if (!isMissingJob(error)) throw error; }
    }
  }

  async archive(id: string, archived: boolean): Promise<VideoLingoProject> {
    projectId(id); this.assertOwner(id); const epoch = this.epoch;
    return this.serial(async () => {
      this.guard(epoch); this.assertOwner(id); const project = await this.get(id);
      await this.quiescent(project);
      if (project.cleanupPending) throw new Error('Complete the pending cleanup first');
      if (archived) project.archivedAt = new Date().toISOString(); else delete project.archivedAt;
      return this.save(project, epoch);
    });
  }

  async clear(id: string, kind: 'media' | 'dubbing'): Promise<VideoLingoProject> {
    projectId(id); this.assertOwner(id); const epoch = this.epoch;
    if (!['media', 'dubbing'].includes(kind)) throw new Error('Choose media or dubbing cleanup');
    return this.serial(async () => {
      this.guard(epoch); this.assertOwner(id); const project = await this.get(id);
      if (project.archivedAt) throw new Error('Restore the archived project before clearing files');
      if (project.cleanupPending && project.cleanupPending !== kind) throw new Error('Finish the pending cleanup first');
      await this.quiescent(project);
      const prefix = `projects/${id}/${kind === 'dubbing' ? 'dubbing/' : ''}`;
      const paths: string[] = []; const cursors = new Set<string>(); let cursor: string | undefined;
      do {
        this.guard(epoch);
        const page = await this.services.storage.assets.list({ prefix, cursor, pageSize: 100 });
        if (page.assets.some(asset => !asset.relativePath.startsWith(prefix))) throw new Error('The cleanup listing includes a different project');
        paths.push(...page.assets.map(asset => asset.relativePath));
        cursor = page.nextCursor || undefined;
        if (cursor && cursors.has(cursor)) throw new Error('Storage pagination did not advance');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      const jsonPaths = kind === 'media' ? [...new Set(project.chunks.map(chunk => chunk.resultPath).filter((value): value is string => !!value))] : [];
      if (jsonPaths.some(path => !path.startsWith(prefix))) throw new Error('A transcription belongs to another project');
      project.cleanupPending = kind; await this.save(project, epoch);
      try {
        for (const assetPath of paths) { this.guard(epoch); await this.services.storage.assets.remove(assetPath); }
        if (kind === 'media') {
          for (const path of jsonPaths) {
            this.guard(epoch); await this.services.storage.removeJson(path);
          }
          project.chunks = []; project.currentChunk = 0; project.outputPaths = [];
          delete project.source; delete project.mediaPreview; delete project.downloadInput; delete project.transcriptionSource;
          delete project.runtimeJobId; delete project.selectionKey; delete project.transcript; delete project.wordCount;
          delete project.sourceLanguage; delete project.detectedLanguage; delete project.reportedLanguages; delete project.unreportedLanguageChunks;
          delete project.separation; delete project.nlp; delete project.translation; delete project.subtitleRevision; delete project.subtitleVideo; delete project.preview;
          if (project.settings) delete project.settings.customTermsAssetPath;
          if (project.dubbingSettings) { delete project.dubbingSettings.referenceAssetPath; delete project.dubbingSettings.referenceText; }
        }
        delete project.dubbing; delete project.workflowId; delete project.runId; delete project.cleanupPending; delete project.error;
        project.state = project.transcript ? 'transcribed' : project.source ? 'ready' : 'empty';
        return this.save(project, epoch);
      } catch (error) {
        if (this.epoch === epoch) { project.state = 'failed'; project.error = `Cleanup stopped; retry ${kind} cleanup. ${errorText(error)}`; await this.save(project, epoch); }
        throw error;
      }
    });
  }

  async updateSettings(id: string, input: BusinessSettings): Promise<VideoLingoProject> {
    projectId(id); this.assertOwner(id); const epoch = this.epoch;
    const settings = validateBusinessSettings(input);
    if (settings.customTermsAssetPath && !new RegExp(`^projects/${id}/terms/[0-9a-f-]+\\.xlsx$`).test(settings.customTermsAssetPath)) throw new Error('Choose this project’s terminology workbook');
    return this.serial(async () => {
      this.guard(epoch); this.assertOwner(id);
      if (this.activities.has(id)) throw new Error('Pause the current task before changing processing settings');
      const project = await this.get(id); this.assertEditable(project);
      project.settings = settings;
      // Existing results remain available until the user starts processing again.
      return this.save(project, epoch);
    });
  }

  async setWorkflow(id: string, workflowId: string, dubbing?: DubbingInput): Promise<void> {
    projectId(id); projectId(workflowId); this.assertOwner(id); const epoch = this.epoch;
    await this.serial(async () => {
      this.guard(epoch); this.assertOwner(id);
      if (this.activities.has(id)) throw new Error('Pause the current task first');
      const project = await this.get(id); this.assertEditable(project);
      project.workflowId = workflowId;
      if (dubbing) project.dubbingSettings = dubbing;
      await this.save(project, epoch);
    });
  }

  async readTaskSheet(assetPath: string): Promise<{ rows: TaskSheetRow[] }> {
    if (!/^batch-imports\/[0-9a-f-]+\.xlsx$/u.test(assetPath)) throw new Error('Upload the task sheet to this App first');
    const epoch = this.epoch, controller = new AbortController(); this.exports.add(controller);
    let workspace = '';
    try {
      const asset = await this.services.storage.assets.stat(assetPath);
      if (asset.sizeBytes <= 0 || asset.sizeBytes > 5 * 1024 ** 2) throw new Error('Task sheets must be at most 5 MiB');
      workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-task-sheet-'));
      const file = path.join(workspace, 'tasks.xlsx');
      await this.readAssetToFile(assetPath, file, controller.signal);
      const result = await runMediaWorker<{ rows: TaskSheetRow[] }>(this.appRoot, { operation: 'read-task-sheet', file, workspace }, controller.signal, this.packaged);
      this.guard(epoch); return result;
    } finally { this.exports.delete(controller); if (workspace) await rm(workspace, { recursive: true, force: true }); }
  }

  async downloadUrl(id: string, input: DownloadInput): Promise<VideoLingoProject> {
    projectId(id); this.assertOwner(id); const epoch = this.epoch;
    if (!input || typeof input.url !== 'string' || input.url.length > 4096 || !['360', '480', '720', '1080', 'best'].includes(input.resolution)) throw new Error('Choose a URL and download resolution');
    const url = new URL(input.url);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) throw new Error('Use an HTTP or HTTPS media URL');
    if (input.proxy !== undefined && (typeof input.proxy !== 'string' || input.proxy.length > 4096)) throw new Error('Invalid download proxy');
    if (input.cookiesAssetPath && !new RegExp(`^projects/${id}/download-cookies/[0-9a-f-]+\\.txt$`).test(input.cookiesAssetPath)) throw new Error('Choose this project’s cookie file');
    return this.serial(async () => {
      this.guard(epoch); this.assertOwner(id);
      if (this.activities.has(id)) throw new Error('Stop the current project task first');
      const project = await this.get(id); this.assertEditable(project);
      if (project.source) throw new Error('Create an empty project for the new URL');
      const task: Activity = { epoch, runId: randomUUID(), abort: new AbortController(), pause: false };
      project.downloadInput = input; project.state = 'downloading'; project.runId = task.runId; delete project.error;
      this.activities.set(id, task);
      try { await this.save(project, epoch); } catch (error) { this.activities.delete(id); throw error; }
      task.done = this.runDownload(project, task).catch(error => console.error('Download cleanup failed:', errorText(error)))
        .finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  private async runDownload(project: VideoLingoProject, task: Activity): Promise<void> {
    let workspace = '';
    try {
      workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-download-'));
      const input = project.downloadInput!;
      let cookiesPath: string | undefined;
      if (input.cookiesAssetPath) {
        const cookies = await this.services.storage.assets.stat(input.cookiesAssetPath);
        if (cookies.sizeBytes <= 0 || cookies.sizeBytes > 1024 ** 2) throw new Error('Cookie files must be at most 1 MiB');
        cookiesPath = path.join(workspace, 'cookies.txt');
        await this.readAssetToFile(input.cookiesAssetPath, cookiesPath, task.abort.signal);
      }
      const result = await runMediaWorker<{ file: string; name: string; mediaType: string }>(this.appRoot,
        { operation: 'download-url', workspace, url: input.url, resolution: input.resolution, proxy: input.proxy, cookiesPath }, task.abort.signal, this.packaged);
      task.abort.signal.throwIfAborted();
      const assetPath = sourceAssetPath(project.id, result.name, randomUUID());
      await this.importFile(workspace, result.file, assetPath, result.mediaType, task.epoch, task.abort.signal);
      task.abort.signal.throwIfAborted();
      const asset = await this.services.storage.assets.stat(assetPath);
      project.source = { name: result.name, assetPath, mediaType: result.mediaType, sizeBytes: asset.sizeBytes, sha256: asset.sha256 };
      project.state = 'ready'; await this.checkpoint(project, task);
    } catch (error) {
      if (task.epoch === this.epoch) {
        project.state = task.abort.signal.aborted ? 'canceled' : 'failed';
        if (!task.abort.signal.aborted) project.error = errorText(error);
        await this.serial(() => this.save(project, task.epoch));
      }
    } finally { if (workspace) await rm(workspace, { recursive: true, force: true }); }
  }

  async prepareMediaPreview(id: string): Promise<VideoLingoProject> {
    projectId(id);
    return this.serial(async () => {
      this.assertOwner(id);
      if (this.activities.has(id)) throw new Error('Wait for the current project task before preparing a preview');
      const project = await this.get(id); this.assertEditable(project);
      if (!project.source) throw new Error('Import the original media first');
      if (project.mediaPreview?.sourceHash === project.source.sha256 && project.mediaPreview.state === 'completed') return project;
      const task: Activity = { runId: randomUUID(), epoch: this.epoch, abort: new AbortController(), pause: false };
      project.mediaPreview = { sourceHash: project.source.sha256, state: 'preparing' }; project.runId = task.runId;
      this.activities.set(id, task);
      try { await this.save(project, task.epoch); } catch (error) { this.activities.delete(id); throw error; }
      task.done = (async () => {
        let workspace = '';
        try {
          workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-media-preview-'));
          const source = path.join(workspace, 'source' + path.extname(project.source!.assetPath));
          await this.readAssetToFile(project.source!.assetPath, source, task.abort.signal);
          const result = await runMediaWorker<{ file: string; durationSeconds: number; sourceDurationSeconds: number; videoCopied: boolean; width: number; height: number }>(
            this.appRoot, { operation: 'compatible-preview', workspace, source }, task.abort.signal, this.packaged);
          const assetPath = `projects/${id}/media-preview/${project.source!.sha256.replace(/^sha256:/, '')}.mp4`;
          await this.importFile(workspace, result.file, assetPath, 'video/mp4', task.epoch);
          const { file: _file, ...details } = result;
          project.mediaPreview = { sourceHash: project.source!.sha256, state: 'completed', assetPath, ...details };
          await this.checkpoint(project, task);
        } catch (error) {
          if (task.epoch === this.epoch) {
            project.mediaPreview = { sourceHash: project.source!.sha256, state: 'failed', error: errorText(error) };
            await this.serial(() => this.save(project, task.epoch));
          }
        } finally { if (workspace) await rm(workspace, { recursive: true, force: true }); }
      })().catch(error => console.error('Preview cleanup failed:', errorText(error))).finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  async renderSubtitles(id: string, owner?: string, runSettings?: BusinessSettings): Promise<VideoLingoProject> {
    projectId(id); this.assertOwner(id, owner);
    return this.serial(async () => {
      this.assertOwner(id, owner);
      if (this.activities.has(id)) throw new Error('Wait for the current project task');
      const project = await this.get(id); this.assertEditable(project);
      if (!project.source || project.translation?.state !== 'completed') throw new Error('Complete translation first');
      if (project.source.mediaType.startsWith('audio/')) throw new Error('Audio sources export subtitle files without video');
      await this.validSubtitleReview(project, ['display']);
      const files = subtitleFiles(project), key = subtitleKey(project)!;
      const task: Activity = { runId: randomUUID(), epoch: this.epoch, abort: new AbortController(), pause: false };
      project.state = 'rendering'; project.runId = task.runId; delete project.error;
      this.activities.set(id, task);
      try { await this.save(project, task.epoch); } catch (error) { this.activities.delete(id); throw error; }
      task.done = (async () => {
        let workspace = '';
        try {
          workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-subtitle-video-'));
          await mkdir(path.join(workspace, 'output'), { recursive: true });
          const source = path.join(workspace, 'output', `source.${project.source!.name.split('.').pop()!.toLowerCase()}`);
          await this.readAssetToFile(project.source!.assetPath, source, task.abort.signal);
          for (const name of ['src.srt', 'trans.srt']) await this.readAssetToFile(files[`output/${name}`]!, path.join(workspace, 'output', name), task.abort.signal);
          const result = await runMediaWorker<{ file: string }>(this.appRoot, { operation: 'render-subtitles', workspace, source,
            businessSettings: pythonBusinessSettings(runSettings || businessSettings(project)) }, task.abort.signal, this.packaged);
          const assetPath = `projects/${id}/subtitle-video/${key}/output_sub.mp4`;
          await this.importFile(workspace, result.file, assetPath, 'video/mp4', task.epoch);
          project.subtitleVideo = { translationKey: key, assetPath };
          project.state = 'transcribed'; await this.checkpoint(project, task);
        } catch (error) {
          if (task.epoch === this.epoch) { project.state = task.abort.signal.aborted ? 'canceled' : 'failed'; project.error = errorText(error); await this.serial(() => this.save(project, task.epoch)); }
        } finally { if (workspace) await rm(workspace, { recursive: true, force: true }); }
      })().catch(error => console.error('Subtitle export cleanup failed:', errorText(error)))
        .finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  async start(id: string, languageHint: string, owner?: string, runSettings?: BusinessSettings): Promise<VideoLingoProject> {
    this.assertOwner(id, owner);
    projectId(id);
    if (!['', 'en', 'zh', 'ja', 'fr', 'de', 'it', 'ru', 'es'].includes(languageHint)) throw new Error('Unsupported source language');
    return this.serial(async () => {
      this.assertOwner(id, owner);
      if (this.activities.has(id)) return this.get(id);
      const project = await this.get(id); this.assertEditable(project);
      if (!project.source) throw new Error('Import media first');
      if (project.separation?.state === 'interrupted') throw new Error('Resume the interrupted separation task first');
      const settings = validateBusinessSettings(runSettings || businessSettings(project));
      if (settings.vocalEnhancement && (project.separation?.state !== 'completed' || !project.separation.vocalsPath)) throw new Error('Complete vocal enhancement before transcription');
      if (settings.vocalEnhancement && !project.separation!.vocalsPath!.startsWith(`projects/${id}/separation/`)) throw new Error('Vocal enhancement must use this project’s separation result');
      const transcriptionSource = { ...(settings.vocalEnhancement ? { vocalPath: project.separation!.vocalsPath! } : {}), rawSampleRate: settings.rawSampleRate, rawBitrate: settings.rawBitrate };
      const sourceChanged = JSON.stringify(project.transcriptionSource || { rawSampleRate: 32000, rawBitrate: '128k' }) !== JSON.stringify(transcriptionSource);
      const priorJobId = project.runtimeJobId;
      const existing = await this.mediaJob(project, 'transcribe', this.epoch);
      const expired = !!priorJobId && project.invalidatedJobIds?.includes(priorJobId);
      if (expired && project.languageHint !== languageHint) throw new Error('Resume the expired Job with its original source language before changing inputs');
      const reusable = existing && !['failed', 'canceled', 'timeout'].includes(existing.status);
      if (reusable && (project.languageHint !== languageHint || sourceChanged)) throw new Error('Resume the existing Job with its original source and language setting');
      if (expired && sourceChanged) throw new Error('Resume the expired Job with its original source settings');
      const selectionKey = reusable ? project.selectionKey! : await this.selectionKey('audio.transcribe');
      const task: Activity = { runId: randomUUID(), epoch: this.epoch, abort: new AbortController(), pause: false };
      this.activities.set(id, task);
      if (!reusable && !expired && (sourceChanged || project.languageHint !== languageHint || project.selectionKey !== selectionKey || ['transcribed', 'no-speech'].includes(project.state))) {
        project.chunks = sourceChanged ? [] : project.chunks.map(({ resultPath: _result, ...chunk }) => chunk);
        project.currentChunk = 0; project.outputPaths = []; delete project.runtimeJobId;
        delete project.transcript; delete project.wordCount; delete project.detectedLanguage; delete project.sourceLanguage; delete project.reportedLanguages; delete project.unreportedLanguageChunks;
        delete project.nlp; delete project.translation;
        delete project.dubbing; delete project.subtitleVideo;
      }
      project.selectionKey = selectionKey;
      project.transcriptionSource = transcriptionSource;
      project.languageHint = languageHint; project.runId = task.runId; project.state = 'preparing';
      delete project.error;
      try { await this.save(project, task.epoch); }
      catch (error) { this.activities.delete(id); throw error; }
      task.done = this.run(project, task, reusable ? existing : undefined, settings).catch(error => { console.error('VideoLingo task cleanup failed:', errorText(error)); })
        .finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  async separate(id: string, owner?: string): Promise<VideoLingoProject> {
    this.assertOwner(id, owner);
    projectId(id);
    return this.serial(async () => {
      this.assertOwner(id, owner);
      if (this.activities.has(id)) return this.get(id);
      const project = await this.get(id); this.assertEditable(project);
      if (!project.source) throw new Error('Import media first');
      if (project.runtimeJobId) throw new Error('Resume the interrupted transcription before starting separation');
      const sourceSettings = { sourceHash: project.source.sha256 };
      const stage = project.separation;
      const priorJobId = stage?.runtimeJobId;
      const existing = await this.mediaJob(project, 'separate', this.epoch);
      const expired = !!priorJobId && project.invalidatedJobIds?.includes(priorJobId);
      const reusable = existing && !['failed', 'canceled', 'timeout'].includes(existing.status);
      const key = reusable ? stage!.selectionKey : await this.selectionKey('audio.separate');
      if (!stage || (!reusable && !expired && (stage.selectionKey !== key || stage.state === 'completed'))) {
        project.separation = { state: 'running', selectionKey: key, pairs: [], currentChunk: 0, sourceSettings };
      } else { stage.state = 'running'; stage.selectionKey = key; delete stage.error; }
      const task: Activity = { runId: randomUUID(), epoch: this.epoch, abort: new AbortController(), pause: false };
      this.activities.set(id, task);
      project.runId = task.runId; project.state = 'separating'; delete project.error;
      try { await this.save(project, task.epoch); }
      catch (error) { this.activities.delete(id); throw error; }
      task.done = this.runSeparation(project, task, reusable ? existing : undefined)
        .catch(error => console.error('VideoLingo separation cleanup failed:', errorText(error)))
        .finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  async control(id: string, action: 'pause' | 'cancel', owner?: string): Promise<VideoLingoProject> {
    this.assertOwner(id, owner);
    const task = this.activities.get(projectId(id));
    if (!task) {
      return this.serial(async () => {
      this.assertOwner(id, owner);
        const project = await this.get(id);
        if (action === 'cancel' && (project.runtimeJobId || project.separation?.runtimeJobId)) {
          const epoch = this.epoch;
          for (const kind of ['transcribe', 'separate'] as const) {
            const stage = kind === 'transcribe' ? project : project.separation;
            if (!stage?.runtimeJobId) continue;
            const job = await this.mediaJob(project, kind, epoch);
            if (job && !['completed', 'failed', 'canceled', 'timeout'].includes(job.status)) {
              try { await this.services.ai.scenarioJobs.cancel(job.jobId, 'videolingo-user-canceled'); }
              catch (error) { if (!isMissingJob(error)) throw error; }
            }
            if (job?.status !== 'completed') delete stage.runtimeJobId;
            if (kind === 'separate' && stage.state !== 'completed') stage.state = 'canceled';
          }
          project.state = project.transcript ? 'transcribed' : project.wordCount === 0 ? 'no-speech' : 'canceled';
          return this.save(project, epoch);
        }
        if (action === 'cancel' && project.dubbing?.runtimeJobId) {
          try { await this.services.ai.scenarioJobs.cancel(project.dubbing.runtimeJobId, 'videolingo-user-canceled'); } catch (error) { if (!missing(error)) throw error; }
          project.dubbing.state = 'canceled'; project.state = 'transcribed';
          return this.save(project, this.epoch);
        }
        if (action === 'cancel' && project.translation?.runtimeJobId) {
          await this.services.ai.scenarioJobs.cancel(project.translation.runtimeJobId, 'videolingo-user-canceled');
          project.translation.state = 'canceled'; project.state = 'transcribed';
          return this.save(project, this.epoch);
        }
        if (action === 'cancel' && project.nlp?.runtimeJobId) {
          await this.services.ai.scenarioJobs.cancel(project.nlp.runtimeJobId, 'videolingo-user-canceled');
          project.nlp.state = 'canceled'; project.state = 'transcribed';
          return this.save(project, this.epoch);
        }
        if (action === 'cancel' && project.preview?.runtimeJobId) {
          await this.services.ai.scenarioJobs.cancel(project.preview.runtimeJobId, 'videolingo-user-canceled');
          project.preview.state = 'canceled';
          project.state = project.transcript ? 'transcribed' : project.source ? 'ready' : 'empty';
          return this.save(project, this.epoch);
        }
        return project;
      });
    }
    if (action === 'pause') task.pause = true;
    else {
      task.abort.abort();
      if (task.runtimeJobId) await this.services.ai.scenarioJobs.cancel(task.runtimeJobId, 'videolingo-user-canceled');
    }
    return this.get(id);
  }

  private async checkpoint(project: VideoLingoProject, task: Activity): Promise<void> {
    this.guard(task.epoch);
    task.abort.signal.throwIfAborted();
    await this.serial(async () => {
      const current = await this.get(project.id);
      if (current.runId !== task.runId) throw new Error('This project run was replaced');
      await this.save(project, task.epoch);
    });
  }

  async settled(id: string): Promise<VideoLingoProject> {
    projectId(id);
    const task = this.activities.get(id);
    if (task?.done) await task.done;
    return this.get(id);
  }

  async exportInfo(id: string, assetPath: string, subtitleDraft = false) {
    projectId(id); const project = await this.get(id);
    if (!assetPath.startsWith(`projects/${id}/`) || assetPath.split('/').some(part => part === '..' || part === '.')) throw new Error('Choose a file from this project');
    if (subtitleDraft && (!assetPath.endsWith('.srt') || ![...Object.values(subtitleFiles(project)), ...Object.values(project.translation?.files || {})].includes(assetPath))) throw new Error('Choose a saved subtitle draft from this project');
    if (assetPath.endsWith('.srt') && (assetPath.includes('/translation/') || assetPath.includes('/subtitle-edits/'))) {
      if (!subtitleDraft) {
        await this.validSubtitleReview(project, [assetPath.includes('/audio/') ? 'dubbing' : 'display']);
        if (!Object.values(subtitleFiles(project)).includes(assetPath)) throw new Error('Export the current subtitle revision from the proofreading panel');
      }
    }
    return this.services.storage.assets.stat(assetPath);
  }

  async exportSubtitleZip(id: string, draft: boolean): Promise<string> {
    projectId(id); const epoch = this.epoch;
    return this.serial(async () => {
      this.guard(epoch);
      const project = await this.get(id);
      if (this.activities.has(id) || project.cleanupPending) throw new Error('Wait for the current project task before exporting subtitles');
      if (!project.translation || project.translation.state !== 'completed') throw new Error('Complete subtitle generation first');
      if (!draft) await this.validSubtitleReview(project);
      const files = subtitleFiles(project);
      const controller = new AbortController(); this.exports.add(controller);
      let workspace = '';
      try {
        workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-subtitle-zip-'));
        const entries: { name: string; file: string }[] = [];
        for (const name of SUBTITLE_FILES) if (files[name]) {
          if (!files[name]!.startsWith(`projects/${id}/`)) throw new Error('A subtitle belongs to a different project');
          const file = path.join(workspace, name); await mkdir(path.dirname(file), { recursive: true });
          await this.readAssetToFile(files[name]!, file, controller.signal); entries.push({ name: name.slice('output/'.length), file });
        }
        if (!entries.length) throw new Error('No subtitle files are available');
        const output = await runMediaWorker<{ file: string }>(this.appRoot, { operation: 'zip-subtitles', workspace, files: entries }, controller.signal, this.packaged);
        const assetPath = `projects/${id}/exports/${draft ? 'draft-' : ''}subtitles-${randomUUID()}.zip`;
        await this.importFile(workspace, output.file, assetPath, 'application/zip', epoch, controller.signal);
        return assetPath;
      } finally { this.exports.delete(controller); if (workspace) await rm(workspace, { recursive: true, force: true }); }
    });
  }

  private async readSubtitleText(relativePath: string, epoch: number): Promise<string> {
    const asset = await this.services.storage.assets.read({ relativePath });
    const blocks: Uint8Array[] = []; let size = 0;
    for await (const block of asset.body) {
      this.guard(epoch); size += block.byteLength;
      if (size > SUBTITLE_LIMIT) throw new Error('Subtitle file exceeds 256 KiB');
      blocks.push(block);
    }
    this.guard(epoch);
    if (size !== asset.range.length) throw new Error('Incomplete subtitle stream');
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(blocks));
  }

  private async readSubtitleReview(project: VideoLingoProject): Promise<SubtitleReview> {
    const epoch = this.epoch;
    if (project.translation?.state !== 'completed' || !project.source) throw new Error('Complete translation before proofreading');
    const revision = currentSubtitleRevision(project), files = subtitleFiles(project);
    const prefix = revision ? `projects/${project.id}/subtitle-edits/${revision.revision}/` : `projects/${project.id}/translation/${project.translation.key}/`;
    const read = async (name: string) => {
      if (files[name] !== prefix + name) throw new Error('Subtitle file does not belong to this project revision');
      return this.readSubtitleText(files[name]!, epoch);
    };
    const [source, translation, audioSource, audioTranslation] = await Promise.all([
      read('output/src.srt'), read('output/trans.srt'), read('output/audio/src_subs_for_audio.srt'), read('output/audio/trans_subs_for_audio.srt')]);
    const content = { display: { source, translation }, dubbing: { source: audioSource, translation: audioTranslation } };
    const durationMs = Math.round(Math.max(project.mediaPreview?.sourceDurationSeconds || 0,
      ...project.chunks.map(chunk => chunk.offsetSeconds + chunk.durationSeconds)) * 1000);
    let issues: string[];
    try { issues = subtitleIssues(content, durationMs); } catch (error) { issues = [errorText(error)]; }
    return { ...content, translationKey: project.translation.key, revision: revision?.revision || '', origin: revision ? 'user' : 'model',
      files: Object.fromEntries(Object.entries(files).filter(([name]) => SUBTITLE_FILES.includes(name as typeof SUBTITLE_FILES[number]))),
      durationMs, issues };
  }

  private async validSubtitleReview(project: VideoLingoProject, kinds: readonly ('display' | 'dubbing')[] = ['display', 'dubbing']): Promise<SubtitleReview> {
    const review = await this.readSubtitleReview(project);
    let issues: string[];
    try { issues = subtitleIssues(review, review.durationMs, kinds); } catch (error) { issues = [errorText(error)]; }
    if (issues.length) throw new Error(`Subtitle proofreading required (${issues.length} timing/pairing issues): ${issues.slice(0, 8).join('; ')}`);
    return review;
  }

  async subtitles(id: string): Promise<SubtitleReview> { return this.readSubtitleReview(await this.get(projectId(id))); }
  async validateSubtitles(id: string): Promise<void> { await this.validSubtitleReview(await this.get(projectId(id))); }

  async saveSubtitles(id: string, input: SubtitleSaveInput): Promise<VideoLingoProject> {
    projectId(id); this.assertOwner(id); const epoch = this.epoch;
    return this.serial(async () => {
      this.guard(epoch); this.assertOwner(id);
      if (this.activities.has(id)) throw new Error('Wait for the current project task before saving subtitles');
      const project = await this.get(id); this.assertEditable(project);
      const current = await this.readSubtitleReview(project);
      if (!input || input.translationKey !== current.translationKey || input.revision !== current.revision) throw new Error('Subtitles changed; reload the current version before saving');
      const content = { display: input.display, dubbing: input.dubbing };
      const issues = subtitleIssues(content, current.durationMs);
      if (project.dubbing?.runtimeJobId) {
        try {
          const previous = (await this.services.ai.scenarioJobs.get(project.dubbing.runtimeJobId)).job;
          if (!['completed', 'failed', 'canceled', 'timeout'].includes(previous.status)) throw new Error('Stop the existing dubbing Job before changing subtitles');
        } catch (error) { if (!isMissingJob(error)) throw error; }
      }
      const revision = createHash('sha256').update(JSON.stringify({ translation: current.translationKey, ...content })).digest('hex');
      if (revision === current.revision) return project;
      // Invalid, parseable pairs are retained as drafts. Consumers require valid pairs.
      const outputs = issues.length ? { 'output/src.srt': input.display.source, 'output/trans.srt': input.display.translation,
        'output/audio/src_subs_for_audio.srt': input.dubbing.source, 'output/audio/trans_subs_for_audio.srt': input.dubbing.translation } : subtitleOutputs(content);
      const files: Record<string, string> = {};
      for (const [name, text] of Object.entries(outputs)) {
        this.guard(epoch);
        const relativePath = `projects/${id}/subtitle-edits/${revision}/${name}`;
        await this.services.storage.assets.write({ relativePath, body: new TextEncoder().encode(text), mediaType: 'text/plain', overwrite: true });
        files[name] = relativePath;
      }
      this.guard(epoch);
      project.subtitleRevision = { translationKey: current.translationKey, revision, savedAt: new Date().toISOString(), files };
      delete project.subtitleVideo; delete project.dubbing;
      return this.save(project, epoch);
    });
  }

  async exportAsset(id: string, assetPath: string, destination: string, subtitleDraft = false): Promise<{ bytes: number }> {
    const epoch = this.epoch;
    const asset = await this.exportInfo(id, assetPath, subtitleDraft);
    const controller = new AbortController(); this.exports.add(controller);
    const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.partial`);
    try {
      this.guard(epoch);
      await this.readAssetToFile(assetPath, temporary, controller.signal);
      this.guard(epoch); controller.signal.throwIfAborted();
      if ((await stat(temporary)).size !== asset.sizeBytes) throw new Error('Export did not receive the complete asset');
      await rename(temporary, destination);
      return { bytes: asset.sizeBytes };
    } finally { this.exports.delete(controller); await rm(temporary, { force: true }); }
  }

  private async mediaJob(project: VideoLingoProject, kind: 'transcribe' | 'separate', epoch: number) {
    const stage = kind === 'transcribe' ? project : project.separation;
    if (!stage?.runtimeJobId) return undefined;
    const complete = kind === 'transcribe' ? !!project.chunks[project.currentChunk]?.resultPath
      : !!project.separation?.pairs[stage.currentChunk];
    if (complete) {
      delete stage.runtimeJobId;
      await this.save(project, epoch);
      return undefined;
    }
    return retainedJob(id => this.services.ai.scenarioJobs.get(id), stage.runtimeJobId, async id => {
      this.guard(epoch);
      delete stage.runtimeJobId;
      project.invalidatedJobIds = [...new Set([...(project.invalidatedJobIds || []), id])];
      await this.save(project, epoch);
    });
  }

  private async selectionKey(capability: string): Promise<string> {
    const snapshot = await this.services.aiConfig.get();
    const selection = snapshot.effectiveSelections.find(item => item.capabilityContract === capability);
    if (!selection || selection.state !== 'ready' || !selection.resource) {
      throw new Error(`Configure ${capability} in AI configuration first. ${selection?.reasons.join(', ') || ''}`);
    }
    // Cache lineage only. Runtime still selects the execution resource itself.
    return JSON.stringify({ intent: snapshot.config?.capabilities.find(item => item.capabilityContract === capability), resource: selection.resource });
  }

  async splitNlp(id: string, owner?: string): Promise<VideoLingoProject> {
    this.assertOwner(id, owner);
    projectId(id);
    return this.serial(async () => {
      this.assertOwner(id, owner);
      if (this.activities.has(id)) throw new Error('Wait for the current project task');
      const project = await this.get(id); this.assertEditable(project);
      const inputPath = project.outputPaths.find(value => value.endsWith('/cleaned_chunks.xlsx'));
      if (!inputPath || !project.transcript || !sourceLanguageFor(project)) throw new Error('Complete speech transcription first');
      if (inputPath !== `projects/${id}/results/cleaned_chunks.xlsx`) throw new Error('The transcript word table belongs to another project');
      if (project.runtimeJobId || project.separation?.runtimeJobId) throw new Error('Resume the existing media Job first');
      const selectionKey = await this.selectionKey('text.annotate');
      if (project.nlp?.runtimeJobId && (project.nlp.selectionKey !== selectionKey || project.nlp.inputPath !== inputPath)) {
        const previous = (await this.services.ai.scenarioJobs.get(project.nlp.runtimeJobId)).job;
        if (!['completed', 'failed', 'canceled', 'timeout'].includes(previous.status)) throw new Error('Stop the prior language analysis Job before changing its inputs');
      }
      if (!project.nlp || project.nlp.selectionKey !== selectionKey || project.nlp.inputPath !== inputPath) {
        project.nlp = { state: 'running', selectionKey, inputPath, jobs: {} };
      }
      project.nlp.state = 'running'; delete project.nlp.error; delete project.nlp.failure;
      const task: Activity = { runId: randomUUID(), epoch: this.epoch, abort: new AbortController(), pause: false };
      project.state = 'annotating'; project.runId = task.runId;
      this.activities.set(id, task);
      try { await this.save(project, task.epoch); } catch (error) { this.activities.delete(id); throw error; }
      task.done = this.runNlp(project, task).catch(error => console.error('Language analysis cleanup failed:', errorText(error)))
        .finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  private async runNlp(project: VideoLingoProject, task: Activity): Promise<void> {
    const stage = project.nlp!;
    let workspace = '';
    try {
      workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-nlp-'));
      await mkdir(path.join(workspace, 'output/log'), { recursive: true });
      await this.readAssetToFile(stage.inputPath, path.join(workspace, 'output/log/cleaned_chunks.xlsx'), task.abort.signal);
      const model = new ModelOperations(this.services, { workspace, assetPrefix: `projects/${project.id}/nlp/${task.runId}`, signal: task.abort.signal,
        guard: () => this.guard(task.epoch), onVoice: async () => { throw new Error('NLP cannot create a voice'); },
        onMissingJob: id => this.recordMissingJob(project, task, id),
        onJob: async id => { stage.runtimeJobId = id; task.runtimeJobId = id; await this.checkpoint(project, task); } });
      const result = await runMediaWorker<{ file: string; text: string }>(this.appRoot,
        { operation: 'split-nlp', workspace, sourceLanguage: sourceLanguageFor(project), detectedLanguage: project.detectedLanguage }, task.abort.signal, this.packaged,
        model.annotationHandler(stage.jobs, () => this.checkpoint(project, task)));
      task.abort.signal.throwIfAborted();
      stage.outputPath = `projects/${project.id}/nlp/${task.runId}/split_by_nlp.txt`;
      await this.importFile(workspace, result.file, stage.outputPath, 'text/plain', task.epoch);
      stage.text = result.text.slice(0, 4000); stage.textTruncated = result.text.length > 4000; stage.state = 'completed'; delete stage.runtimeJobId;
      project.state = 'transcribed';
      await this.checkpoint(project, task);
    } catch (error) {
      if (task.epoch === this.epoch) {
        stage.state = task.abort.signal.aborted ? 'canceled' : 'failed';
        if (!task.abort.signal.aborted) { stage.error = errorText(error); stage.failure = extractNimiErrorFields(error); }
        project.state = 'transcribed';
        await this.serial(() => this.save(project, task.epoch));
      }
    } finally { if (workspace) await rm(workspace, { recursive: true, force: true }); }
  }

  async translate(id: string, input: TranslationInput, owner?: string, runSettings?: BusinessSettings): Promise<VideoLingoProject> {
    this.assertOwner(id, owner);
    projectId(id);
    if (!input || typeof input.targetLanguage !== 'string' || !input.targetLanguage.trim() || input.targetLanguage.length > 80) throw new Error('Choose a target language');
    if (input.customTermsAssetPath && !new RegExp(`^projects/${id}/terms/[0-9a-f-]+\\.xlsx$`).test(input.customTermsAssetPath)) throw new Error('Choose a terminology workbook from this project');
    return this.serial(async () => {
      this.assertOwner(id, owner);
      if (this.activities.has(id)) throw new Error('Wait for the current project task');
      const project = await this.get(id); this.assertEditable(project);
      if (project.nlp?.state !== 'completed' || !project.nlp.outputPath) throw new Error('Complete subtitle sentence splitting first');
      if (project.nlp.inputPath !== `projects/${id}/results/cleaned_chunks.xlsx` || !project.nlp.outputPath.startsWith(`projects/${id}/nlp/`)) throw new Error('The sentence inputs belong to another project');
      const textSelection = await this.selectionKey('text.generate');
      const annotationSelection = await this.selectionKey('text.annotate');
      const settings = validateBusinessSettings(runSettings || businessSettings(project));
      const parameters = translationSettings(settings);
      const key = createHash('sha256').update(JSON.stringify({ input, textSelection, annotationSelection, source: project.nlp.outputPath,
        ...(JSON.stringify(parameters) === JSON.stringify(translationSettings(DEFAULT_BUSINESS_SETTINGS)) ? {} : { parameters }) })).digest('hex');
      if (project.translation?.runtimeJobId && project.translation.key !== key) {
        const previous = (await this.services.ai.scenarioJobs.get(project.translation.runtimeJobId)).job;
        if (!['completed', 'failed', 'canceled', 'timeout'].includes(previous.status)) throw new Error('Stop the existing translation analysis Job first');
      }
      if (project.translation?.key !== key) {
        const previous = project.translation;
        // Reuse exact successful prompts when only downstream business controls change.
        const files = Object.fromEntries(Object.entries(previous?.files || {}).filter(([name]) => TRANSLATION_MODEL_STEPS.some(step => name === `output/gpt_log/${step}.json`)));
        project.translation = { state: 'running', key, input, files, completedSteps: [], settings,
          jobs: annotationSelection === project.nlp.selectionKey ? { ...project.nlp.jobs, ...previous?.jobs } : {} };
      }
      project.translation!.settings = settings;
      project.translation!.state = 'running'; delete project.translation!.error; delete project.translation!.failure;
      const task: Activity = { runId: randomUUID(), epoch: this.epoch, abort: new AbortController(), pause: false };
      project.state = 'translating'; project.runId = task.runId; this.activities.set(id, task);
      try { await this.save(project, task.epoch); } catch (error) { this.activities.delete(id); throw error; }
      task.done = this.runTranslation(project, task, textSelection).catch(error => console.error('Translation cleanup failed:', errorText(error)))
        .finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  private async runTranslation(project: VideoLingoProject, task: Activity, selectionKey: string): Promise<void> {
    const stage = project.translation!;
    let workspace = '';
    let cacheWrites: Promise<unknown> = Promise.resolve();
    let capturedStreamFailure = false;
    const prefix = `projects/${project.id}/translation/${stage.key}`;
    const retain = async (relative: string) => {
      task.abort.signal.throwIfAborted();
      const filename = path.join(workspace, relative);
      const assetPath = `${prefix}/${relative}`;
      if (relative.endsWith('.json')) JSON.parse(await readFile(filename, 'utf8'));
      await this.importFile(workspace, filename, assetPath, relative.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : relative.endsWith('.json') ? 'application/json' : 'text/plain', task.epoch);
      stage.files[relative] = assetPath;
    };
    try {
      workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-translation-'));
      await mkdir(path.join(workspace, 'output/log'), { recursive: true });
      await mkdir(path.join(workspace, 'output/audio'), { recursive: true });
      await this.readAssetToFile(project.nlp!.inputPath, path.join(workspace, 'output/log/cleaned_chunks.xlsx'), task.abort.signal);
      await this.readAssetToFile(project.nlp!.outputPath!, path.join(workspace, 'output/log/split_by_nlp.txt'), task.abort.signal);
      if (stage.input.customTermsAssetPath) {
        const terms = await this.services.storage.assets.stat(stage.input.customTermsAssetPath);
        if (terms.sizeBytes <= 0 || terms.sizeBytes > 5 * 1024 ** 2) throw new Error('Terminology workbook must be at most 5 MiB');
        await this.readAssetToFile(stage.input.customTermsAssetPath, path.join(workspace, 'custom_terms.xlsx'), task.abort.signal);
      }
      else await copyFile(path.join(this.appRoot, 'custom_terms.xlsx'), path.join(workspace, 'custom_terms.xlsx'));
      const allowedFiles = new Set([...Object.values(TRANSLATION_FILES).flat(), ...TRANSLATION_MODEL_STEPS.map(step => `output/gpt_log/${step}.json`), 'output/gpt_log/error.json', 'output/gpt_log/stream-failure.json']);
      for (const [relative, assetPath] of Object.entries(stage.files)) {
        const sharedPromptCache = TRANSLATION_MODEL_STEPS.some(step => relative === `output/gpt_log/${step}.json`)
          && new RegExp(`^projects/${project.id}/translation/[0-9a-f]{64}/${relative.replaceAll('.', '\\.')}$`).test(assetPath);
        if (!allowedFiles.has(relative) || assetPath !== `${prefix}/${relative}` && !sharedPromptCache) throw new Error('Invalid saved translation file');
        await mkdir(path.dirname(path.join(workspace, relative)), { recursive: true });
        await this.readAssetToFile(assetPath, path.join(workspace, relative), task.abort.signal);
      }
      const orderedSteps = Object.keys(TRANSLATION_FILES);
      if (stage.completedSteps.some((step, index) => step !== orderedSteps[index] || TRANSLATION_FILES[step]!.some(file => !stage.files[file]))) {
        throw new Error('Translation checkpoints are incomplete or out of order');
      }
      const model = new ModelOperations(this.services, { workspace, assetPrefix: prefix, signal: task.abort.signal, guard: () => this.guard(task.epoch),
        onTextFailure: async record => {
          if (capturedStreamFailure) return;
          capturedStreamFailure = true;
          const save = cacheWrites.then(async () => {
            const relative = 'output/gpt_log/stream-failure.json';
            await mkdir(path.join(workspace, 'output/gpt_log'), { recursive: true });
            await writeFile(path.join(workspace, relative), JSON.stringify(record, null, 2), 'utf8');
            await retain(relative); await this.checkpoint(project, task);
          });
          cacheWrites = save; await save;
        },
        onVoice: async () => { throw new Error('Translation cannot create voices'); },
        onMissingJob: id => this.recordMissingJob(project, task, id),
        onJob: async id => { stage.runtimeJobId = id; task.runtimeJobId = id; await this.checkpoint(project, task); } });
      await runMediaWorker(this.appRoot, { operation: 'translate-subtitles', workspace, selectionKey,
        sourceLanguage: sourceLanguageFor(project), detectedLanguage: project.detectedLanguage, targetLanguage: stage.input.targetLanguage, reflect: stage.input.reflect,
        completedSteps: stage.completedSteps, businessSettings: pythonBusinessSettings(stage.settings || DEFAULT_BUSINESS_SETTINGS) },
      task.abort.signal, this.packaged, { ...model.handlers(TRANSLATION_MODEL_STEPS),
        ...model.annotationHandler(stage.jobs, () => this.checkpoint(project, task)),
        checkpoint: async input => {
          if (input.stage === 'model-cache') {
            if (typeof input.step !== 'string' || ![...TRANSLATION_MODEL_STEPS, 'error'].includes(input.step)) throw new Error('Unknown translation cache checkpoint');
            const step = input.step;
            const save = cacheWrites.then(async () => {
              await retain(`output/gpt_log/${step}.json`);
              await this.checkpoint(project, task);
              return { saved: true };
            });
            cacheWrites = save;
            return save;
          }
          if (typeof input.stage !== 'string' || !Object.hasOwn(TRANSLATION_FILES, input.stage)) throw new Error('Unknown translation checkpoint');
          for (const relative of TRANSLATION_FILES[input.stage]!) await retain(relative);
          // The original cache contains only validated business model results.
          for (const step of TRANSLATION_MODEL_STEPS) {
            const relative = `output/gpt_log/${step}.json`;
            try { await stat(path.join(workspace, relative)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
            await retain(relative);
          }
          stage.step = input.stage; stage.completedSteps.push(input.stage);
          await this.checkpoint(project, task); return { saved: true };
        } });
      stage.state = 'completed'; delete stage.runtimeJobId; project.state = 'transcribed';
      await this.checkpoint(project, task);
    } catch (error) {
      if (task.epoch === this.epoch) {
        stage.state = task.abort.signal.aborted ? 'canceled' : 'failed';
        if (!task.abort.signal.aborted) { stage.error = errorText(error); stage.failure = extractNimiErrorFields(error); }
        project.state = 'transcribed'; await this.serial(() => this.save(project, task.epoch));
      }
    } finally { if (workspace) await rm(workspace, { recursive: true, force: true }); }
  }

  private async recordMissingJob(project: VideoLingoProject, task: Activity, id: string): Promise<void> {
    project.invalidatedJobIds = [...new Set([...(project.invalidatedJobIds || []), id])];
    await this.checkpoint(project, task);
  }

  async dub(id: string, input: DubbingInput, owner?: string, runSettings?: BusinessSettings): Promise<VideoLingoProject> {
    this.assertOwner(id, owner);
    projectId(id);
    input = validateDubbingInput(id, input);
    return this.serial(async () => {
      this.assertOwner(id, owner);
      if (this.activities.has(id)) throw new Error('Wait for the current project task');
      const project = await this.get(id); this.assertEditable(project);
      if (!project.source || project.translation?.state !== 'completed') throw new Error('Complete subtitles first');
      await this.validSubtitleReview(project, input.burnSubtitles ? ['display', 'dubbing'] : ['dubbing']);
      if (project.separation?.state !== 'completed' || !project.separation.vocalsPath || !project.separation.backgroundPath) throw new Error('Complete source separation first');
      const speech = await this.selectionKey('audio.synthesize');
      const voice = input.voiceKind === 'reference' ? await this.selectionKey('voice.create') : '';
      const settings = validateBusinessSettings(runSettings || businessSettings(project));
      const { burnSubtitles: _burn, ...voiceInput } = input;
      const contextKey = createHash('sha256').update(JSON.stringify({ input: voiceInput, speech, voice, translation: subtitleKey(project), source: project.source.sha256,
        vocals: project.separation.vocalsPath, background: project.separation.backgroundPath })).digest('hex');
      const key = createHash('sha256').update(JSON.stringify({ contextKey, burnSubtitles: input.burnSubtitles,
        parameters: { speedMin: settings.speedMin, speedAccept: settings.speedAccept, speedMax: settings.speedMax,
          minSubtitleDuration: settings.minSubtitleDuration, minTrimDuration: settings.minTrimDuration, tolerance: settings.tolerance, ffmpegGpu: settings.ffmpegGpu } })).digest('hex');
      if (project.dubbing && project.dubbing.key !== key && project.dubbing.runtimeJobId) {
        try { const old = (await this.services.ai.scenarioJobs.get(project.dubbing.runtimeJobId)).job;
          if (!['completed', 'failed', 'canceled', 'timeout'].includes(old.status)) throw new Error('Stop the previous dubbing Job before changing settings');
        } catch (error) { if (!missing(error)) throw error; }
      }
      if (project.dubbing?.key !== key) {
        const cache = project.dubbing?.contextKey === contextKey ? project.dubbing : undefined;
        project.dubbing = { state: 'running', key, contextKey, input, jobs: { ...cache?.jobs }, voices: { ...cache?.voices }, audio: { ...cache?.audio }, files: {}, settings };
      }
      project.dubbingSettings = input;
      project.dubbing!.state = 'running'; delete project.dubbing!.error; delete project.dubbing!.failure;
      const task: Activity = { runId: randomUUID(), epoch: this.epoch, abort: new AbortController(), pause: false };
      project.state = 'dubbing'; project.runId = task.runId; this.activities.set(id, task);
      try { await this.save(project, task.epoch); } catch (error) { this.activities.delete(id); throw error; }
      task.done = this.runDubbing(project, task).catch(error => console.error('Dubbing cleanup failed:', errorText(error)))
        .finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  private async runDubbing(project: VideoLingoProject, task: Activity): Promise<void> {
    const stage = project.dubbing!;
    const prefix = `projects/${project.id}/dubbing/${stage.key}`;
    let workspace = '';
    try {
      workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-dubbing-'));
      await mkdir(path.join(workspace, 'output/audio'), { recursive: true });
      const source = path.join(workspace, 'output', `source.${project.source!.name.split('.').pop()!.toLowerCase()}`);
      await this.readAssetToFile(project.source!.assetPath, source, task.abort.signal);
      for (const [relative, assetPath] of Object.entries(subtitleFiles(project)).filter(([name]) => SUBTITLE_FILES.includes(name as typeof SUBTITLE_FILES[number]))) {
        if (!relative.startsWith('output/') || relative.includes('..') || !assetPath.startsWith(`projects/${project.id}/`)) throw new Error('Subtitle file belongs to another project');
        await this.readAssetToFile(assetPath, path.join(workspace, relative), task.abort.signal);
      }
      await this.readAssetToFile(project.separation!.vocalsPath!, path.join(workspace, 'output/audio/vocal.wav'), task.abort.signal);
      await this.readAssetToFile(project.separation!.backgroundPath!, path.join(workspace, 'output/audio/background.wav'), task.abort.signal);
      let referencePath: string | undefined;
      if (stage.input.referenceMode === 'provided') {
        const asset = await this.services.storage.assets.stat(stage.input.referenceAssetPath!);
        if (asset.sizeBytes <= 0 || asset.sizeBytes > 20 * 1024 ** 2) throw new Error('Reference must be at most 20 MiB');
        referencePath = path.join(workspace, 'reference' + path.extname(stage.input.referenceAssetPath!));
        await this.readAssetToFile(stage.input.referenceAssetPath!, referencePath, task.abort.signal);
      }
      const model = new ModelOperations(this.services, { workspace, assetPrefix: `${prefix}/speech`, signal: task.abort.signal, guard: () => this.guard(task.epoch),
        onJob: async (id, kind) => { stage.runtimeJobId = id; task.runtimeJobId = id; stage.step = kind; await this.checkpoint(project, task); },
        onVoice: async () => this.checkpoint(project, task), onMissingJob: id => this.recordMissingJob(project, task, id),
        speechCache: stage, saveSpeechCache: () => this.checkpoint(project, task) });
      const result = await runMediaWorker<{ files: string[]; durationSeconds: number }>(this.appRoot, {
        operation: 'dub-video', workspace, source, mediaKind: project.source!.mediaType.startsWith('audio/') ? 'audio' : 'video',
        sourceLanguage: sourceLanguageFor(project), detectedLanguage: project.detectedLanguage, targetLanguage: project.translation!.input.targetLanguage, burnSubtitles: stage.input.burnSubtitles,
        businessSettings: pythonBusinessSettings(stage.settings || DEFAULT_BUSINESS_SETTINGS),
        voice: { language: stage.input.language || '', voice_kind: stage.input.voiceKind, voice_id: stage.input.voiceId || '',
          ...(stage.input.voiceKind === 'reference' ? { reference_mode: stage.input.referenceMode, reference_path: referencePath, reference_text: stage.input.referenceText || '' } : {}) },
      }, task.abort.signal, this.packaged, { ...model.handlers([], true), checkpoint: async input => {
        if (!['audio-tasks', 'speech'].includes(String(input.stage))) throw new Error('Invalid dubbing step');
        stage.step = String(input.stage); await this.checkpoint(project, task); return { saved: true };
      } });
      for (const relative of result.files) {
        if (!['output/dub.mp3', 'output/dub.srt', 'output/dub_with_background.wav', 'output/audio/tts_tasks.xlsx', 'output/output_dub.mp4'].includes(relative)) throw new Error('Unexpected dubbing output');
        const destination = `${prefix}/${relative}`;
        const mediaType = relative.endsWith('.mp4') ? 'video/mp4' : relative.endsWith('.mp3') ? 'audio/mpeg' : relative.endsWith('.wav') ? 'audio/wav' : relative.endsWith('.srt') ? 'text/plain' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        await this.importFile(workspace, path.join(workspace, relative), destination, mediaType, task.epoch);
        stage.files[relative] = destination;
      }
      stage.durationSeconds = result.durationSeconds; stage.state = 'completed'; delete stage.runtimeJobId; project.state = 'transcribed';
      await this.checkpoint(project, task);
    } catch (error) {
      if (task.epoch === this.epoch) {
        stage.state = task.abort.signal.aborted ? 'canceled' : 'failed';
        if (!task.abort.signal.aborted) { stage.error = errorText(error); stage.failure = extractNimiErrorFields(error); }
        project.state = 'transcribed'; await this.serial(() => this.save(project, task.epoch));
      }
    } finally { if (workspace) await rm(workspace, { recursive: true, force: true }); }
  }

  async preview(id: string, input: PreviewInput): Promise<VideoLingoProject> {
    this.assertOwner(id);
    projectId(id);
    if (!input || !['translation', 'voice'].includes(input.kind) || typeof input.text !== 'string' || !input.text.trim()
      || input.text.length > (input.kind === 'translation' ? 600 : 2000)) throw new Error('Enter valid preview text');
    if (input.kind === 'translation' && (typeof input.targetLanguage !== 'string' || !input.targetLanguage.trim() || input.targetLanguage.length > 80)) throw new Error('Choose a translation target language');
    if (input.referenceAssetPath && !input.referenceAssetPath.startsWith(`projects/${id}/voice-reference/`)) throw new Error('The voice reference belongs to another project');
    return this.serial(async () => {
      this.assertOwner(id, undefined);
      if (this.activities.has(id)) throw new Error('Wait for the current project task');
      const project = await this.get(id); this.assertEditable(project);
      if (project.runtimeJobId || project.separation?.runtimeJobId) throw new Error('Resume or stop the existing project Job before a preview');
      if (project.preview?.runtimeJobId) {
        const previous = (await this.services.ai.scenarioJobs.get(project.preview.runtimeJobId)).job;
        if (!['completed', 'failed', 'canceled', 'timeout'].includes(previous.status)) throw new Error('Stop the previous preview Job before starting another preview');
      }
      const selectionKey = await this.selectionKey(input.kind === 'translation' ? 'text.generate' : 'audio.synthesize');
      if (input.kind === 'voice' && input.voiceKind === 'reference') {
        if (!input.referenceAssetPath) throw new Error('Choose a reference audio file');
        await this.selectionKey('voice.create');
      }
      const task: Activity = { runId: randomUUID(), epoch: this.epoch, abort: new AbortController(), pause: false };
      project.preview = { kind: input.kind, state: 'running', input };
      project.runId = task.runId; project.state = input.kind === 'translation' ? 'translating-preview' : 'voice-preview';
      this.activities.set(id, task);
      try { await this.save(project, task.epoch); } catch (error) { this.activities.delete(id); throw error; }
      task.done = this.runPreview(project, task, selectionKey).catch(error => console.error('Preview cleanup failed:', errorText(error)))
        .finally(() => { if (this.activities.get(id) === task) this.activities.delete(id); });
      return project;
    });
  }

  private async runPreview(project: VideoLingoProject, task: Activity, selectionKey: string): Promise<void> {
    const preview = project.preview!;
    const input = preview.input;
    const restore = () => { project.state = project.transcript ? 'transcribed' : project.wordCount === 0 ? 'no-speech' : project.source ? 'ready' : 'empty'; };
    let workspace = '';
    try {
      workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-preview-'));
      const prefix = `projects/${project.id}/previews/${task.runId}`;
      const model = new ModelOperations(this.services, { workspace, assetPrefix: prefix, signal: task.abort.signal,
        guard: () => this.guard(task.epoch),
        onJob: async (id, kind) => { task.runtimeJobId = id; preview.runtimeJobId = id; preview.step = kind; await this.checkpoint(project, task); },
        onVoice: async id => { preview.voiceAssetId = id; await this.checkpoint(project, task); } });
      let referencePath: string | undefined;
      if (input.kind === 'voice' && input.voiceKind === 'reference') {
        const reference = await this.services.storage.assets.stat(input.referenceAssetPath!);
        if (reference.sizeBytes > 20 * 1024 ** 2 || reference.sizeBytes <= 0) throw new Error('Reference audio must be non-empty and at most 20 MiB');
        const extension = path.extname(input.referenceAssetPath!).toLowerCase();
        if (!['.wav', '.mp3'].includes(extension)) throw new Error('Use WAV or MP3 reference audio');
        referencePath = path.join(workspace, `reference${extension}`);
        await this.readAssetToFile(input.referenceAssetPath!, referencePath, task.abort.signal);
      }
      const request = { operation: input.kind === 'translation' ? 'translate-preview' : 'voice-preview', workspace,
        text: input.text, targetLanguage: input.targetLanguage, sourceLanguage: input.sourceLanguage || sourceLanguageFor(project) || 'en', detectedLanguage: project.detectedLanguage,
        reflect: input.reflect !== false, selectionKey, referenceText: input.referenceText || '',
        voice: { language: input.language || '', voice_kind: input.voiceKind === 'reference' ? 'default' : input.voiceKind || 'default',
          voice_id: input.voiceId || '', ...(referencePath ? { reference_mode: 'provided', reference_path: referencePath, reference_text: input.referenceText || '' } : {}) } };
      const result = await runMediaWorker<{ file: string; translation?: string; durationSeconds?: number; sampleRateHz?: number; channels?: number }>(this.appRoot, request, task.abort.signal, this.packaged,
        model.handlers(input.kind === 'translation' ? ['translate_faithfulness', 'translate_expressiveness'] : [], input.kind === 'voice'));
      if (input.kind === 'translation') {
        preview.resultPath = `${prefix}/translation-preview.json`;
        await this.importFile(workspace, result.file, preview.resultPath, 'application/json', task.epoch);
        preview.text = result.translation;
      } else {
        const audio = model.receivedAudio.at(-1);
        if (!audio || !result.durationSeconds || result.durationSeconds <= 0) throw new Error('Voice preview did not produce playable audio');
        preview.audioPath = audio.assetPath; preview.durationSeconds = result.durationSeconds;
        preview.sampleRateHz = result.sampleRateHz; preview.channels = result.channels;
      }
      preview.state = 'completed'; delete preview.runtimeJobId; restore();
      await this.checkpoint(project, task);
    } catch (error) {
      if (task.epoch === this.epoch) {
        preview.state = task.abort.signal.aborted ? 'canceled' : 'failed';
        if (task.abort.signal.aborted) delete preview.error; else { preview.error = errorText(error); preview.failure = extractNimiErrorFields(error); }
        restore();
        try { await this.serial(() => this.save(project, task.epoch)); } catch { /* No writes through a lost session. */ }
      }
    } finally { if (workspace) await rm(workspace, { recursive: true, force: true }); }
  }

  private async readAssetToFile(assetPath: string, filename: string, signal: AbortSignal): Promise<void> {
    const value = await this.services.storage.assets.read({ relativePath: assetPath });
    await pipeline(Readable.from(value.body), createWriteStream(filename, { flags: 'wx' }), { signal });
    if ((await stat(filename)).size !== value.range.length) throw new Error('A media stream ended before all bytes were received');
  }

  private async importFile(workspace: string, filename: string, relativePath: string, mediaType: string, epoch: number, signal?: AbortSignal): Promise<void> {
    const actual = await realpath(filename);
    const relative = path.relative(workspace, actual);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Media output escaped its task directory');
    this.guard(epoch);
    await this.services.storage.assets.write({ relativePath, body: createReadStream(actual, { signal }), mediaType, overwrite: true });
    this.guard(epoch);
  }

  private async prepareChunks(project: VideoLingoProject, task: Activity, workspace: string, settings: BusinessSettings): Promise<AudioChunk[]> {
    if (project.chunks.length) return project.chunks;
    const source = path.join(workspace, `source.${project.source!.name.split('.').pop()!.toLowerCase()}`);
    await this.readAssetToFile(project.source!.assetPath, source, task.abort.signal);
    let vocals: string | undefined;
    if (project.transcriptionSource?.vocalPath) {
      vocals = path.join(workspace, 'vocals.wav');
      await this.readAssetToFile(project.transcriptionSource.vocalPath, vocals, task.abort.signal);
    }
    const prepared = await runMediaWorker<Prepared>(this.appRoot, { operation: 'prepare', workspace, source, vocals,
      businessSettings: pythonBusinessSettings(settings) }, task.abort.signal, this.packaged);
    const chunks: AudioChunk[] = [];
    for (const [index, chunk] of prepared.chunks.entries()) {
      const assetPath = `projects/${project.id}/chunks/${index}.wav`;
      await this.importFile(workspace, chunk.file, assetPath, 'audio/wav', task.epoch);
      chunks.push({ assetPath, offsetSeconds: chunk.offsetSeconds, durationSeconds: chunk.durationSeconds });
    }
    project.chunks = chunks;
    await this.checkpoint(project, task);
    return chunks;
  }

  private async prepareSeparationChunks(project: VideoLingoProject, task: Activity, workspace: string): Promise<AudioChunk[]> {
    const stage = project.separation!;
    if (stage.chunks?.length) return stage.chunks;
    if (stage.pairs.length || stage.runtimeJobId) throw new Error('Separation input references are missing; preserve the saved Job and repair the local project record before resuming');
    const source = path.join(workspace, `source.${project.source!.name.split('.').pop()!.toLowerCase()}`);
    await this.readAssetToFile(project.source!.assetPath, source, task.abort.signal);
    const settings = businessSettings(project);
    const prepared = await runMediaWorker<Prepared>(this.appRoot, { operation: 'prepare', purpose: 'separation', workspace, source,
      businessSettings: pythonBusinessSettings(settings) }, task.abort.signal, this.packaged);
    const chunks: AudioChunk[] = [];
    for (const [index, chunk] of prepared.chunks.entries()) {
      const assetPath = `projects/${project.id}/separation/inputs/${task.runId}/${index}.wav`;
      await this.importFile(workspace, chunk.file, assetPath, 'audio/wav', task.epoch, task.abort.signal);
      chunks.push({ assetPath, offsetSeconds: chunk.offsetSeconds, durationSeconds: chunk.durationSeconds });
    }
    stage.chunks = chunks; stage.sourceSettings = { sourceHash: project.source!.sha256 };
    stage.inputFormat = { sampleRateHz: prepared.sampleRateHz, channels: prepared.channels };
    await this.checkpoint(project, task); return chunks;
  }

  private async run(project: VideoLingoProject, task: Activity, initialJob: NimiLocalAppScenarioJob | undefined, settings: BusinessSettings): Promise<void> {
    let workspace = '';
    let chunks = project.chunks;
    try {
      workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-task-'));
      chunks = await this.prepareChunks(project, task, workspace, settings);
      for (const [index, chunk] of chunks.entries()) {
        if (chunk.resultPath) continue;
        if (task.pause) { project.state = 'paused'; await this.checkpoint(project, task); return; }
        task.abort.signal.throwIfAborted();
        project.currentChunk = index;
        let job = initialJob || await this.mediaJob(project, 'transcribe', task.epoch);
        initialJob = undefined;
        if (!job || ['failed', 'canceled', 'timeout'].includes(job.status)) {
          if (await this.selectionKey('audio.transcribe') !== project.selectionKey) throw new Error('Speech configuration changed; resume to use the newly selected resource');
          const audio = await this.services.storage.assets.read({ relativePath: chunk.assetPath });
          const parts: Uint8Array[] = [];
          let length = 0;
          for await (const part of audio.body) { task.abort.signal.throwIfAborted(); parts.push(part); length += part.length; }
          if (length > 32 * 1024 ** 2) throw new Error('Prepared audio exceeds the Nimi upload bound');
          const bytes = Buffer.concat(parts);
          this.guard(task.epoch);
          task.abort.signal.throwIfAborted();
          job = (await this.services.ai.scenarioJobs.submit({ type: 'speech-transcribe', mimeType: 'audio/wav', language: project.languageHint,
            timestamps: true, prompt: '', responseFormat: '', audioSource: { type: 'bytes', bytes: [...bytes] } }, { timeoutMs: 300000 })).job;
          project.runtimeJobId = job.jobId;
        }
        task.runtimeJobId = job.jobId;
        project.state = 'transcribing';
        if (task.abort.signal.aborted) {
          await this.services.ai.scenarioJobs.cancel(job.jobId, 'videolingo-user-canceled');
          task.abort.signal.throwIfAborted();
        }
        await this.checkpoint(project, task);
        if (!['completed', 'failed', 'canceled', 'timeout'].includes(job.status)) {
          const subscription = await this.services.ai.scenarioJobs.subscribe(job.jobId);
          const abort = () => { void subscription.cancel(); };
          task.abort.signal.addEventListener('abort', abort, { once: true });
          try { for await (const event of subscription) { if (['completed', 'failed', 'canceled', 'timeout'].includes(event.job.status)) break; } }
          finally { task.abort.signal.removeEventListener('abort', abort); await subscription.cancel(); }
          job = (await this.services.ai.scenarioJobs.get(job.jobId)).job;
        }
        task.abort.signal.throwIfAborted();
        if (job.status !== 'completed' || !job.transcription) throw new Error(`${job.reasonCode}: ${job.reasonDetail || job.status}`);
        const resultPath = `projects/${project.id}/chunks/${index}.transcription.json`;
        this.guard(task.epoch);
        await this.services.storage.writeJson(resultPath, JSON.parse(JSON.stringify(job.transcription)));
        chunk.resultPath = resultPath;
        delete project.runtimeJobId; delete task.runtimeJobId;
        await this.checkpoint(project, task);
      }
      project.state = 'saving';
      await this.checkpoint(project, task);
      const results: { transcription: NimiLocalAppSpeechTranscript; offsetSeconds: number; durationSeconds: number }[] = [];
      for (const chunk of chunks) {
        const value = await this.services.storage.readJson(chunk.resultPath!);
        results.push({ transcription: value.value as unknown as NimiLocalAppSpeechTranscript, offsetSeconds: chunk.offsetSeconds, durationSeconds: chunk.durationSeconds });
      }
      const consumed = await runMediaWorker<Consumed>(this.appRoot, { operation: 'consume', workspace, chunks: results, sourceLanguageHint: project.languageHint }, task.abort.signal, this.packaged);
      const outputs: string[] = [];
      for (const file of consumed.files) {
        const relativePath = `projects/${project.id}/results/${path.basename(file)}`;
        await this.importFile(workspace, file, relativePath, path.extname(file) === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/plain', task.epoch);
        outputs.push(relativePath);
      }
      project.state = consumed.status; project.detectedLanguage = consumed.language; project.sourceLanguage = consumed.sourceLanguage; project.reportedLanguages = consumed.reportedLanguages; project.unreportedLanguageChunks = consumed.unreportedLanguageChunks; project.wordCount = consumed.wordCount;
      project.transcript = consumed.text.slice(0, 4000); project.transcriptTruncated = consumed.text.length > 4000;
      project.outputPaths = outputs; project.currentChunk = chunks.length;
      await this.checkpoint(project, task);
    } catch (error) {
      if (task.epoch === this.epoch) {
        project.state = task.abort.signal.aborted ? 'canceled' : 'failed';
        if (task.abort.signal.aborted) delete project.error;
        else project.error = errorText(error);
        try { await this.serial(() => this.save(project, task.epoch)); } catch { /* A lost session cannot commit this result. */ }
      }
    } finally {
      // workspace was created by mkdtemp above; no renderer-supplied path is removed.
      if (workspace) await rm(workspace, { recursive: true, force: true });
    }
  }

  private async runSeparation(project: VideoLingoProject, task: Activity, initialJob?: NimiLocalAppScenarioJob): Promise<void> {
    const stage = project.separation!;
    const restoreState = () => { project.state = project.transcript ? 'transcribed' : project.wordCount === 0 ? 'no-speech' : 'ready'; };
    let workspace = '';
    const localPairs = new Map<number, { vocals: string; background: string }>();
    const pendingAssets: string[] = [];
    try {
      workspace = await mkdtemp(path.join(tmpdir(), 'videolingo-separation-'));
      const chunks = await this.prepareSeparationChunks(project, task, workspace);
      for (const [index, chunk] of chunks.entries()) {
        if (stage.pairs[index]) continue;
        if (task.pause) { stage.state = 'paused'; restoreState(); await this.checkpoint(project, task); return; }
        task.abort.signal.throwIfAborted();
        stage.currentChunk = index;
        let job = initialJob || await this.mediaJob(project, 'separate', task.epoch);
        initialJob = undefined;
        if (!job || ['failed', 'canceled', 'timeout'].includes(job.status)) {
          if (await this.selectionKey('audio.separate') !== stage.selectionKey) throw new Error('Separation configuration changed; resume with the current resource');
          const input = await this.services.storage.assets.read({ relativePath: chunk.assetPath });
          const parts: Uint8Array[] = [];
          let length = 0;
          for await (const part of input.body) { task.abort.signal.throwIfAborted(); parts.push(part); length += part.length; }
          if (length > 32 * 1024 ** 2 || chunk.durationSeconds > 300) throw new Error('Prepared separation input exceeds the delivered Driver limits');
          this.guard(task.epoch); task.abort.signal.throwIfAborted();
          job = (await this.services.ai.scenarioJobs.submit({ type: 'audio-separate', mimeType: 'audio/wav',
            audioSource: { type: 'bytes', bytes: [...Buffer.concat(parts)] } }, { timeoutMs: 300000 })).job;
          stage.runtimeJobId = job.jobId;
        }
        task.runtimeJobId = job.jobId;
        if (task.abort.signal.aborted) {
          await this.services.ai.scenarioJobs.cancel(job.jobId, 'videolingo-user-canceled');
          task.abort.signal.throwIfAborted();
        }
        stage.state = 'running'; project.state = 'separating';
        await this.checkpoint(project, task);
        if (!['completed', 'failed', 'canceled', 'timeout'].includes(job.status)) {
          const subscription = await this.services.ai.scenarioJobs.subscribe(job.jobId);
          const abort = () => { void subscription.cancel(); };
          task.abort.signal.addEventListener('abort', abort, { once: true });
          try { for await (const event of subscription) { if (['completed', 'failed', 'canceled', 'timeout'].includes(event.job.status)) break; } }
          finally { task.abort.signal.removeEventListener('abort', abort); await subscription.cancel(); }
          job = (await this.services.ai.scenarioJobs.get(job.jobId)).job;
        }
        task.abort.signal.throwIfAborted();
        if (job.status !== 'completed' || job.scenarioType !== 'audio-separate') throw new Error(`${job.reasonCode}: ${job.reasonDetail || job.status}`);
        const roles = validateNimiLocalAppAudioSeparation(job.audioSeparation, job.artifacts);
        const vocals = job.artifacts.find(artifact => artifact.artifactId === roles.vocalsArtifactId)!;
        const background = job.artifacts.find(artifact => artifact.artifactId === roles.backgroundArtifactId)!;
        if (vocals.sampleRateHz <= 0 || vocals.channels <= 0 || vocals.sizeBytes <= 0 || background.sizeBytes <= 0
          || vocals.sampleRateHz !== background.sampleRateHz || vocals.channels !== background.channels) throw new Error('Separated audio has missing or inconsistent audio metadata');
        stage.state = 'receiving'; project.state = 'receiving';
        await this.checkpoint(project, task);
        const base = `projects/${project.id}/separation/chunks/${task.runId}/${index}`;
        const vocalsPath = `${base}/vocals.wav`, backgroundPath = `${base}/background.wav`;
        for (const [artifact, relativePath] of [[vocals, vocalsPath], [background, backgroundPath]] as const) {
          this.guard(task.epoch); task.abort.signal.throwIfAborted();
          const received = await this.services.storage.assets.adoptArtifact({ artifactId: artifact.artifactId, relativePath });
          pendingAssets.push(relativePath);
          if (received.sizeBytes !== artifact.sizeBytes) throw new Error('Adopted audio does not match the complete Job artifact');
        }
        const files = { vocals: path.join(workspace, `vocals-${index}.wav`), background: path.join(workspace, `background-${index}.wav`) };
        await this.readAssetToFile(vocalsPath, files.vocals, task.abort.signal);
        await this.readAssetToFile(backgroundPath, files.background, task.abort.signal);
        localPairs.set(index, files);
        stage.pairs[index] = { jobId: job.jobId, ...roles, vocalsPath, backgroundPath, sampleRateHz: vocals.sampleRateHz, channels: vocals.channels };
        stage.currentChunk = index + 1;
        delete stage.runtimeJobId; delete task.runtimeJobId;
        try { await this.checkpoint(project, task); }
        catch (error) {
          stage.pairs.splice(index, 1); stage.currentChunk = index; stage.runtimeJobId = job.jobId;
          throw error;
        }
        pendingAssets.length = 0;
      }
      if (task.pause) { stage.state = 'paused'; restoreState(); await this.checkpoint(project, task); return; }
      stage.state = 'receiving'; project.state = 'receiving';
      await this.checkpoint(project, task);
      const inputs = [];
      for (const [index, chunk] of chunks.entries()) {
        const pair = stage.pairs[index]!;
        let files = localPairs.get(index);
        if (!files) {
          files = { vocals: path.join(workspace, `vocals-${index}.wav`), background: path.join(workspace, `background-${index}.wav`) };
          await this.readAssetToFile(pair.vocalsPath, files.vocals, task.abort.signal);
          await this.readAssetToFile(pair.backgroundPath, files.background, task.abort.signal);
        }
        inputs.push({ ...files, offsetSeconds: chunk.offsetSeconds, durationSeconds: chunk.durationSeconds, sampleRateHz: pair.sampleRateHz, channels: pair.channels });
      }
      const output = await runMediaWorker<AssembledSeparation>(this.appRoot, { operation: 'assemble-separation', workspace, chunks: inputs }, task.abort.signal, this.packaged);
      const vocalsPath = `projects/${project.id}/separation/results/${task.runId}/vocals.wav`;
      const backgroundPath = `projects/${project.id}/separation/results/${task.runId}/background.wav`;
      for (const [file, relativePath] of [[output.vocalsFile, vocalsPath], [output.backgroundFile, backgroundPath]]) {
        await this.importFile(workspace, file!, relativePath!, 'audio/wav', task.epoch); pendingAssets.push(relativePath!);
      }
      stage.vocalsPath = vocalsPath; stage.backgroundPath = backgroundPath;
      stage.sampleRateHz = output.sampleRateHz; stage.channels = output.channels; stage.durationSeconds = output.durationSeconds;
      stage.state = 'completed'; restoreState();
      await this.checkpoint(project, task);
      pendingAssets.length = 0;
    } catch (error) {
      if (task.epoch === this.epoch) {
        for (const asset of pendingAssets) { try { await this.services.storage.assets.remove(asset); } catch { /* Preserve the original failure. */ } }
        stage.state = task.abort.signal.aborted ? 'canceled' : 'failed';
        if (task.abort.signal.aborted) delete stage.error; else stage.error = errorText(error);
        restoreState();
        try { await this.serial(() => this.save(project, task.epoch)); } catch { /* A lost session cannot commit. */ }
      }
    } finally {
      // Only the directory allocated for this operation is removed.
      if (workspace) await rm(workspace, { recursive: true, force: true });
    }
  }
}

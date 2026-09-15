import { validateDubbingInput } from './dubbing-settings.js';
import { randomUUID } from 'node:crypto';
import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import { extractNimiErrorFields } from '@nimiplatform/sdk/types';
import { errorText, projectId, sourceLanguageFor, type DubbingInput, type FailureDetails, type VideoLingoProject } from './project-types.js';
import type { Projects } from './projects.js';
import { subtitleFiles, subtitleKey } from './subtitles.js';
import { businessSettings, DEFAULT_BUSINESS_SETTINGS, translationSettings, validateBusinessSettings, type BusinessSettings } from './business-settings.js';

export type BatchStep = 'transcribe' | 'nlp' | 'translate' | 'subtitle-video' | 'separate' | 'dub';
export type BatchItemInput = { projectId: string; sourceLanguage: string; targetLanguage: string; dubbing?: DubbingInput; burnSubtitles: boolean; vocalEnhancement?: boolean; settings?: BusinessSettings };
export type BatchItem = BatchItemInput & { id: string; sourceHash: string; title: string; state: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  step: BatchStep; error?: string; failure?: FailureDetails; noSpeech?: boolean; outputs?: string[] };
export type Batch = { id: string; title: string; state: 'ready' | 'running' | 'paused' | 'canceled' | 'interrupted' | 'completed' | 'completed-with-errors'; purpose?: 'batch' | 'subtitles' | 'dubbing';
  createdAt: string; updatedAt: string; items: BatchItem[] };
type BatchHeader = Omit<Batch, 'items'> & { itemIds: string[] };
type ActiveBatch = { pause: boolean; epoch: number; currentProject?: string; stopped?: boolean; done?: Promise<void> };
type BatchProjects = Pick<Projects, 'get' | 'setWorkflow' | 'start' | 'splitNlp' | 'translate' | 'validateSubtitles' | 'renderSubtitles' | 'separate' | 'dub' | 'control' | 'settled' | 'claim' | 'release'>;

function sameVoice(a: DubbingInput, b: DubbingInput): boolean {
  return a.voiceKind === b.voiceKind && (a.voiceId || '') === (b.voiceId || '') && (a.language || '') === (b.language || '')
    && a.burnSubtitles === b.burnSubtitles && (a.voiceKind !== 'reference' || a.referenceMode === b.referenceMode
      && (a.referenceMode !== 'provided' || a.referenceAssetPath === b.referenceAssetPath && (a.referenceText || '') === (b.referenceText || '')));
}
function stageFailed(message: string, failure?: FailureDetails): never { throw Object.assign(new Error(message), failure || {}); }

export class Batches {
  private active?: { id: string; task: ActiveBatch };
  private epoch = 0;
  private mutation: Promise<unknown> = Promise.resolve();
  constructor(private storage: Pick<NimiLocalAppClient['storage'], 'readJson' | 'writeJson'>, private projects: BatchProjects) {}

  invalidate(): void { this.epoch++; if (this.active) this.projects.release(this.active.id); this.active = undefined; }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const next = this.mutation.then(fn, fn); this.mutation = next.catch(() => {}); return next; }
  private guard(epoch: number): void { if (epoch !== this.epoch) throw new Error('Batch session changed; explicitly resume after reconnecting'); }
  private async ids(): Promise<string[]> {
    try { const result = (await this.storage.readJson('batches/index.json')).value; if (!Array.isArray(result)) throw new Error('Invalid batch index'); return result.map(projectId); }
    catch (error) { const reason = (extractNimiErrorFields(error).reasonCode || '').toUpperCase().replaceAll('-', '_');
      if (reason === 'NOT_FOUND' || reason.endsWith('_STORAGE_ENTRY_NOT_FOUND') || reason.endsWith('_STORAGE_JSON_NOT_FOUND')) return []; throw error; }
  }
  async get(id: string): Promise<Batch> {
    projectId(id); const header = (await this.storage.readJson(`batches/${id}.json`)).value as unknown as BatchHeader;
    if (header.id !== id || !Array.isArray(header.itemIds)) throw new Error('Invalid batch record');
    const items: BatchItem[] = [];
    for (const itemId of header.itemIds) {
      projectId(itemId);
      const item = (await this.storage.readJson(`batches/${id}/items/${itemId}.json`)).value as unknown as BatchItem;
      if (item.id !== itemId) throw new Error('Invalid batch entry');
      items.push(item);
    }
    const { itemIds: _ids, ...fields } = header;
    const record: Batch = { ...fields, items };
    return record.state === 'running' && this.active?.id !== id ? { ...record, state: 'interrupted' } : record;
  }
  async list(): Promise<Batch[]> { const ids = await this.ids(); const records = []; for (const id of ids) records.push(await this.get(id)); return records; }
  private async save(record: Batch, epoch: number, changed?: BatchItem | 'all'): Promise<void> {
    this.guard(epoch); record.updatedAt = new Date().toISOString();
    // Keep entries separate from the order/status header: SDK JSON documents are bounded.
    for (const item of changed === 'all' ? record.items : changed ? [changed] : []) {
      await this.storage.writeJson(`batches/${record.id}/items/${item.id}.json`, JSON.parse(JSON.stringify(item))); this.guard(epoch);
    }
    const { items, ...header } = record;
    await this.storage.writeJson(`batches/${record.id}.json`, JSON.parse(JSON.stringify({ ...header, itemIds: items.map(item => item.id) }))); this.guard(epoch);
  }
  async create(title: string, inputs: BatchItemInput[], purpose: Batch['purpose'] = 'batch'): Promise<Batch> {
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 1000) throw new Error('Choose 1–1000 batch entries');
    if (new Set(inputs.map(item => item.projectId)).size !== inputs.length) throw new Error('Each batch entry requires its own project');
    return this.serial(async () => {
      const epoch = this.epoch, now = new Date().toISOString(); const items: BatchItem[] = [];
      for (let input of inputs) {
        projectId(input.projectId);
        if (!['', 'en', 'zh', 'ja', 'fr', 'de', 'it', 'ru', 'es'].includes(input.sourceLanguage)
          || typeof input.targetLanguage !== 'string' || !input.targetLanguage.trim() || input.targetLanguage.length > 80 || typeof input.burnSubtitles !== 'boolean') throw new Error('Invalid batch language or output settings');
        if (input.dubbing) input = { ...input, dubbing: validateDubbingInput(input.projectId, input.dubbing) };
        const project = await this.projects.get(input.projectId);
        if (project.archivedAt || project.cleanupPending) throw new Error('Restore the project and finish any pending cleanup before queueing it');
        if (!project.source) throw new Error('Import each batch source before creating the queue');
        const settings = validateBusinessSettings({ ...businessSettings(project), ...input.settings, sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage, burnSubtitles: input.burnSubtitles,
          vocalEnhancement: input.vocalEnhancement ?? input.settings?.vocalEnhancement ?? businessSettings(project).vocalEnhancement });
        items.push({ ...input, settings, vocalEnhancement: settings.vocalEnhancement, id: randomUUID(), sourceHash: project.source.sha256, title: project.title, state: 'queued', step: 'transcribe' });
      }
      const batch: Batch = { id: randomUUID(), title: title.trim().slice(0, 120) || 'Batch', purpose, state: 'ready', createdAt: now, updatedAt: now, items };
      const ids = await this.ids(); await this.save(batch, epoch, 'all'); await this.storage.writeJson('batches/index.json', [...ids, batch.id]);
      return batch;
    });
  }
  async runProject(id: string, purpose: 'subtitles' | 'dubbing', dubbing?: DubbingInput): Promise<Batch> {
    const project = await this.projects.get(projectId(id));
    if (project.archivedAt) throw new Error('Restore the archived project before processing');
    if (purpose === 'dubbing') {
      if (!dubbing) throw new Error('Choose a dubbing voice');
      dubbing = validateDubbingInput(id, dubbing);
      await this.projects.validateSubtitles(id);
    }
    const settings = businessSettings(project);
    const input: BatchItemInput = { projectId: id, sourceLanguage: settings.sourceLanguage, targetLanguage: settings.targetLanguage,
      burnSubtitles: purpose === 'subtitles' && settings.burnSubtitles && !project.source?.mediaType.startsWith('audio/'), vocalEnhancement: settings.vocalEnhancement, settings, ...(dubbing ? { dubbing } : {}) };
    if (project.workflowId) {
      const prior = await this.get(project.workflowId);
      const entry = prior.items[0];
      if (prior.purpose === purpose && prior.items.length === 1 && entry?.projectId === id && prior.state !== 'completed'
        && entry.sourceLanguage === input.sourceLanguage && entry.targetLanguage === input.targetLanguage
        && entry.burnSubtitles === input.burnSubtitles && !!entry.vocalEnhancement === !!input.vocalEnhancement
        && Object.entries(settings).every(([key, value]) => key === 'burnSubtitles' || entry.settings?.[key as keyof BusinessSettings] === value)
        && (!dubbing || entry.dubbing && sameVoice(entry.dubbing, dubbing))) return this.resume(prior.id);
    }
    const batch = await this.create(project.title, [input], purpose);
    await this.projects.setWorkflow(id, batch.id, dubbing);
    return this.resume(batch.id);
  }
  async resume(id: string): Promise<Batch> {
    return this.serial(async () => {
      if (this.active) throw new Error('Pause the running batch before continuing another');
      const batch = await this.get(id); const pending = batch.items.filter(item => item.state !== 'completed');
      if (!pending.length) return batch;
      for (const item of pending) {
        const project = await this.projects.get(item.projectId);
        if (project.archivedAt || project.cleanupPending) throw new Error('Restore the project and finish any pending cleanup before resuming');
      }
      this.projects.claim(pending.map(item => item.projectId), id);
      const task: ActiveBatch = { pause: false, epoch: this.epoch }; this.active = { id, task };
      batch.state = 'running';
      try { await this.save(batch, task.epoch); } catch (error) { this.projects.release(id); this.active = undefined; throw error; }
      task.done = this.run(batch, task).catch(error => console.error('Batch stopped:', errorText(error))).finally(() => {
        this.projects.release(id); if (this.active?.task === task) this.active = undefined;
      });
      return batch;
    });
  }
  async pause(id: string): Promise<Batch> {
    const current = this.active;
    if (!current || current.id !== id) return this.get(id);
    current.task.pause = true;
    if (current.task.currentProject) await this.projects.control(current.task.currentProject, 'cancel', id);
    if (current.task.done) await current.task.done;
    return this.get(id);
  }
  async stop(id: string): Promise<Batch> {
    if (this.active?.id === id) this.active.task.stopped = true;
    const result = await this.pause(id);
    if (result.state !== 'completed') { result.state = 'canceled'; await this.save(result, this.epoch); }
    return result;
  }
  async settled(id: string): Promise<Batch> { const current = this.active; if (current?.id === id) await current.task.done; return this.get(id); }
  private async finishStage(started: Promise<VideoLingoProject>, id: string, owner: string, task: ActiveBatch) {
    await started;
    if (task.pause) await this.projects.control(id, 'cancel', owner);
    return this.projects.settled(id);
  }

  private async run(batch: Batch, task: ActiveBatch): Promise<void> {
    for (const item of batch.items) {
      if (task.pause) break;
      if (item.state === 'completed') continue;
      this.guard(task.epoch); item.state = 'running'; delete item.error; delete item.failure; task.currentProject = item.projectId;
      await this.save(batch, task.epoch, item);
      try {
        let project = await this.projects.get(item.projectId);
        if (project.source?.sha256 !== item.sourceHash) throw new Error('The queued source changed; create a new batch entry');
        const settings = validateBusinessSettings({ ...businessSettings(project), ...item.settings, sourceLanguage: item.sourceLanguage, targetLanguage: item.targetLanguage });
        const steps: BatchStep[] = batch.purpose === 'dubbing' ? ['separate', 'dub']
          : [...(settings.vocalEnhancement ? ['separate' as const] : []), 'transcribe', 'nlp', 'translate', ...(item.burnSubtitles && !project.source?.mediaType.startsWith('audio/') ? ['subtitle-video' as const] : []), ...(item.dubbing ? ['separate' as const, 'dub' as const] : [])];
        for (const step of steps) {
          if (task.pause) break;
          this.guard(task.epoch); item.step = step; await this.save(batch, task.epoch, item);
          if (step === 'transcribe') {
            const inputChanged = !!project.transcriptionSource?.vocalPath !== settings.vocalEnhancement
              || settings.vocalEnhancement && project.transcriptionSource?.vocalPath !== project.separation?.vocalsPath
              || (project.transcriptionSource?.rawSampleRate || 32000) !== settings.rawSampleRate
              || (project.transcriptionSource?.rawBitrate || '128k') !== settings.rawBitrate;
            if (inputChanged || project.wordCount !== 0 && (!project.transcript || project.languageHint !== item.sourceLanguage)) {
              project = await this.finishStage(this.projects.start(item.projectId, item.sourceLanguage, batch.id, settings), item.projectId, batch.id, task);
            }
            if (task.pause) break;
            if (project.wordCount === 0) { item.noSpeech = true; break; }
            if (!project.transcript) throw new Error(project.error || 'Transcription did not complete');
          } else if (step === 'nlp') {
            if (project.nlp?.state !== 'completed') { project = await this.finishStage(this.projects.splitNlp(item.projectId, batch.id), item.projectId, batch.id, task); }
            if (!task.pause && project.nlp?.state !== 'completed') stageFailed(project.nlp?.error || 'Sentence splitting did not complete', project.nlp?.failure);
          } else if (step === 'translate') {
            if (project.translation?.state !== 'completed' || project.translation.input.targetLanguage !== item.targetLanguage
              || project.translation.input.reflect !== settings.reflect || (project.translation.input.customTermsAssetPath || '') !== (settings.customTermsAssetPath || '')
              || JSON.stringify(translationSettings(project.translation.settings || DEFAULT_BUSINESS_SETTINGS)) !== JSON.stringify(translationSettings(settings))) {
              project = await this.finishStage(this.projects.translate(item.projectId, { targetLanguage: item.targetLanguage, reflect: settings.reflect,
                ...(settings.customTermsAssetPath ? { customTermsAssetPath: settings.customTermsAssetPath } : {}) }, batch.id, settings), item.projectId, batch.id, task);
            }
            if (!task.pause && project.translation?.state !== 'completed') stageFailed(project.translation?.error || 'Translation did not complete', project.translation?.failure);
            if (!task.pause) await this.projects.validateSubtitles(item.projectId);
          } else if (step === 'subtitle-video') {
            if (!project.source?.mediaType.startsWith('audio/') && project.subtitleVideo?.translationKey !== subtitleKey(project)) {
              project = await this.finishStage(this.projects.renderSubtitles(item.projectId, batch.id, settings), item.projectId, batch.id, task);
              if (!task.pause && project.subtitleVideo?.translationKey !== subtitleKey(project)) throw new Error(project.error || 'Subtitle video did not complete');
            }
          } else if (step === 'separate') {
            if (project.separation?.state !== 'completed' || project.separation.sourceSettings?.sourceHash !== project.source?.sha256) {
              project = await this.finishStage(this.projects.separate(item.projectId, batch.id), item.projectId, batch.id, task);
            }
            if (!task.pause && project.separation?.state !== 'completed') throw new Error(project.separation?.error || 'Separation did not complete');
          } else {
            const timing = (settings = DEFAULT_BUSINESS_SETTINGS) => [settings.speedMin, settings.speedAccept, settings.speedMax, settings.minSubtitleDuration, settings.minTrimDuration, settings.tolerance];
            if (project.dubbing?.state !== 'completed' || !sameVoice(project.dubbing.input, item.dubbing!)
              || JSON.stringify(timing(project.dubbing.settings)) !== JSON.stringify(timing(settings))) {
              project = await this.finishStage(this.projects.dub(item.projectId, item.dubbing!, batch.id, settings), item.projectId, batch.id, task);
            }
            if (!task.pause && project.dubbing?.state !== 'completed') stageFailed(project.dubbing?.error || 'Dubbing did not complete', project.dubbing?.failure);
          }
        }
        item.state = task.pause ? 'paused' : 'completed';
        if (!task.pause) item.outputs = [...project.outputPaths,
          ...Object.entries({ ...project.translation?.files, ...subtitleFiles(project) }).filter(([name]) => !name.includes('/gpt_log/')).map(([, file]) => file),
          ...(project.subtitleVideo ? [project.subtitleVideo.assetPath] : []), ...Object.values(project.dubbing?.files || {})];
      } catch (error) {
        this.guard(task.epoch); item.state = task.pause ? 'paused' : 'failed';
        if (!task.pause) { item.error = errorText(error); item.failure = extractNimiErrorFields(error); }
      }
      await this.save(batch, task.epoch, item); task.currentProject = undefined;
    }
    batch.state = task.stopped ? 'canceled' : task.pause ? 'paused' : batch.items.some(item => item.state === 'failed') ? 'completed-with-errors' : 'completed';
    await this.save(batch, task.epoch);
  }
}

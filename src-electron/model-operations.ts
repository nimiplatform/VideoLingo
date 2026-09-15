import { createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { createNimiLocalAppTextModel } from '@nimiplatform/sdk/ai';
import { createNimiError } from '@nimiplatform/sdk/types';
import type { NimiLocalAppAIConsumptionClient, NimiLocalAppClient, NimiLocalAppScenarioJobSpec } from '@nimiplatform/sdk/app';
import type { WorkerModelHandlers } from './media-worker.js';

type Services = { ai: Pick<NimiLocalAppAIConsumptionClient, 'text' | 'scenarioJobs'>; storage: NimiLocalAppClient['storage'] };
export type ModelOperationContext = {
  workspace: string; assetPrefix: string; signal: AbortSignal; guard: () => void;
  onJob: (id: string, kind: string) => Promise<void>;
  onVoice: (id: string) => Promise<void>;
  onMissingJob?: (id: string) => Promise<void>;
  speechCache?: { jobs: Record<string, string>; voices: Record<string, string>; audio: Record<string, { assetPath: string; jobId: string }> };
  saveSpeechCache?: () => Promise<void>;
};

export class ModelOperations {
  private voices = new Map<string, string>();
  private voicePromises = new Map<string, Promise<string>>();
  private speechQueue: Promise<unknown> = Promise.resolve();
  readonly receivedAudio: { assetPath: string; filename: string; jobId: string }[] = [];
  constructor(private services: Services, private context: ModelOperationContext) {}

  handlers(steps: readonly string[], speech = false): WorkerModelHandlers {
    return { ...(steps.length ? { text: (input: Record<string, unknown>) => this.text(input, steps) } : {}),
      ...(speech ? { speech: (input: Record<string, unknown>) => {
        const operation = this.speechQueue.then(() => { this.context.signal.throwIfAborted(); return this.speech(input); });
        this.speechQueue = operation; return operation;
      } } : {}) };
  }

  private async text(input: Record<string, unknown>, steps: readonly string[]) {
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 1000000
      || typeof input.step !== 'string' || !steps.includes(input.step) || !['json', 'text'].includes(String(input.responseType))) {
      throw new Error('The worker requested an invalid translation model step');
    }
    this.context.guard(); this.context.signal.throwIfAborted();
    const result = await createNimiLocalAppTextModel(this.services.ai).generateText({
      messages: [{ role: 'user', content: [{ type: 'text', text: input.prompt }] }],
      responseFormat: { type: input.responseType === 'json' ? 'json-object' : 'text' }, signal: this.context.signal,
    });
    this.context.guard(); this.context.signal.throwIfAborted();
    if (result.finishReason !== 'stop' || result.toolCalls?.length || !result.text.trim()) {
      throw new Error(`Translation did not finish with complete text (${result.finishReason})`);
    }
    return { text: result.text, finishReason: result.finishReason };
  }

  private async job(spec: NimiLocalAppScenarioJobSpec, existingId?: string, remember?: (id: string) => Promise<void>, forget?: () => Promise<void>) {
    const { signal, guard } = this.context;
    guard(); signal.throwIfAborted();
    let existing;
    if (existingId) {
      try { existing = (await this.services.ai.scenarioJobs.get(existingId)).job; }
      catch (error) {
        const fields = error as { reasonCode?: string; code?: string };
        if ((fields.reasonCode || fields.code || '').toUpperCase().replaceAll('-', '_') !== 'NOT_FOUND') throw error;
        if (forget) await forget(); else await this.context.onMissingJob?.(existingId);
      }
    }
    guard(); signal.throwIfAborted();
    let job = existing && !['failed', 'canceled', 'timeout'].includes(existing.status)
      ? existing : (await this.services.ai.scenarioJobs.submit(spec, { timeoutMs: 300000 })).job;
    const abort = () => { void this.services.ai.scenarioJobs.cancel(job.jobId, 'videolingo-user-canceled').catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) { abort(); signal.throwIfAborted(); }
      if (remember) await remember(job.jobId);
      await this.context.onJob(job.jobId, spec.type);
      signal.throwIfAborted();
      if (!['completed', 'failed', 'canceled', 'timeout'].includes(job.status)) {
        const subscription = await this.services.ai.scenarioJobs.subscribe(job.jobId);
        const stopReading = () => { void subscription.cancel(); };
        signal.addEventListener('abort', stopReading, { once: true });
        if (signal.aborted) stopReading();
        try { for await (const event of subscription) { if (['completed', 'failed', 'canceled', 'timeout'].includes(event.job.status)) break; } }
        finally { signal.removeEventListener('abort', stopReading); await subscription.cancel(); }
      }
      guard(); signal.throwIfAborted();
      const result = await this.services.ai.scenarioJobs.get(job.jobId);
      job = result.job;
      if (job.status !== 'completed') throw createNimiError({ message: job.reasonDetail || job.status, reasonCode: job.reasonCode || 'AI_JOB_FAILED', traceId: job.traceId, retryable: false });
      return result;
    } catch (error) {
      if (!['completed', 'failed', 'canceled', 'timeout'].includes(job.status)) {
        await this.services.ai.scenarioJobs.cancel(job.jobId, 'videolingo-consumer-stopped').catch(() => {});
      }
      throw error;
    } finally { signal.removeEventListener('abort', abort); }
  }

  annotationHandler(jobs: Record<string, string>, remember: () => Promise<void>): WorkerModelHandlers {
    return { annotate: async input => {
      if (typeof input.language !== 'string' || !Array.isArray(input.texts) || !input.texts.length
        || input.texts.length > 64 || input.texts.some(text => typeof text !== 'string')
        || Buffer.byteLength(input.texts.join(''), 'utf8') > 512 * 1024) throw new Error('Invalid language analysis batch');
      const spec = { type: 'text-annotate' as const, language: input.language, texts: input.texts as string[] };
      const key = createHash('sha256').update(JSON.stringify(spec)).digest('hex');
      const existingId = jobs[key];
      const result = await this.job(spec, existingId, async id => { jobs[key] = id; await remember(); }, async () => {
        delete jobs[key];
        if (this.context.onMissingJob) await this.context.onMissingJob(existingId!); else await remember();
      });
      const annotation = result.job.textAnnotation;
      if (!annotation || annotation.documents.length !== spec.texts.length
        || annotation.documents.some((doc, index) => doc.text !== spec.texts[index] || doc.language !== spec.language)) {
        throw new Error('Language analysis did not return the complete original batch');
      }
      return annotation;
    } };
  }

  private async voice(referencePath: string, text: string, language: string): Promise<string> {
    const actual = await realpath(referencePath);
    const relative = path.relative(this.context.workspace, actual);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Voice reference escaped the project task directory');
    const bytes = await readFile(actual);
    if (!bytes.length || bytes.length > 20 * 1024 ** 2) throw new Error('Voice reference must be a non-empty audio file up to 20 MiB');
    const key = createHash('sha256').update(bytes).update(text).update(language).digest('hex');
    const cached = this.voices.get(key) || this.context.speechCache?.voices[key];
    if (cached) return cached;
    const pending = this.voicePromises.get(key);
    if (pending) return pending;
    const operation = (async () => {
    const result = await this.cachedSpeechJob(`voice-${key}`, { type: 'voice-create', creationSource: 'reference-audio', referenceAudio: { type: 'bytes', bytes: [...bytes] },
      referenceAudioMime: path.extname(actual).toLowerCase() === '.mp3' ? 'audio/mpeg' : 'audio/wav', languageHints: language ? [language] : [], preferredName: 'VideoLingo reference', text });
    if (!result.asset || result.asset.status !== 'active' || !result.voiceReference || result.voiceReference.voiceAssetId !== result.asset.voiceAssetId) {
      throw new Error('Voice creation did not return its active VoiceAsset');
    }
    this.voices.set(key, result.asset.voiceAssetId);
    if (this.context.speechCache) this.context.speechCache.voices[key] = result.asset.voiceAssetId;
    await this.context.saveSpeechCache?.();
    await this.context.onVoice(result.asset.voiceAssetId);
    return result.asset.voiceAssetId;
    })();
    this.voicePromises.set(key, operation);
    try { return await operation; } finally { this.voicePromises.delete(key); }
  }

  private async cachedSpeechJob(key: string, spec: NimiLocalAppScenarioJobSpec) {
    const cache = this.context.speechCache;
    const previous = cache?.jobs[key];
    return this.job(spec, previous, async id => { if (cache) cache.jobs[key] = id; await this.context.saveSpeechCache?.(); }, async () => {
      if (cache) delete cache.jobs[key];
      await this.context.onMissingJob?.(previous!); await this.context.saveSpeechCache?.();
    });
  }

  private async speech(input: Record<string, unknown>) {
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000 || typeof input.outputPath !== 'string') throw new Error('Invalid speech task');
    const filename = path.resolve(input.outputPath);
    const relative = path.relative(this.context.workspace, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Speech output escaped the project task directory');
    const language = typeof input.language === 'string' ? input.language : '';
    let voiceRef: { type: 'preset' | 'voice-asset'; id: string } | null = null;
    if (typeof input.referencePath === 'string') {
      voiceRef = { type: 'voice-asset', id: await this.voice(input.referencePath, String(input.referenceText || ''), language) };
    } else if (input.voiceKind === 'preset' || input.voiceKind === 'asset') {
      if (typeof input.voiceId !== 'string' || !input.voiceId.trim()) throw new Error('Choose a valid preset or VoiceAsset');
      voiceRef = { type: input.voiceKind === 'preset' ? 'preset' : 'voice-asset', id: input.voiceId };
    } else if (input.voiceKind !== 'default') throw new Error('Unsupported voice selection');
    const spec = { type: 'speech-synthesize' as const, text: input.text, language, audioFormat: 'wav', emotion: '',
      timingMode: 'none' as const, voiceRenderHints: null, voiceRef };
    const key = createHash('sha256').update(JSON.stringify(spec)).digest('hex');
    const cached = this.context.speechCache?.audio[key];
    if (cached) {
      const saved = await this.services.storage.assets.read({ relativePath: cached.assetPath });
      await mkdir(path.dirname(filename), { recursive: true });
      await pipeline(Readable.from(saved.body), createWriteStream(filename, { flags: 'wx' }), { signal: this.context.signal });
      if ((await stat(filename)).size !== saved.range.length) throw new Error('Cached speech stream is incomplete');
      return { outputPath: filename, jobId: cached.jobId };
    }
    const result = await this.cachedSpeechJob(`speech-${key}`, spec);
    const audio = result.job.artifacts.filter(artifact => artifact.mimeType.startsWith('audio/'));
    if (audio.length !== 1 || audio[0]!.sizeBytes <= 0) throw new Error('Speech synthesis did not return one complete audio artifact');
    const artifact = audio[0]!;
    const assetPath = `${this.context.assetPrefix}/${key}.wav`;
    this.context.guard(); this.context.signal.throwIfAborted();
    const adopted = await this.services.storage.assets.adoptArtifact({ artifactId: artifact.artifactId, relativePath: assetPath });
    if (adopted.sizeBytes !== artifact.sizeBytes) throw new Error('Speech artifact was not fully adopted');
    const received = await this.services.storage.assets.read({ relativePath: assetPath });
    await mkdir(path.dirname(filename), { recursive: true });
    await pipeline(Readable.from(received.body), createWriteStream(filename, { flags: 'wx' }), { signal: this.context.signal });
    if ((await stat(filename)).size !== artifact.sizeBytes) throw new Error('Speech audio stream ended before all bytes were received');
    this.context.guard(); this.context.signal.throwIfAborted();
    this.receivedAudio.push({ assetPath, filename, jobId: result.job.jobId });
    if (this.context.speechCache) this.context.speechCache.audio[key] = { assetPath, jobId: result.job.jobId };
    await this.context.saveSpeechCache?.();
    return { outputPath: filename, jobId: result.job.jobId };
  }
}

import { translator } from './localization.js';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createNimiClient } from '@nimiplatform/sdk';
import type { NimiAIConfigSnapshot } from '@nimiplatform/sdk/ai';
import { Button, StatusBadge, NimiThemeProvider, TooltipProvider } from '@nimiplatform/kit/ui';
import { ModelConfigAIConfigSurface } from '@nimiplatform/kit/features/model-config';
import { createNimiLocalAppStandardShellSurface, installNimiShellRuntimeBridge, invoke, openNimiLocalAppAssetMediaUrl } from '@nimiplatform/kit/shell/renderer/bridge';
import { errorText, isWorking, sourceAssetPath, sourceLanguageFor, type DubbingInput, type TaskSheetRow, type PreviewInput, type TranslationInput, type VideoLingoProject } from '../src-electron/project-types.js';
import { readStartupAccess } from './startup-access.js';
import { BatchPanel } from './batch-panel.js';
import { SubtitleReviewPanel } from './subtitle-review.js';
import { DownloadPanel } from './download-panel.js';
import { ProcessingSettings } from './processing-settings.js';
import { WorkflowStatus } from './workflow-status.js';
import { businessSettings, validateBusinessSettings, type BusinessSettings } from '../src-electron/business-settings.js';
import type { Batch } from '../src-electron/batches.js';
import { subtitleKey } from '../src-electron/subtitles.js';
import './styles.css';

installNimiShellRuntimeBridge();
const client = createNimiClient({ localApp: { standardShell: createNimiLocalAppStandardShellSurface() } });
const command = <T,>(name: string, payload: Record<string, unknown> = {}) => invoke(`videolingo.${name}`, payload) as Promise<T>;

function Config({ locale, capability }: { locale: string; capability: string }) {
  const [snapshot, setSnapshot] = useState<NimiAIConfigSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => { try { setSnapshot(await client.aiConfig.get()); setError(null); } catch (error) { setError(errorText(error)); } };
  useEffect(() => { void refresh(); }, []);
  return <ModelConfigAIConfigSurface context={{ owner: 'app-ai-config', appId: 'ai.nimi.videolingo' }}
    capabilityContracts={['audio.transcribe', 'audio.separate', 'text.annotate', 'text.generate', 'audio.synthesize', 'voice.create']} initialCapabilityContract={capability}
    capabilities={snapshot?.config?.capabilities ?? (snapshot ? null : undefined)} revision={snapshot?.revision}
    effectiveSelections={snapshot?.effectiveSelections} listOptions={query => client.aiConfig.listOptions(query)}
    loading={!snapshot && !error} loadError={error} onRetry={() => void refresh()} language={locale}
    onOverwrite={async input => { const result = await client.aiConfig.overwrite(input); await refresh(); return result; }} />;
}

function SeparationAudio({ assetPath, label }: { assetPath: string; label: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let handle: Awaited<ReturnType<typeof openNimiLocalAppAssetMediaUrl>> | undefined;
    void openNimiLocalAppAssetMediaUrl(assetPath).then(value => { handle = value; if (active) setUrl(value.url); else void value.revoke(); })
      .catch(error => { if (active) setError(errorText(error)); });
    return () => { active = false; if (handle) void handle.revoke(); };
  }, [assetPath]);
  return <div><strong>{label}</strong>{url && <audio controls src={url} aria-label={label} />}{error && <p role="alert">{error}</p>}</div>;
}

function DubbingPanel({ project, locale, disabled, run, configure, cancel, dub, download }: {
  project: VideoLingoProject; locale: string; disabled: boolean;
  run: (input: PreviewInput) => Promise<void>; configure: (capability: string) => void; cancel: () => Promise<void>;
  dub: (input: DubbingInput) => Promise<void>; download: (assetPath: string) => Promise<void>;
}) {
  const zh = locale.startsWith('zh');
  const t = translator(locale);
  const saved = project.dubbingSettings || project.dubbing?.input;
  const [text, setText] = useState('这是 VideoLingo 的配音预览。');
  const [voiceKind, setVoiceKind] = useState<DubbingInput['voiceKind']>(saved?.voiceKind || 'reference');
  const [voiceId, setVoiceId] = useState(saved?.voiceId || '');
  const [referencePath, setReferencePath] = useState(saved?.referenceAssetPath || '');
  const [referenceText, setReferenceText] = useState(saved?.referenceText || '');
  const [referenceMode, setReferenceMode] = useState<'first' | 'per-segment' | 'provided'>(saved?.referenceMode || 'first');
  const [burnSubtitles, setBurnSubtitles] = useState(saved?.burnSubtitles ?? true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [voiceRefresh, setVoiceRefresh] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [voices, setVoices] = useState<{ id: string; label: string; kind: 'preset' | 'asset' }[]>([]);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([voiceKind === 'preset' ? client.aiConfig.listOptions({ kind: 'preset-voices' }) : Promise.resolve(null),
      voiceKind === 'asset' ? client.ai.voiceAssets.list({ pageSize: 100 }) : Promise.resolve(null)]).then(([presets, assets]) => {
      if (!active) return;
      const values: { id: string; label: string; kind: 'preset' | 'asset' }[] = [];
      if (presets.status === 'fulfilled' && presets.value?.kind === 'preset-voices') for (const voice of presets.value.options) values.push({ id: voice.voiceId, label: voice.name, kind: 'preset' });
      if (assets.status === 'fulfilled' && assets.value) for (const voice of assets.value.assets.filter(item => item.status === 'active')) values.push({ id: voice.voiceAssetId, label: voice.voiceAssetId, kind: 'asset' });
      setVoices(values);
      setVoiceError([presets, assets].filter(result => result.status === 'rejected').map(result => errorText((result as PromiseRejectedResult).reason)).join('; '));
    });
    return () => { active = false; };
  }, [project.preview?.voiceAssetId, voiceRefresh, voiceKind]);
  const preview = project.preview;
  const previewWorking = ['translating-preview', 'voice-preview'].includes(project.state);
  return <section className="vl-section"><h3>{t('c. Dubbing', 'c. 配音')}</h3>
    <p>{t('Choose a voice, then generate the full dub. Vocal separation, audio tasks, speech and the final mix run in sequence.', '选择声音后开始整片配音。人声分离、配音任务、语音生成和最终合成依次自动执行。')}</p>
    <Button tone="secondary" onClick={() => configure('audio.synthesize')}>{t('Speech model settings', '语音模型设置')}</Button>
      <div className="vl-row"><select aria-label={t('Voice mode', '声音模式')} value={voiceKind} disabled={disabled} onChange={event => { setVoiceKind(event.target.value as typeof voiceKind); setVoiceId(''); }}>
        <option value="preset">{t('Preset voice', '预置声音')}</option>
        <option value="asset">{t('Existing VoiceAsset', '已有音色')}</option><option value="reference">{t('Create from reference', '从参考音频创建')}</option></select>
        {(voiceKind === 'preset' || voiceKind === 'asset') && <select aria-label={t('Voice', '音色')} value={voiceId} onChange={event => setVoiceId(event.target.value)}>
          <option value="">{t('Choose a voice', '选择音色')}</option>{voices.filter(voice => voice.kind === voiceKind).map(voice => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select>}
        <Button tone="secondary" onClick={() => setVoiceRefresh(value => value + 1)}>{t('Refresh voices', '刷新音色')}</Button></div>
      {voiceError && <p role="alert">{voiceError}</p>}
      {voiceKind === 'reference' && <>
        <p>{t('Reference creation and synthesis must both be configured for a compatible VoiceAsset.', '参考音色创建与语音合成均需配置，并支持相同 VoiceAsset。')}</p>
        <Button tone="secondary" onClick={() => configure('voice.create')}>{t('Configure voice creation', '配置音色创建')}</Button>
        <label>{t('Reference mode', '参考方式')} <select aria-label="dubbing-reference-mode" value={referenceMode} disabled={disabled} onChange={event => setReferenceMode(event.target.value as typeof referenceMode)}>
          <option value="first">{t('First source segment for all lines', '首段人声用于全部台词')}</option><option value="per-segment">{t('Each matching source segment', '逐段匹配人声')}</option><option value="provided">{t('Uploaded reference audio', '上传的参考音频')}</option></select></label>
        {referenceMode === 'provided' && <>
        <input aria-label={t('Voice reference audio', '声音参考音频')} type="file" accept=".wav,.mp3" disabled={disabled || uploading} onChange={event => {
          const file = event.target.files?.[0]; if (!file) return;
          setError(''); setUploading(true);
          void (async () => {
            if (!file.size || file.size > 20 * 1024 ** 2) throw new Error('Reference audio must be at most 20 MiB');
            const extension = file.name.split('.').pop()?.toLowerCase();
            if (!['wav', 'mp3'].includes(extension || '')) throw new Error('Use WAV or MP3 reference audio');
            const path = `projects/${project.id}/voice-reference/${crypto.randomUUID()}.${extension}`;
            await client.storage.assets.write({ relativePath: path, body: file, mediaType: extension === 'mp3' ? 'audio/mpeg' : 'audio/wav' }); setReferencePath(path);
          })().catch(error => setError(errorText(error))).finally(() => setUploading(false));
        }} />
        <input aria-label={t('Reference transcript', '参考音频原文')} value={referenceText} onChange={event => setReferenceText(event.target.value)} placeholder={t('Exact spoken reference text', '参考音频中实际说出的文字')} />
        </>}
      </>}
    <label><input type="checkbox" checked={burnSubtitles && !project.source?.mediaType.startsWith('audio/')} disabled={disabled || project.source?.mediaType.startsWith('audio/')} onChange={event => setBurnSubtitles(event.target.checked)} />{t('Burn translated subtitles into video', '烧录译文字幕')}</label>
    <div className="vl-row"><Button disabled={disabled || uploading || project.translation?.state !== 'completed' || (voiceKind !== 'reference' && !voiceId) || (voiceKind === 'reference' && referenceMode === 'provided' && !referencePath)} onClick={() => {
      void dub({ voiceKind, voiceId, ...(voiceKind === 'reference' ? { referenceMode, referenceAssetPath: referencePath || undefined, referenceText } : {}), burnSubtitles: burnSubtitles && !project.source?.mediaType.startsWith('audio/') });
    }}>{t('Start audio processing', '开始配音处理')}</Button></div>
    <details><summary>{t('Listen to a voice preview', '试听声音')}</summary>
    <textarea aria-label={t('Preview text', '预览文本')} value={text} disabled={disabled} onChange={event => setText(event.target.value)} rows={3} />
    {voiceKind === 'reference' && !referencePath && <p>{t('Upload a reference to preview separately, or use the source reference when starting full dubbing.', '单独试听需上传参考音频；整片配音可直接使用原片人声。')}</p>}
    <div className="vl-row"><Button disabled={disabled || uploading || !text.trim() || voiceKind === 'reference' && !referencePath} onClick={() => void run({ kind: 'voice', text,
      sourceLanguage: sourceLanguageFor(project) || 'en', reflect: true, language: '', voiceKind, voiceId, referenceAssetPath: referencePath || undefined, referenceText })}>
      {t('Generate voice preview', '生成声音预览')}</Button>
      <Button tone="secondary" disabled={!previewWorking && !(preview?.runtimeJobId && preview.state !== 'completed' && preview.state !== 'canceled')} onClick={() => void cancel()}>{t('Cancel preview', '取消预览')}</Button></div>
    {error && <p className="vl-error" role="alert">{error}</p>}
    {preview && <p role="status">{t('Preview', '预览')}：{({ running: t('Running', '运行中'), completed: t('Completed', '完成'), failed: t('Failed', '失败'), canceled: t('Canceled', '已取消'), interrupted: t('Interrupted', '已中断') })[preview.state]}</p>}
    {preview?.error && <p className="vl-error" role="alert">{preview.error}</p>}
    {preview?.voiceAssetId && <p>{t('Created VoiceAsset', '已创建音色')}：{preview.voiceAssetId}</p>}
    {preview?.state === 'completed' && preview.text && <textarea aria-label={t('Preview translation', '预览译文')} readOnly value={preview.text} rows={3} />}
    {preview?.state === 'completed' && preview.audioPath && <><p>{preview.durationSeconds?.toFixed(3)} s · {preview.sampleRateHz} Hz · {preview.channels} {t('channels', '声道')}</p><SeparationAudio assetPath={preview.audioPath} label={t('Voice preview', '声音预览')} /></>}
    </details>
      {project.dubbing && <p role="status">{t('Dubbing', '配音')}：{project.dubbing.state} · {project.dubbing.step} · {Object.keys(project.dubbing.audio).length} {t('received speech clips', '已接收音频段')}</p>}
      {project.dubbing?.error && <p className="vl-error" role="alert">{project.dubbing.error}</p>}
      {project.dubbing?.state === 'completed' && <>
        <SeparationAudio assetPath={project.dubbing.files['output/dub_with_background.wav']!} label={t('Dubbed audio with background', '配音与背景混合')} />
        {project.dubbing.files['output/output_dub.mp4'] && <DubbingVideo assetPath={project.dubbing.files['output/output_dub.mp4']!} />}
        <div className="vl-row">{Object.entries(project.dubbing.files).map(([name, assetPath]) => <Button key={name} tone="secondary" onClick={() => void download(assetPath)}>{name.split('/').pop()}</Button>)}</div>
      </>}
  </section>;
}

function DubbingVideo({ assetPath, label = 'Dubbed video' }: { assetPath: string; label?: string }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState('');
  useEffect(() => { let active = true; let handle: Awaited<ReturnType<typeof openNimiLocalAppAssetMediaUrl>> | undefined;
    void openNimiLocalAppAssetMediaUrl(assetPath).then(value => { handle = value; if (active) setUrl(value.url); else void value.revoke(); }).catch(error => setError(errorText(error)));
    return () => { active = false; if (handle) void handle.revoke(); };
  }, [assetPath]);
  return <>{url && <video src={url} controls aria-label={label} />}{error && <p role="alert">{error}</p>}</>;
}

function TranslationPanel({ project, locale, disabled, run, cancel, configure, download }: {
  project: VideoLingoProject; locale: string; disabled: boolean; run: (input: TranslationInput) => Promise<void>;
  cancel: () => Promise<void>; configure: () => void; download: (assetPath: string) => Promise<void>;
}) {
  const t = translator(locale);
  const [target, setTarget] = useState(project.translation?.input.targetLanguage || '简体中文');
  const [reflect, setReflect] = useState(project.translation?.input.reflect ?? true);
  const [terms, setTerms] = useState(project.translation?.input.customTermsAssetPath || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const stage = project.translation;
  return <section className="vl-section"><h3>{t('Translate and make subtitles', '翻译与制作字幕')}</h3>
    <label>{t('Translation target', '翻译目标语言')} <input aria-label="translation-target" value={target} disabled={disabled} onChange={event => setTarget(event.target.value)} /></label>
    <label><input type="checkbox" checked={reflect} disabled={disabled} onChange={event => setReflect(event.target.checked)} />{t('Reflect and polish the faithful translation', '在忠实翻译后反思润色')}</label>
    <p>{t('Optional terminology workbook: source, target and note columns. Otherwise the original bundled glossary is used.', '可选术语表：源文、译文、备注三列。未上传时使用原项目附带的术语表。')}</p>
    <input type="file" aria-label={t('Terminology workbook', '术语表')} accept=".xlsx" disabled={disabled || uploading} onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      setUploading(true); setError('');
      void (async () => {
        if (!file.size || file.size > 5 * 1024 ** 2 || !file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Choose an XLSX terminology workbook up to 5 MiB');
        const assetPath = `projects/${project.id}/terms/${crypto.randomUUID()}.xlsx`;
        await client.storage.assets.write({ relativePath: assetPath, body: file, mediaType: file.type }); setTerms(assetPath);
      })().catch(error => setError(errorText(error))).finally(() => setUploading(false));
    }} />
    <div className="vl-row"><Button disabled={disabled || uploading || project.nlp?.state !== 'completed'} onClick={() => void run({ targetLanguage: target, reflect, ...(terms ? { customTermsAssetPath: terms } : {}) })}>{t('Run or resume translation', '运行或恢复翻译')}</Button>
      <Button tone="secondary" onClick={configure}>{t('Translation model', '翻译模型配置')}</Button>
      <Button tone="secondary" disabled={project.state !== 'translating' && !stage?.runtimeJobId} onClick={() => void cancel()}>{t('Stop translation', '停止翻译')}</Button></div>
    {error && <p role="alert">{error}</p>}
    {stage && <p role="status">{t('Translation', '翻译')}：{stage.state} · {stage.completedSteps.length} / 5 · {stage.step || ''}</p>}
    {stage?.error && <p className="vl-error" role="alert">{stage.error}</p>}
    {stage?.files['output/gpt_log/error.json'] && <Button tone="secondary" onClick={() => void download(stage.files['output/gpt_log/error.json']!)}>{t('Export request error details', '导出请求错误详情')}</Button>}
    {stage?.files['output/gpt_log/stream-failure.json'] && <Button tone="secondary" onClick={() => void download(stage.files['output/gpt_log/stream-failure.json']!)}>{t('Export failed stream', '导出失败流详情')}</Button>}
    <div className="vl-row">{stage && Object.entries(stage.files).filter(([name]) => !name.includes('gpt_log') && !name.endsWith('.srt')).map(([name, assetPath]) => <Button tone="secondary" key={name} onClick={() => void download(assetPath)}>{name.split('/').pop()}</Button>)}</div>
  </section>;
}

function MediaPreview({ project, prepare, disabled }: { project: VideoLingoProject; prepare: () => Promise<void>; disabled: boolean }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const videoInput = !!project.source && ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm'].includes(project.source.name.split('.').pop()!.toLowerCase());
  const converted = project.mediaPreview?.sourceHash === project.source?.sha256 && project.mediaPreview?.state === 'completed';
  const needsConversion = videoInput && !['video/mp4', 'video/webm'].includes(project.source?.mediaType || '');
  const assetPath = converted ? project.mediaPreview?.assetPath : needsConversion ? undefined : project.source?.assetPath;
  useEffect(() => {
    let active = true;
    let handle: Awaited<ReturnType<typeof openNimiLocalAppAssetMediaUrl>> | undefined;
    setUrl(''); setError('');
    if (assetPath) void openNimiLocalAppAssetMediaUrl(assetPath).then(value => {
      handle = value;
      if (active) setUrl(value.url); else void value.revoke();
    }).catch(error => { if (active) setError(errorText(error)); });
    return () => { active = false; if (handle) void handle.revoke(); };
  }, [assetPath]);
  if (!project.source) return null;
  return <>
    {videoInput && (needsConversion || error) && !converted && <><p>Generate a compatible MP4 preview. The original remains the processing input.</p>
      <Button tone="secondary" disabled={disabled || project.mediaPreview?.state === 'preparing'} onClick={() => void prepare()}>Generate compatible preview</Button></>}
    {project.mediaPreview?.state === 'preparing' && <p role="status">Preparing preview…</p>}
    {project.mediaPreview?.error && <p className="vl-error" role="alert">Preview: {project.mediaPreview.error}</p>}
    {error && <p className="vl-error" role="alert">Preview: {error}</p>}
    {url && (videoInput ? <video controls src={url} aria-label={project.source.name} onError={() => setError('This browser cannot decode the video.')} />
      : <audio controls src={url} aria-label={project.source.name} />)}
  </>;
}

function Workspace({ locale }: { locale: string }) {
  const zh = locale.startsWith('zh');
  const t = translator(locale);
  const [projects, setProjects] = useState<VideoLingoProject[]>([]);
  const [project, setProject] = useState<VideoLingoProject | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<BusinessSettings | null>(null);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newResolution, setNewResolution] = useState('1080');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [bound, setBound] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [configCapability, setConfigCapability] = useState('audio.transcribe');
  const [languageHint, setLanguageHint] = useState('');
  const selectedId = useRef('');
  const uploadAbort = useRef<AbortController | null>(null);
  const accessRead = useRef<AbortController | null>(null);

  const choose = (value: VideoLingoProject | null) => {
    selectedId.current = value?.id || '';
    setProject(value); setSettingsDraft(value ? businessSettings(value) : null); setWorkflowRunning(false); setLanguageHint(value?.languageHint || ''); setError(''); setNotice('');
  };
  const load = async () => {
    accessRead.current?.abort();
    const read = new AbortController(); accessRead.current = read;
    setCheckingAccess(true); setError('');
    let authenticated = false;
    try {
      const status = await readStartupAccess(() => client.auth.status(), read.signal);
      read.signal.throwIfAborted();
      authenticated = status.sessionBound;
      setBound(status.sessionBound);
      if (!status.sessionBound) throw new Error(`${status.reasonCode}: ${status.actionHint}`);
      const values = await command<VideoLingoProject[]>('projects.list');
      read.signal.throwIfAborted();
      setProjects(values);
      choose(values.find(value => value.id === selectedId.current) || values.find(value => !value.archivedAt) || null);
    } catch (error) {
      if (read.signal.aborted) return;
      if (!authenticated) setBound(false);
      selectedId.current = ''; setProject(null); setProjects([]); setError(errorText(error));
    } finally { if (accessRead.current === read) setCheckingAccess(false); }
  };
  useEffect(() => { void load(); return () => { accessRead.current?.abort(); uploadAbort.current?.abort(); }; }, []);
  useEffect(() => {
    const id = project?.id;
    if (!id) return;
    let active = true;
    const timer = setInterval(() => {
      void command<VideoLingoProject>('project.get', { projectId: id }).then(value => {
        if (active && selectedId.current === id) {
          setProject(value);
          setProjects(previous => previous.map(item => item.id === id ? value : item));
        }
      }).catch(error => {
        if (active && selectedId.current === id) { selectedId.current = ''; setError(errorText(error)); setProject(null); setProjects([]); setBound(false); }
      });
    }, 1800);
    return () => { active = false; clearInterval(timer); };
  }, [project?.id]);

  const perform = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    if (!project) return;
    if (!file.size || file.size > 4 * 1024 ** 3) throw new Error(t('Choose a non-empty file up to 4 GB.', '请选择不超过 4 GB 的非空媒体文件。'));
    const id = project.id;
    const uploadId = crypto.randomUUID();
    const relativePath = sourceAssetPath(id, file.name, uploadId);
    const controller = new AbortController(); uploadAbort.current = controller;
    async function* body() {
      const reader = file.stream().getReader();
      try { while (true) { controller.signal.throwIfAborted(); const { value, done } = await reader.read(); if (done) break; yield value; } }
      finally { await reader.cancel(); }
    }
    await client.storage.assets.write({ relativePath, body: body(), mediaType: file.type || 'application/octet-stream' });
    controller.signal.throwIfAborted();
    const value = await command<VideoLingoProject>('project.attach-media', { projectId: id, name: file.name, uploadId });
    if (selectedId.current === id) choose(value);
    uploadAbort.current = null;
  };
  const importMediaFile = async (file: File) => {
        if (!file.size || file.size > 4 * 1024 ** 3) throw new Error('Choose a non-empty media file up to 4 GB');
        const project = await command<VideoLingoProject>('project.create', { title: file.name });
        const uploadId = crypto.randomUUID(); const relativePath = sourceAssetPath(project.id, file.name, uploadId);
        await client.storage.assets.write({ relativePath, body: (async function* () { const reader = file.stream().getReader(); try { while (true) { const part = await reader.read(); if (part.done) break; yield part.value; } } finally { await reader.cancel(); } })(), mediaType: file.type || 'application/octet-stream' });
        const attached = await command<VideoLingoProject>('project.attach-media', { projectId: project.id, name: file.name, uploadId });
        setProjects(previous => [attached, ...previous]); return attached;
  };
  const task = async (action: 'transcribe' | 'pause' | 'cancel') => {
    if (!project) return;
    const id = project.id;
    let value: VideoLingoProject;
    if (workflowRunning && project.workflowId && action !== 'transcribe') {
      await command(`batch.${action === 'pause' ? 'pause' : 'stop'}`, { batchId: project.workflowId });
      value = await command<VideoLingoProject>('project.get', { projectId: id });
    } else value = await command<VideoLingoProject>(`project.${action}`, { projectId: id, languageHint });
    if (selectedId.current === id) setProject(value);
    if (action === 'pause') setNotice(t('The task will pause after the current audio chunk finishes.', '当前音频片段完成后暂停。'));
    if (action === 'cancel') setNotice(t('Cancellation requested.', '已请求停止。'));
  };
  const download = async (assetPath: string) => {
    if (!project) return;
    const result = await command<{ canceled: boolean; bytes?: number }>('project.export', { projectId: project.id, assetPath });
    if (!result.canceled) setNotice(t('Export completed.', '导出完成。'));
  };
  const working = workflowRunning || (project ? isWorking(project.state) || project.mediaPreview?.state === 'preparing' : false);
  const editable = !!project && !project.archivedAt && !project.cleanupPending;
  const separationWorking = project ? ['separating', 'receiving'].includes(project.state) : false;
  const transcriptionWorking = project ? ['preparing', 'transcribing', 'saving'].includes(project.state) : false;
  const labels: Record<string, string> = zh
    ? { empty: '等待媒体', ready: '可以转写', preparing: '准备音频', transcribing: '正在转写', saving: '保存转写结果', paused: '已暂停', transcribed: '转写完成', 'no-speech': '未识别到语音', canceled: '已停止', failed: '处理失败', interrupted: '等待恢复' }
    : { empty: 'Waiting for media', ready: 'Ready to transcribe', preparing: 'Preparing audio', transcribing: 'Transcribing', saving: 'Saving transcription', paused: 'Paused', transcribed: 'Transcription complete', 'no-speech': 'No speech detected', canceled: 'Stopped', failed: 'Failed', interrupted: 'Ready to resume' };

  return <div className="vl-workspace">
    <div className="vl-row"><StatusBadge tone={bound ? 'success' : 'warning'}>{checkingAccess ? t('Connecting to Nimi…', '正在连接 Nimi…') : bound ? t('Nimi connected', 'Nimi 已连接') : t('Nimi access required', '需要 Nimi 访问')}</StatusBadge>
      <Button tone="secondary" onClick={() => setConfigOpen(!configOpen)}>{t('AI configuration', 'AI 配置')}</Button>
      <Button tone="secondary" disabled={checkingAccess} onClick={() => void load()}>{t('Refresh', '刷新')}</Button></div>
    {error && <div className="vl-error" role="alert">{error}</div>}
    {notice && <div className="vl-notice" role="status">{notice}</div>}
    {configOpen && <div className="vl-config"><Config key={configCapability} locale={locale} capability={configCapability} /></div>}
    <details><summary>{t('Batch processing', '批量处理')}</summary><BatchPanel locale={locale} bound={bound} command={command} projects={projects}
      selectProject={async id => { choose(await command<VideoLingoProject>('project.get', { projectId: id })); }}
      readSheet={async file => {
        if (!file.name.toLowerCase().endsWith('.xlsx') || !file.size || file.size > 5 * 1024 ** 2) throw new Error('Choose an XLSX task sheet up to 5 MiB');
        const assetPath = `batch-imports/${crypto.randomUUID()}.xlsx`;
        await client.storage.assets.write({ relativePath: assetPath, body: file, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        return command<{ rows: TaskSheetRow[] }>('batch.read-task-sheet', { assetPath });
      }}
      beginUrl={async url => {
        setNotice('');
        const created = await command<VideoLingoProject>('project.create', { title: url });
        const downloading = await command<VideoLingoProject>('project.download-url', { projectId: created.id, input: { url, resolution: '1080' } });
        setProjects(previous => [downloading, ...previous]); choose(downloading); return downloading;
      }}
      importFile={importMediaFile} /></details>
    <section className="vl-section">
      <h3>{t('Projects', '项目')}</h3>
      <label><input type="checkbox" checked={showArchived} disabled={busy} onChange={event => { setShowArchived(event.target.checked); choose(null); }} />{t('Archived history', '归档历史')}</label>
      <div className="vl-row"><select aria-label={t('Project', '项目')} value={selectedId.current} disabled={busy || !bound || workflowRunning}
        onChange={event => {
          const id = event.target.value;
          if (!id) { choose(null); return; }
          selectedId.current = id; setProject(null); setOpening(true);
          void perform(async () => {
            try { const value = await command<VideoLingoProject>('project.get', { projectId: id }); if (selectedId.current === id) choose(value); }
            finally { setOpening(false); }
          });
        }}>
        <option value="">{t('Choose a project', '选择项目')}</option>{projects.filter(item => !!item.archivedAt === showArchived).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select><input aria-label={t('New project name', '新项目名称')} placeholder={t('New project name', '新项目名称')} value={title} onChange={event => setTitle(event.target.value)} />
      <Button disabled={!bound || busy} onClick={() => void perform(async () => {
        const value = await command<VideoLingoProject>('project.create', { title });
        setProjects(previous => [value, ...previous]); choose(value); setTitle('');
      })}>{t('Create project', '创建项目')}</Button></div>
      <Button tone="secondary" disabled={busy || workflowRunning} onClick={() => { choose(null); setShowArchived(false); }}>{t('New media task', '新媒体任务')}</Button>
    </section>
    {!project && !opening && !showArchived && <section className="vl-section"><h3>{t('a. Download or upload media', 'a. 下载或上传媒体')}</h3>
      <input type="file" aria-label="new-media-file" accept=".mp4,.mov,.avi,.mkv,.flv,.wmv,.webm,.wav,.mp3,.flac,.m4a" disabled={busy || !bound} onChange={event => {
        const file = event.target.files?.[0]; if (file) void perform(async () => choose(await importMediaFile(file)));
      }} />
      <div className="vl-row"><input aria-label="new-media-url" value={newUrl} disabled={busy || !bound} placeholder="https://www.youtube.com/watch?v=…" onChange={event => setNewUrl(event.target.value)} />
        <select aria-label="new-media-resolution" value={newResolution} onChange={event => setNewResolution(event.target.value)}>{['360', '480', '720', '1080', 'best'].map(value => <option key={value}>{value}</option>)}</select>
        <Button disabled={busy || !bound || !newUrl.trim()} onClick={() => void perform(async () => {
          const created = await command<VideoLingoProject>('project.create', { title: newUrl.trim() });
          const value = await command<VideoLingoProject>('project.download-url', { projectId: created.id, input: { url: newUrl.trim(), resolution: newResolution } });
          setProjects(previous => [value, ...previous]); choose(value);
        })}>{t('Download video', '下载视频')}</Button></div>
    </section>}
    {opening && <p role="status">{t('Opening project…', '正在打开项目…')}</p>}
    {project && <>
      {project.cleanupPending && <p className="vl-error" role="alert">{project.error || t('Cleanup is incomplete. Retry it before processing.', '清理尚未完成，请先重试清理再处理。')}</p>}
      {project.archivedAt && <p className="vl-notice">{t('Archived: media and results are retained. Restore to process again.', '已归档：媒体与结果保留，恢复后可继续处理。')}</p>}
      <div className="vl-row"><Button tone="secondary" disabled={busy || working || !bound || !!project.cleanupPending} onClick={() => void perform(async () => {
        const value = await command<VideoLingoProject>('project.archive', { projectId: project.id, archived: !project.archivedAt });
        setProjects(previous => previous.map(item => item.id === value.id ? value : item)); setShowArchived(false); choose(value.archivedAt ? null : value);
      })}>{project.archivedAt ? t('Restore from history', '从历史恢复') : t('Archive to history', '归档到历史')}</Button></div>
      <section className="vl-section"><h3>{t('a. Import media', 'a. 导入媒体')}</h3>
        <p>{project.source?.name || t('Import a video or audio file to start.', '导入视频或音频文件开始处理。')}</p>
        <input aria-label={t('Upload local media file', '上传本地媒体文件')} type="file" accept=".mp4,.mov,.avi,.mkv,.flv,.wmv,.webm,.wav,.mp3,.flac,.m4a" disabled={!bound || busy || working || !editable}
          onChange={event => { const file = event.target.files?.[0]; if (file) void perform(() => upload(file)); event.target.value = ''; }} />
        {busy && <p role="status">{t('Working…', '正在处理…')}</p>}
        <MediaPreview project={project} disabled={busy || working || !bound || !editable} prepare={() => perform(async () => {
          const id = project.id; const value = await command<VideoLingoProject>('project.prepare-preview', { projectId: id }); if (selectedId.current === id) setProject(value);
        })} />
        {(project.source || project.cleanupPending === 'media') && <><p>{t('Clear this project’s media and processing files to choose another source. Other projects are kept.', '清空本项目的媒体和处理文件，再选择新来源。其他项目保留。')}</p>
          <Button tone="secondary" disabled={busy || working || !bound || !!project.archivedAt} onClick={() => void perform(async () => {
            const value = await command<VideoLingoProject>('project.clear', { projectId: project.id, kind: 'media' });
            setProjects(previous => previous.map(item => item.id === value.id ? value : item)); choose(value);
          })}>{project.cleanupPending ? t('Retry media cleanup', '重试媒体清理') : t('Clear media and reselect', '清空媒体并重新选择')}</Button></>}
      </section>
      <DownloadPanel key={`download-${project.id}`} project={project} locale={locale} disabled={!bound || busy || working || !editable}
        uploadCookies={async file => {
          if (!file.name.toLowerCase().endsWith('.txt') || !file.size || file.size > 1024 ** 2) throw new Error('Choose a cookies.txt file up to 1 MiB');
          const assetPath = `projects/${project.id}/download-cookies/${crypto.randomUUID()}.txt`;
          await client.storage.assets.write({ relativePath: assetPath, body: file, mediaType: 'text/plain' }); return assetPath;
        }}
        run={async input => { setNotice(''); const id = project.id; const value = await command<VideoLingoProject>('project.download-url', { projectId: id, input }); if (selectedId.current === id) setProject(value); }}
        stop={() => perform(() => task('cancel'))} />
      <ProcessingSettings key={`settings-${project.id}`} project={project} locale={locale} disabled={working || busy || !bound || !editable} onDraft={setSettingsDraft}
        save={async settings => { const id = project.id; const value = await command<VideoLingoProject>('project.update-settings', { projectId: id, settings }); if (selectedId.current === id) setProject(value); }}
        uploadTerms={async file => {
          if (!file.size || file.size > 5 * 1024 ** 2 || !file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Choose an XLSX terminology file up to 5 MiB');
          const assetPath = `projects/${project.id}/terms/${crypto.randomUUID()}.xlsx`;
          await client.storage.assets.write({ relativePath: assetPath, body: file, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); return assetPath;
        }} />
      <section className="vl-section"><h3>{t('b. Translate and generate subtitles', 'b. 翻译与生成字幕')}</h3>
        <p>{t('Recognition, sentence splitting, translation and timestamp alignment run in order. If enabled, subtitles are then burned into the video.', '按顺序完成识别、分句、翻译和时间对齐；启用烧录时接着生成字幕视频。')}</p>
        <Button disabled={!bound || busy || working || !project.source || !editable} onClick={() => void perform(async () => {
          const id = project.id;
          await command('project.update-settings', { projectId: id, settings: validateBusinessSettings(settingsDraft || businessSettings(project)) });
          await command<Batch>('project.run-subtitles', { projectId: id });
          const value = await command<VideoLingoProject>('project.get', { projectId: id }); if (selectedId.current === id) setProject(value);
        })}>{t('Start subtitle processing', '开始字幕处理')}</Button>
      </section>
      <WorkflowStatus workflowId={project.workflowId} locale={locale} onRunning={setWorkflowRunning}
        read={id => command<Batch>('batch.get', { batchId: id })} control={(id, action) => command<Batch>(`batch.${action}`, { batchId: id })} />
      {project.subtitleVideo && <section className="vl-section"><h3>{t('Subtitle video', '字幕视频')}</h3><DubbingVideo assetPath={project.subtitleVideo.assetPath} label={t('Subtitle video', '字幕视频')} />
        <Button tone="secondary" onClick={() => void perform(() => download(project.subtitleVideo!.assetPath))}>output_sub.mp4</Button></section>}
      <details><summary>{t('Individual processing steps and details', '分步处理与详情')}</summary>
      <section className="vl-section"><h3>{t('b. Recognize speech', 'b. 识别语音')}</h3>
        <div className="vl-row"><StatusBadge>{separationWorking || ['voice-preview', 'translating-preview'].includes(project.state) ? (project.transcript ? labels.transcribed : labels.ready) : labels[project.state] || project.state}</StatusBadge>
          <label>{t('Source language', '原文语言')} <select value={languageHint} disabled={working} onChange={event => setLanguageHint(event.target.value)}>
            <option value="">{t('Auto detect', '自动识别')}</option>{['en', 'zh', 'ja', 'fr', 'de', 'it', 'ru', 'es'].map(code => <option key={code} value={code}>{code}</option>)}
          </select></label>
        </div>
        {project.chunks.length > 0 && <p>{t('Audio chunks completed', '已完成音频片段')} {project.currentChunk} / {project.chunks.length}</p>}
        <div className="vl-row"><Button disabled={!project.source || busy || working || !bound} onClick={() => void perform(() => task('transcribe'))}>
          {project.state === 'transcribed' || project.state === 'no-speech' ? t('Transcribe again', '重新转写') : project.chunks.length ? t('Resume transcription', '恢复转写') : t('Start transcription', '开始转写')}</Button>
          <Button tone="secondary" disabled={!transcriptionWorking || busy} onClick={() => void perform(() => task('pause'))}>{t('Pause', '暂停')}</Button>
          <Button tone="secondary" disabled={!transcriptionWorking || busy} onClick={() => void perform(() => task('cancel'))}>{t('Stop', '停止')}</Button></div>
        {project.error && <p className="vl-error" role="alert">{project.error}</p>}
        {project.transcript && <><p>{project.languageHint ? t('Source language (chosen)', '原文语言（已指定）') : t('Source language (model-reported)', '原文语言（模型报告）')}：{sourceLanguageFor(project)} · {project.wordCount} {t('alignment units', '时间单元')}</p>
          <p>{t('Model-reported languages', '模型报告语言')}：{project.reportedLanguages?.join(', ') || project.detectedLanguage || t('Unreported', '未报告')}{!!project.unreportedLanguageChunks && ` · ${project.unreportedLanguageChunks} ${t('chunks without a language report', '片段未报告语言')}`}</p>
          <textarea aria-label={t('Source transcript', '原文转写')} readOnly value={project.transcript} rows={7} />
          {project.transcriptTruncated && <p>{t('Preview of the first 4000 characters. The full transcript is in transcript.txt.', '此处预览前 4000 字符，完整原文见 transcript.txt。')}</p>}
          <div className="vl-row">{project.outputPaths.map(assetPath => <Button tone="secondary" key={assetPath} onClick={() => void perform(() => download(assetPath))}>{assetPath.split('/').pop()}</Button>)}</div></>}
      </section>
      <section className="vl-section"><h3>{t('c. Separate vocals and background', 'c. 分离人声与背景音')}</h3>
        <p>{t('Keep the background audio for dubbing and obtain clean reference audio.', '保留背景音用于配音合成，并获得人声参考音频。')}</p>
        <div className="vl-row"><Button disabled={!project.source || busy || working || !bound || !!project.runtimeJobId} onClick={() => void perform(async () => {
          const id = project.id;
          const value = await command<VideoLingoProject>('project.separate', { projectId: id });
          if (selectedId.current === id) setProject(value);
        })}>{project.separation?.state === 'completed' ? t('Separate again', '重新分离') : project.separation ? t('Resume separation', '恢复分离') : t('Start separation', '开始分离')}</Button>
          <Button tone="secondary" onClick={() => { setConfigCapability('audio.separate'); setConfigOpen(true); }}>{t('Separation configuration', '分离配置')}</Button>
          <Button tone="secondary" disabled={!separationWorking || busy} onClick={() => void perform(() => task('pause'))}>{t('Pause separation', '暂停分离')}</Button>
          <Button tone="secondary" disabled={!separationWorking || busy} onClick={() => void perform(() => task('cancel'))}>{t('Stop separation', '停止分离')}</Button></div>
        {project.separation && <p role="status">{({ running: t('Separating', '正在分离'), receiving: t('Receiving and checking both audio outputs', '接收并检查两路音频'), paused: t('Paused', '已暂停'), completed: t('Separation complete', '分离完成'), canceled: t('Stopped', '已停止'), failed: t('Separation failed', '分离失败'), interrupted: t('Ready to resume', '等待恢复') })[project.separation.state]} · {project.separation.currentChunk} / {project.chunks.length}</p>}
        {project.separation?.error && <p className="vl-error" role="alert">{project.separation.error}</p>}
        {project.separation?.state === 'completed' && project.separation.vocalsPath && project.separation.backgroundPath && <>
          <p>{project.separation.sampleRateHz} Hz · {project.separation.channels} {t('channels', '声道')} · {project.separation.durationSeconds?.toFixed(3)} s</p>
          <SeparationAudio assetPath={project.separation.vocalsPath} label={t('Vocals', '人声')} />
          <SeparationAudio assetPath={project.separation.backgroundPath} label={t('Background', '背景音')} />
          <div className="vl-row"><Button tone="secondary" onClick={() => void perform(async () => { await client.storage.assets.reveal(project.separation!.vocalsPath!); })}>{t('Show vocals file', '显示人声文件')}</Button>
            <Button tone="secondary" onClick={() => void perform(async () => { await client.storage.assets.reveal(project.separation!.backgroundPath!); })}>{t('Show background file', '显示背景音文件')}</Button></div>
        </>}
      </section>
      <section className="vl-section"><h3>{t('d. Translate subtitles and dub video', 'd. 翻译字幕与视频配音')}</h3>
        <p>{t('Analyze the source language and apply the original subtitle splitting rules. Translation and dubbing follow this step.', '分析原文语言并应用原有字幕分句规则，翻译及配音接在此步骤之后。')}</p>
        <div className="vl-row"><Button disabled={!project.transcript || busy || working || !bound} onClick={() => void perform(async () => {
          const id = project.id; const value = await command<VideoLingoProject>('project.split-nlp', { projectId: id });
          if (selectedId.current === id) setProject(value);
        })}>{project.nlp ? t('Resume sentence splitting', '运行或恢复分句') : t('Split subtitle sentences', '字幕分句')}</Button>
          <Button tone="secondary" onClick={() => { setConfigCapability('text.annotate'); setConfigOpen(true); }}>{t('Language analysis configuration', '语言分析配置')}</Button>
          <Button tone="secondary" disabled={project.state !== 'annotating' && !project.nlp?.runtimeJobId} onClick={() => void perform(() => task('cancel'))}>{t('Stop sentence splitting', '停止分句')}</Button></div>
        {project.nlp && <p role="status">{t('Sentence splitting', '分句')}：{project.nlp.state} · {Object.keys(project.nlp.jobs).length} {t('analysis batches', '分析批次')}</p>}
        {project.nlp?.error && <p className="vl-error" role="alert">{project.nlp.error}</p>}
        {project.nlp?.state === 'completed' && <textarea aria-label={t('Subtitle sentences', '字幕分句结果')} readOnly value={project.nlp.text || ''} rows={6} />}
        {project.nlp?.textTruncated && <p>{t('This is a bounded preview; processing still uses the complete sentence file.', '此处为有限预览，处理仍使用完整分句文件。')}</p>}
      </section>
      <TranslationPanel key={`translation-${project.id}`} project={project} locale={locale} disabled={working || busy || !bound}
        configure={() => { setConfigCapability('text.generate'); setConfigOpen(true); }} cancel={() => perform(() => task('cancel'))}
        download={assetPath => perform(() => download(assetPath))}
        run={input => perform(async () => { const id = project.id; const value = await command<VideoLingoProject>('project.translate', { projectId: id, input }); if (selectedId.current === id) setProject(value); })} />
      </details>
      {project.translation?.state === 'completed' && <details><summary>{t('Proofread and export subtitles', '校对与导出字幕')}</summary><SubtitleReviewPanel key={`review-${project.id}-${project.translation.key}`} project={project} locale={locale} disabled={working || busy || !bound}
        saved={value => { if (selectedId.current === value.id) setProject(value); }} download={assetPath => perform(() => download(assetPath))} /></details>}
      {project.translation?.state === 'completed' && !project.source?.mediaType.startsWith('audio/') && project.subtitleVideo?.translationKey !== subtitleKey(project) && <div className="vl-row"><Button disabled={!bound || busy || working || !editable} onClick={() => void perform(async () => {
        const id = project.id; const value = await command<VideoLingoProject>('project.render-subtitles', { projectId: id }); if (selectedId.current === id) setProject(value);
      })}>{t('Export video with subtitles', '生成烧录字幕视频')}</Button>
        </div>}
      <DubbingPanel key={project.id} project={project} locale={locale} disabled={working || busy || !bound || !editable}
        download={assetPath => perform(() => download(assetPath))}
        dub={input => perform(async () => { const id = project.id;
          await command('project.update-settings', { projectId: id, settings: validateBusinessSettings(settingsDraft || businessSettings(project)) });
          await command<Batch>('project.run-dubbing', { projectId: id, input });
          const value = await command<VideoLingoProject>('project.get', { projectId: id }); if (selectedId.current === id) setProject(value); })}
        configure={capability => { setConfigCapability(capability); setConfigOpen(true); }}
        run={input => perform(async () => { const id = project.id; const value = await command<VideoLingoProject>('project.preview', { projectId: id, input }); if (selectedId.current === id) setProject(value); })}
        cancel={() => perform(() => task('cancel'))} />
      {(project.dubbing || project.cleanupPending === 'dubbing') && <div className="vl-row"><Button tone="secondary" disabled={working || busy || !bound || !!project.archivedAt} onClick={() => void perform(async () => {
        const value = await command<VideoLingoProject>('project.clear', { projectId: project.id, kind: 'dubbing' });
        setProjects(previous => previous.map(item => item.id === value.id ? value : item)); choose(value);
      })}>{project.cleanupPending ? t('Retry dubbing cleanup', '重试配音清理') : t('Delete dubbing files', '删除配音文件')}</Button></div>}
    </>}
  </div>;
}

export default function component({ parentElement, data }: { parentElement: HTMLElement | ShadowRoot; data: { locale?: string } }) {
  const container = document.createElement('div'); parentElement.appendChild(container);
  const root = createRoot(container); root.render(<NimiThemeProvider accentPack="nimi-accent"><TooltipProvider><Workspace locale={data?.locale || 'en'} /></TooltipProvider></NimiThemeProvider>);
  return () => { root.unmount(); container.remove(); };
}

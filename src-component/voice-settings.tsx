import React, { useEffect, useState } from 'react';
import { Button } from '@nimiplatform/kit/ui';
import { openNimiLocalAppAssetMediaUrl } from '@nimiplatform/kit/shell/renderer/bridge';
import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import { errorText, type DubbingInput, type VideoLingoProject } from '../src-electron/project-types.js';
import { translator } from './localization.js';

export function VoiceSettings({ project, value, change, client, locale, disabled, configure, onBusy }: {
  project: VideoLingoProject; value: DubbingInput; change: (value: DubbingInput) => void; client: NimiLocalAppClient;
  locale: string; disabled: boolean; configure: (capability: string) => void; onBusy?: (busy: boolean) => void;
}) {
  const t = translator(locale), patch = (fields: Partial<DubbingInput>) => change({ ...value, ...fields });
  const [voices, setVoices] = useState<{ id: string; label: string }[]>([]);
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  useEffect(() => { onBusy?.(busy); }, [busy]);
  useEffect(() => {
    let active = true; setVoices([]); setError('');
    const load = async () => {
      if (value.voiceKind === 'preset') {
        const result = await client.aiConfig.listOptions({ kind: 'preset-voices' });
        return result.kind === 'preset-voices' ? result.options.map(voice => ({ id: voice.voiceId, label: voice.name })) : [];
      }
      if (value.voiceKind === 'asset') return (await client.ai.voiceAssets.list({ pageSize: 100 })).assets
        .filter(asset => asset.status === 'active').map(asset => ({ id: asset.voiceAssetId, label: asset.voiceAssetId }));
      return [];
    };
    void load().then(result => { if (active) setVoices(result); }).catch(error => { if (active) setError(errorText(error)); });
    return () => { active = false; };
  }, [value.voiceKind, refresh]);
  useEffect(() => {
    let active = true, revoke: (() => Promise<void>) | undefined; setReferenceUrl('');
    if (value.voiceKind === 'reference' && value.referenceMode === 'provided' && value.referenceAssetPath) {
      void openNimiLocalAppAssetMediaUrl(value.referenceAssetPath).then(handle => {
        revoke = handle.revoke; if (active) setReferenceUrl(handle.url); else void handle.revoke();
      }).catch(error => { if (active) setError(errorText(error)); });
    }
    return () => { active = false; void revoke?.(); };
  }, [value.voiceKind, value.referenceMode, value.referenceAssetPath]);
  return <div className="vl-voice-settings">
    <div className="vl-row"><label>{t('Voice mode', '声音模式')} <select aria-label="voice-mode" value={value.voiceKind} disabled={disabled || busy}
      onChange={event => patch({ voiceKind: event.target.value as DubbingInput['voiceKind'], voiceId: '', referenceMode: value.referenceMode || 'first' })}>
      <option value="preset">{t('Preset voice', '预置声音')}</option><option value="asset">{t('Existing VoiceAsset', '已有音色')}</option>
      <option value="reference">{t('Create from reference', '从参考音频创建')}</option></select></label>
      <Button tone="secondary" onClick={() => configure('audio.synthesize')}>{t('Speech model settings', '语音模型设置')}</Button>
      {value.voiceKind !== 'reference' && <><select aria-label="dubbing-voice" value={value.voiceId || ''} disabled={disabled || busy} onChange={event => patch({ voiceId: event.target.value })}>
        <option value="">{t('Choose a voice', '选择音色')}</option>
        {value.voiceId && !voices.some(voice => voice.id === value.voiceId) && <option value={value.voiceId}>{t('Saved selection', '已保存选择')} · {value.voiceId}</option>}
        {voices.map(voice => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select>
        <Button tone="secondary" disabled={busy} onClick={() => setRefresh(x => x + 1)}>{t('Refresh voices', '刷新音色')}</Button></>}
    </div>
    {value.voiceKind === 'reference' && <>
      <div className="vl-row"><label>{t('Reference mode', '参考方式')} <select aria-label="dubbing-reference-mode" value={value.referenceMode || 'first'} disabled={disabled || busy}
        onChange={event => patch({ referenceMode: event.target.value as DubbingInput['referenceMode'] })}>
        <option value="first">{t('First source segment for all lines', '首段人声用于全部台词')}</option><option value="per-segment">{t('Each matching source segment', '逐段匹配人声')}</option>
        <option value="provided">{t('Uploaded reference audio', '上传的参考音频')}</option></select></label>
        <Button tone="secondary" onClick={() => configure('voice.create')}>{t('Configure voice creation', '配置音色创建')}</Button></div>
      {value.referenceMode === 'provided' && <>
        <label>{t('Voice reference audio', '声音参考音频')} <input type="file" accept=".wav,.mp3" aria-label="voice-reference-file" disabled={disabled || busy} onChange={event => {
          const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError('');
          void (async () => {
            const extension = file.name.split('.').pop()?.toLowerCase();
            if (!file.size || file.size > 20 * 1024 ** 2 || !['wav', 'mp3'].includes(extension || '')) throw new Error('Choose a WAV or MP3 reference up to 20 MiB');
            const relativePath = `projects/${project.id}/voice-reference/${crypto.randomUUID()}.${extension}`;
            await client.storage.assets.write({ relativePath, body: file, mediaType: extension === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
            patch({ referenceAssetPath: relativePath });
          })().catch(error => setError(errorText(error))).finally(() => setBusy(false));
        }} /></label>
        {referenceUrl && <audio controls src={referenceUrl} aria-label="voice-reference-playback" />}
        <label>{t('Reference transcript', '参考音频原文')} <textarea aria-label="voice-reference-transcript" value={value.referenceText || ''} rows={2} disabled={disabled || busy}
          onChange={event => patch({ referenceText: event.target.value })} placeholder={t('Exact spoken reference text', '参考音频中实际说出的文字')} /></label>
      </>}
    </>}
    <details><summary>{t('Dubbing output settings', '配音输出设置')}</summary>
      <label>{t('Speech language (optional)', '配音语言（可选）')} <input value={value.language || ''} disabled={disabled || busy} maxLength={80}
        onChange={event => patch({ language: event.target.value })} placeholder={t('Use the model default', '使用模型默认行为')} /></label>
      <label><input type="checkbox" checked={value.burnSubtitles && !project.source?.mediaType.startsWith('audio/')} disabled={disabled || busy || project.source?.mediaType.startsWith('audio/')}
        onChange={event => patch({ burnSubtitles: event.target.checked })} />{t('Burn translated subtitles into video', '烧录译文字幕')}</label>
    </details>
    {busy && <p role="status">{t('Uploading reference…', '正在上传参考音频…')}</p>}{error && <p role="alert" className="vl-error">{error}</p>}
  </div>;
}

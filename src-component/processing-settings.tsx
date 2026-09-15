import { translator } from './localization.js';
import React, { useEffect, useState } from 'react';
import { Button } from '@nimiplatform/kit/ui';
import { businessSettings, DEFAULT_BUSINESS_SETTINGS, validateBusinessSettings, type BusinessSettings } from '../src-electron/business-settings.js';
import { errorText, type VideoLingoProject } from '../src-electron/project-types.js';

export function ProcessingSettings({ project, locale, disabled, save, uploadTerms, onDraft }: {
  project: VideoLingoProject; locale: string; disabled: boolean; save: (settings: BusinessSettings) => Promise<void>; uploadTerms: (file: File) => Promise<string>;
  onDraft: (settings: BusinessSettings) => void;
}) {
  const t = translator(locale);
  const [value, setValue] = useState(() => businessSettings(project));
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const patch = (values: Partial<BusinessSettings>) => { setValue(previous => ({ ...previous, ...values })); setDirty(true); };
  useEffect(() => { onDraft(value); }, [value]);
  useEffect(() => {
    if (project.settings && Object.entries(value).every(([key, item]) => project.settings?.[key as keyof BusinessSettings] === item)) setDirty(false);
  }, [project.settings, value]);
  const number = (key: keyof BusinessSettings, en: string, cn: string, min: number, max: number, step = 1) => <label key={key}>{t(en, cn)}
    <input aria-label={`setting-${key}`} type="number" min={min} max={max} step={step} value={String(value[key])} disabled={disabled || busy}
      onChange={event => patch({ [key]: Number(event.target.value) })} /></label>;
  return <section className="vl-section"><h3>{t('Subtitle settings', '字幕设置')}</h3>
    <div className="vl-row"><label>{t('Recognition language', '识别语言')} <select aria-label="setting-sourceLanguage" value={value.sourceLanguage} disabled={disabled || busy} onChange={event => patch({ sourceLanguage: event.target.value })}>
      <option value="">{t('Auto', '自动')}</option>{['en', 'zh', 'es', 'ru', 'fr', 'de', 'it', 'ja'].map(code => <option key={code}>{code}</option>)}</select></label>
      <label>{t('Target language', '目标语言')} <input aria-label="setting-targetLanguage" value={value.targetLanguage} disabled={disabled || busy} onChange={event => patch({ targetLanguage: event.target.value })} /></label></div>
    <div className="vl-row"><label><input type="checkbox" checked={value.vocalEnhancement} disabled={disabled || busy} onChange={event => patch({ vocalEnhancement: event.target.checked })} />{t('Separate vocals before recognition', '转写前分离人声增强')}</label>
      <label><input type="checkbox" checked={value.burnSubtitles && !project.source?.mediaType.startsWith('audio/')} disabled={disabled || busy || project.source?.mediaType.startsWith('audio/')} onChange={event => patch({ burnSubtitles: event.target.checked })} />{t('Burn subtitles into video', '烧录字幕')}</label>
      <label><input type="checkbox" checked={value.reflect} disabled={disabled || busy} onChange={event => patch({ reflect: event.target.checked })} />{t('Reflect and polish translations', '反思润色译文')}</label></div>
    <details><summary>{t('Subtitle length tuning', '字幕长度调节')}</summary><div className="vl-row">
      {number('maxSplitLength', 'Rough cut (words/tokens)', '粗分长度（词/单位）', 8, 60)}
      {number('subtitleMaxLength', 'Subtitle line length', '字幕行长度', 20, 200)}
      <Button tone="secondary" disabled={disabled || busy} onClick={() => patch({ maxSplitLength: 20, subtitleMaxLength: 75 })}>{t('Restore 20 / 75', '恢复 20 / 75')}</Button></div></details>
    <details><summary>{t('Terminology and advanced processing', '术语与高级处理设置')}</summary>
      <p>{t('Optional terminology workbook: source, translation and note columns. Processing settings apply when starting the next task; existing outputs remain available.', '可选术语表依次为原文、译文、备注三列。处理设置在下次开始任务时应用，现有结果仍可查看。')}</p>
      <input type="file" accept=".xlsx" aria-label="setting-customTerms" disabled={disabled || busy} onChange={event => {
        const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError('');
        void uploadTerms(file).then(path => patch({ customTermsAssetPath: path })).catch(error => setError(errorText(error))).finally(() => setBusy(false));
      }} />{value.customTermsAssetPath && <Button tone="secondary" disabled={disabled || busy} onClick={() => patch({ customTermsAssetPath: undefined })}>{t('Use the bundled terminology', '使用附带术语表')}</Button>}
      <div className="vl-settings-grid">
        {number('maxWorkers', 'Parallel text requests', '文本请求并发数', 1, 64)}{number('summaryLength', 'Summary input characters', '摘要输入字符数', 1, 1000000)}
        {number('subtitleTargetMultiplier', 'Translated text length multiplier', '译文长度系数', .1, 10, .1)}
        {number('speedMin', 'Minimum dubbing speed', '最低配音倍速', .1, 10, .05)}{number('speedAccept', 'Acceptable dubbing speed', '可接受配音倍速', .1, 10, .05)}{number('speedMax', 'Maximum dubbing speed', '最高配音倍速', .1, 10, .05)}
        {number('minSubtitleDuration', 'Minimum dubbing task duration (s)', '配音任务最短时长（秒）', 0, 1000, .1)}{number('minTrimDuration', 'Translation trim threshold (s)', '译文压缩时长阈值（秒）', 0, 1000, .1)}{number('tolerance', 'Dubbing extension tolerance (s)', '配音允许延长（秒）', 0, 1000, .1)}
        <label>{t('Source extraction sample rate (Hz)', '源音频提取采样率（Hz）')} <select aria-label="setting-rawSampleRate" value={value.rawSampleRate} disabled={disabled || busy} onChange={event => patch({ rawSampleRate: Number(event.target.value) })}>
          {[16000, 22050, 24000, 32000, 44100, 48000].map(rate => <option key={rate}>{rate}</option>)}</select></label>
        <label>{t('Source MP3 bitrate', '源 MP3 码率')} <input aria-label="setting-rawBitrate" value={value.rawBitrate} disabled={disabled || busy} onChange={event => patch({ rawBitrate: event.target.value })} /></label>
      </div>
      <p>{t('Dubbing duration controls affect task grouping and speed adjustment; they never replace ASR timestamps.', '配音时长设置用于任务合并和变速，不会替换 ASR 实测时间。')}</p>
      <label><input type="checkbox" checked={value.ffmpegGpu} disabled={disabled || busy} onChange={event => patch({ ffmpegGpu: event.target.checked })} />{t('Use NVIDIA encoding (requires h264_nvenc and a compatible GPU)', '使用 NVIDIA 编码（需 h264_nvenc 与兼容 GPU）')}</label>
    </details>
    <div className="vl-row"><Button disabled={disabled || busy || !dirty} onClick={() => { setBusy(true); setError(''); void (async () => { await save(validateBusinessSettings(value)); setDirty(false); })()
      .catch(error => setError(errorText(error))).finally(() => setBusy(false)); }}>{t('Save processing settings', '保存处理设置')}</Button>
      <Button tone="secondary" disabled={disabled || busy} onClick={() => patch({ ...DEFAULT_BUSINESS_SETTINGS })}>{t('Restore defaults', '恢复默认设置')}</Button>
      {dirty && <span>{t('Starting a task also saves these settings.', '开始处理时也会保存这些设置。')}</span>}</div>
    {error && <p role="alert" className="vl-error">{error}</p>}
  </section>;
}

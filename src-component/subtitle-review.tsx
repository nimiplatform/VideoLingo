import { translator } from './localization.js';
import React, { useEffect, useState } from 'react';
import { Button } from '@nimiplatform/kit/ui';
import { invoke } from '@nimiplatform/kit/shell/renderer/bridge';
import { errorText, type VideoLingoProject } from '../src-electron/project-types.js';
import { subtitleIssues, SUBTITLE_LIMIT, type SubtitleReview } from '../src-electron/subtitles.js';

export function SubtitleReviewPanel({ project, locale, disabled, saved, download }: {
  project: VideoLingoProject; locale: string; disabled: boolean;
  saved: (project: VideoLingoProject) => void; download: (path: string) => Promise<void>;
}) {
  const zh = locale.startsWith('zh'), t = translator(locale);
  const [review, setReview] = useState<SubtitleReview>();
  const [kind, setKind] = useState<'display' | 'dubbing'>('display');
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const readOnly = !!project.archivedAt || !!project.cleanupPending;
  const read = () => invoke('videolingo.project.subtitles', { projectId: project.id }) as Promise<SubtitleReview>;
  useEffect(() => {
    let active = true;
    void read().then(value => { if (active) setReview(value); }).catch(error => { if (active) setError(errorText(error)); });
    return () => { active = false; };
  }, [project.id, project.translation?.key]);
  let issues: string[] = [], syntaxError = '';
  if (review) try { issues = subtitleIssues(review, review.durationMs); } catch (error) { syntaxError = errorText(error); }
  const issueLabel = (value: string) => !zh ? value : value.replace(/^display/u, '显示字幕').replace(/^dubbing/u, '配音字幕')
    .replace('source', '原文').replace('translation', '译文').replace('end must be after start', '结束时间必须晚于开始时间')
    .replace('time exceeds source duration', '时间超出媒体范围').replace('overlaps or precedes the previous cue', '与前一条重叠或顺序倒置')
    .replace('source and translation cue counts differ', '原文与译文条目数不同').replace('source and translation times must match', '原文与译文时间必须一致');
  const edit = (side: 'source' | 'translation', value: string) => {
    setReview(previous => previous && ({ ...previous, [kind]: { ...previous[kind], [side]: value } }));
    setDirty(true); setNotice('');
  };
  const draftFile = (side: 'source' | 'translation') => kind === 'display' ? `output/${side === 'source' ? 'src' : 'trans'}.srt`
    : `output/audio/${side === 'source' ? 'src' : 'trans'}_subs_for_audio.srt`;
  const exportDraft = (assetPath: string) => {
    setBusy(true); setError('');
    void invoke('videolingo.project.export', { projectId: project.id, assetPath, subtitleDraft: true })
      .catch(error => setError(errorText(error))).finally(() => setBusy(false));
  };
  const exportBlocked = (name: string) => {
    if (!review) return true;
    try { return subtitleIssues(review, review.durationMs, [name.includes('/audio/') ? 'dubbing' : 'display']).length > 0; }
    catch { return true; }
  };
  return <section className="vl-section"><h3>{t('Proofread subtitles', '校对字幕')}</h3>
    <p>{t('Edit the source and translation SRT, or import files edited elsewhere. Display and dubbing have their own sentence divisions. Saved edits remain separate from the original model results.',
      '直接修改原文和译文 SRT，或导入在外部修订的文件。显示字幕和配音字幕各自保留原分句；保存的用户修订与原模型结果分开。')}</p>
    {error && <p role="alert" className="vl-error">{error}</p>}
    {review && <>
      <p>{review.origin === 'model' ? t('Original model output', '当前为模型原始结果') : t('Saved user revision', '当前为已保存的用户修订')}
        {dirty ? t(' · Unsaved changes', ' · 尚未保存') : ''}</p>
      {syntaxError && <p role="alert" className="vl-error">{syntaxError}</p>}
      {issues.length > 0 && <div className="vl-error" role="alert"><p>{t(`${issues.length} timing or pairing issues. Draft export stays available for proofreading. Correct the issues before final export, video rendering or dubbing.`,
        `还有 ${issues.length} 个时间或配对问题。草稿仍可导出校对，修正后才能导出成品、烧录或配音。`)}</p>
        <details><summary>{t('Show affected cues', '查看具体字幕编号')}</summary><ul>{issues.slice(0, 100).map((issue, index) => <li key={index}>{issueLabel(issue)}</li>)}</ul>
          {issues.length > 100 && <p>{t('The first 100 issues are shown.', '仅显示前 100 个问题。')}</p>}</details></div>}
      <div className="vl-row"><label>{t('Subtitle use', '字幕用途')} <select aria-label="subtitle-review-kind" value={kind} disabled={busy} onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="display">{t('Display / burned subtitles', '显示与烧录字幕')}</option><option value="dubbing">{t('Dubbing input', '配音输入字幕')}</option></select></label></div>
      <p>{t('Each cue contains its number, start --> end time, and text. Times use HH:MM:SS,mmm; the source and translation must match. Times are never filled automatically.',
        '每条依次填写编号、开始 --> 结束时间、文本。时间格式为 HH:MM:SS,mmm；原文与译文的编号、时间须对应，不会自动补时长。')}</p>
      <div className="vl-subtitle-pair">{(['source', 'translation'] as const).map(side => <div key={side}>
        <label>{side === 'source' ? t('Source SRT', '原文 SRT') : t('Translation SRT', '译文 SRT')}
          <textarea spellCheck={false} aria-label={`subtitle-review-${side}`} rows={14} value={review[kind][side]} disabled={disabled || busy || readOnly} onChange={event => edit(side, event.target.value)} /></label>
        <input key={`${kind}-${side}`} type="file" accept=".srt" aria-label={`subtitle-import-${side}`} disabled={disabled || busy || readOnly} onChange={event => {
          const file = event.target.files?.[0]; if (!file) return;
          const currentKind = kind; setBusy(true); setError('');
          void (async () => {
            if (!file.name.toLowerCase().endsWith('.srt') || !file.size || file.size > SUBTITLE_LIMIT) throw new Error('Choose a UTF-8 SRT file up to 256 KiB');
            const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
            setReview(value => value && ({ ...value, [currentKind]: { ...value[currentKind], [side]: text } })); setDirty(true); setNotice('');
          })().catch(error => setError(errorText(error))).finally(() => setBusy(false));
        }} />
        <Button tone="secondary" disabled={disabled || busy || dirty} onClick={() => exportDraft(review.files[draftFile(side)]!)}>
          {side === 'source' ? t('Export saved source draft', '导出已保存原文草稿') : t('Export saved translation draft', '导出已保存译文草稿')}</Button>
      </div>)}</div>
      {review.origin === 'user' && <details><summary>{t('Original model drafts', '原始模型草稿')}</summary><div className="vl-row">{(['source', 'translation'] as const).map(side =>
        <Button key={side} tone="secondary" disabled={disabled || busy} onClick={() => exportDraft(project.translation!.files[draftFile(side)]!)}>
          {side === 'source' ? t('Export original source draft', '导出原始原文草稿') : t('Export original translation draft', '导出原始译文草稿')}</Button>)}</div></details>}
      <div className="vl-row"><Button disabled={disabled || busy || !dirty || !!syntaxError || readOnly} onClick={() => {
        setBusy(true); setError('');
        void (async () => {
          const updated = await invoke('videolingo.project.save-subtitles', { projectId: project.id,
            input: { translationKey: review.translationKey, revision: review.revision, display: review.display, dubbing: review.dubbing } }) as VideoLingoProject;
          const latest = await read(); setReview(latest); setDirty(false); saved(updated);
          setNotice(latest.issues.length ? t('Draft saved. Timing issues still block final exports and dubbing.', '草稿已保存，时间问题仍会拦截成品导出与配音。')
            : t('User revision saved. Review the meaning by playing the source before dubbing.', '用户修订已保存。配音前请对照原片确认语义。'));
        })().catch(error => setError(errorText(error))).finally(() => setBusy(false));
      }}>{issues.length ? t('Save draft', '保存校对草稿') : t('Save subtitle revision', '保存字幕修订')}</Button>
        <Button tone="secondary" disabled={busy} onClick={() => { setBusy(true); void read().then(value => { setReview(value); setDirty(false); setError(''); setNotice(''); })
          .catch(error => setError(errorText(error))).finally(() => setBusy(false)); }}>{t('Reload saved subtitles', '重新载入已保存字幕')}</Button></div>
      {notice && <p role="status" className="vl-notice">{notice}</p>}
      <div className="vl-row">{[false, true].map(draft => <Button key={String(draft)} tone="secondary" disabled={disabled || busy || dirty || (!draft && (!!syntaxError || !!issues.length))} onClick={() => {
        setBusy(true); setError(''); void invoke('videolingo.project.export-subtitles', { projectId: project.id, draft })
          .catch(error => setError(errorText(error))).finally(() => setBusy(false));
      }}>{draft ? t('Download all subtitle drafts (ZIP)', '下载全部字幕草稿（ZIP）') : t('Download all subtitles (ZIP)', '下载全部字幕（ZIP）')}</Button>)}</div>
      <div className="vl-row">{Object.entries(review.files).map(([name, file]) => <Button key={name} tone="secondary" disabled={disabled || busy || dirty || exportBlocked(name)}
        onClick={() => void download(file)}>{name.split('/').pop()}</Button>)}</div>
    </>}
  </section>;
}

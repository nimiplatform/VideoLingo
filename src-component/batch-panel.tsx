import type { NimiLocalAppClient } from '@nimiplatform/sdk/app';
import { businessSettings } from '../src-electron/business-settings.js';
import { dubbingSettingsFor } from '../src-electron/dubbing-settings.js';
import { VoiceSettings } from './voice-settings.js';
import { translator } from './localization.js';
import React, { useEffect, useState } from 'react';
import { Button } from '@nimiplatform/kit/ui';
import type { Batch, BatchItemInput } from '../src-electron/batches.js';
import { errorText, type TaskSheetRow, type VideoLingoProject } from '../src-electron/project-types.js';
import { TaskSheetPanel } from './task-sheet.js';

type Command = <T>(name: string, payload?: Record<string, unknown>) => Promise<T>;
export function BatchPanel({ locale, bound, command, importFile, beginUrl, readSheet, projects, selectProject, client, configure }: {
  client: NimiLocalAppClient; configure: (capability: string) => void;
  locale: string; bound: boolean; command: Command; importFile: (file: File) => Promise<VideoLingoProject>;
  projects: VideoLingoProject[]; selectProject: (id: string) => Promise<void>;
  beginUrl: (url: string) => Promise<VideoLingoProject>; readSheet: (file: File) => Promise<{ rows: TaskSheetRow[] }>;
}) {
  const t = translator(locale);
  const [records, setRecords] = useState<Batch[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [items, setItems] = useState<(BatchItemInput & { title: string })[]>([]);
  const [title, setTitle] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState('');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const perform = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const refresh = async () => { const values = (await command<Batch[]>('batches.list')).filter(record => !record.purpose || record.purpose === 'batch'); setRecords(values); setBatch(current => values.find(value => value.id === current?.id) || values.at(-1) || null); };
  useEffect(() => { if (bound) void perform(refresh); else { setBatch(null); setRecords([]); setItems([]); } }, [bound]);
  useEffect(() => {
    if (!bound || !batch?.id || batch.state !== 'running') return;
    let active = true;
    const timer = setInterval(() => { void command<Batch>('batch.get', { batchId: batch.id }).then(value => { if (active) setBatch(value); }).catch(error => { if (active) setError(errorText(error)); }); }, 1800);
    return () => { active = false; clearInterval(timer); };
  }, [bound, batch?.id, batch?.state]);
  const add = (project: VideoLingoProject) => {
    const settings = businessSettings(project);
    setItems(previous => previous.some(item => item.projectId === project.id) ? previous : [...previous,
      { projectId: project.id, title: project.title, settings, sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage, vocalEnhancement: settings.vocalEnhancement,
        burnSubtitles: settings.burnSubtitles && !project.source?.mediaType.startsWith('audio/') }]);
  };
  const patch = (index: number, value: Partial<BatchItemInput>) => setItems(previous => previous.map((item, i) => i === index ? { ...item, ...value } : item));
  return <section className="vl-section"><h3>{t('Batch tasks', '批量任务')}</h3>
    <p>{t('Process projects in order. Errors stay with their entry; continuing skips completed entries. Restarted queues require an explicit resume.', '按项目顺序处理，错误定位到条目；继续时跳过已完成条目，重启后需明确恢复。')}</p>
    <div className="vl-row"><select aria-label="batch-selection" value={batch?.id || ''} disabled={!bound || busy || voiceBusy} onChange={event => {
      const id = event.target.value;
      if (!id) { setBatch(null); return; }
      void perform(async () => {
        const value = await command<Batch>('batch.get', { batchId: id });
        setRecords(previous => previous.map(record => record.id === id ? value : record)); setBatch(value);
      });
    }}>
      <option value="">{t('Choose a saved batch', '选择已保存批次')}</option>{records.map(record => <option key={record.id} value={record.id}>{record.title}</option>)}</select>
      <Button tone="secondary" disabled={!bound || busy || voiceBusy} onClick={() => void perform(refresh)}>{t('Refresh batches', '刷新批次')}</Button></div>
    {batch && <><p role="status">{batch.title} · {batch.state}</p>
      <div className="vl-row"><Button disabled={!bound || busy || voiceBusy || batch.state === 'running' || batch.state === 'completed'} onClick={() => void perform(async () => setBatch(await command<Batch>('batch.resume', { batchId: batch.id })))}>{t('Start or resume batch', '开始或恢复批次')}</Button>
        <Button tone="secondary" disabled={!bound || busy || voiceBusy || batch.state !== 'running'} onClick={() => void perform(async () => setBatch(await command<Batch>('batch.pause', { batchId: batch.id })))}>{t('Pause and keep progress', '暂停并保留进度')}</Button>
        <Button tone="secondary" disabled={!bound || busy || voiceBusy || ['completed', 'canceled'].includes(batch.state)} onClick={() => void perform(async () => setBatch(await command<Batch>('batch.stop', { batchId: batch.id })))}>{t('Stop', '停止')}</Button></div>
      <ol>{batch.items.map(item => <li key={item.id}><Button tone="secondary" onClick={() => void perform(() => selectProject(item.projectId))}>{item.title}</Button> · {item.state} · {item.step}
        {item.noSpeech && <span> · {t('No speech', '未识别到语音')}</span>}{item.error && <p role="alert">{item.error}</p>}
        <div className="vl-row">{item.outputs?.map(file => <Button key={file} tone="secondary" onClick={() => void perform(async () => { await command('project.export', { projectId: item.projectId, assetPath: file }); })}>{file.split('/').pop()}</Button>)}</div></li>)}</ol></>}
    <details><summary>{t('Create a batch', '创建批次')}</summary><fieldset disabled={!bound || busy || voiceBusy} className="vl-batch-editor">
      <TaskSheetPanel locale={locale} disabled={!bound || busy || voiceBusy} projects={projects} readSheet={readSheet} importFile={importFile} beginUrl={beginUrl}
        getProject={id => command<VideoLingoProject>('project.get', { projectId: id })} openProject={selectProject} addItems={values => {
          if (values.some(value => items.some(item => item.projectId === value.projectId))) throw new Error(t('A selected project is already in this queue.', '所选项目已在当前队列中。'));
          setItems(previous => [...previous, ...values]);
        }} />
      <label>{t('Batch name', '批次名称')} <input value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
      <input aria-label="batch-media-files" type="file" multiple disabled={!bound || busy || voiceBusy} accept=".mp4,.mov,.avi,.mkv,.flv,.wmv,.webm,.wav,.mp3,.flac,.m4a" onChange={event => {
        const files = Array.from(event.target.files || []); event.target.value = '';
        void perform(async () => { for (const file of files) add(await importFile(file)); });
      }} />
      <div className="vl-row"><select aria-label="batch-existing-project" value={existing} onChange={event => setExisting(event.target.value)}><option value="">{t('Or choose an imported project', '或选择已导入项目')}</option>
        {projects.filter(project => project.source).map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
        <Button tone="secondary" disabled={!bound || busy || voiceBusy || !existing} onClick={() => void perform(async () => add(await command<VideoLingoProject>('project.get', { projectId: existing })))}>{t('Add', '添加')}</Button></div>
      {items.map((item, index) => <div key={item.projectId} className="vl-section"><strong>{index + 1}. {item.title}</strong>
        <label>{t('Source language', '原文语言')} <select value={item.sourceLanguage} onChange={event => patch(index, { sourceLanguage: event.target.value })}><option value="">{t('Auto', '自动')}</option>{['en', 'zh', 'ja', 'fr', 'de', 'it', 'ru', 'es'].map(lang => <option key={lang}>{lang}</option>)}</select></label>
        <label>{t('Target language', '目标语言')} <input value={item.targetLanguage} onChange={event => patch(index, { targetLanguage: event.target.value })} /></label>
        <label><input type="checkbox" checked={item.burnSubtitles} onChange={event => patch(index, { burnSubtitles: event.target.checked })} />{t('Export subtitle video', '导出烧录字幕视频')}</label>
        <label><input type="checkbox" checked={!!item.dubbing} onChange={event => patch(index, { dubbing: event.target.checked ? dubbingSettingsFor(projects.find(project => project.id === item.projectId)!) : undefined })} />{t('Include dubbing and background mixing', '生成配音并混合背景')}</label>
        {item.dubbing && projects.find(project => project.id === item.projectId) && <VoiceSettings
          project={projects.find(project => project.id === item.projectId)!} value={item.dubbing} change={dubbing => patch(index, { dubbing })}
          client={client} locale={locale} disabled={busy || voiceBusy || !bound} configure={configure} onBusy={setVoiceBusy} />}
        <label><input type="checkbox" checked={!!item.vocalEnhancement} disabled={busy} onChange={event => patch(index, { vocalEnhancement: event.target.checked })} />{t('Separate vocals before recognition', '转写前分离人声增强')}</label>
        <Button tone="secondary" onClick={() => setItems(previous => previous.filter((_, i) => i !== index))}>{t('Remove entry', '移除条目')}</Button>
      </div>)}
      <Button disabled={!bound || busy || voiceBusy || !items.length} onClick={() => void perform(async () => { const record = await command<Batch>('batch.create', { title, items: items.map(({ title: _title, ...item }) => item) }); setItems([]); setTitle(''); setRecords(previous => [...previous, record]); setBatch(record); })}>{t('Save queue', '保存队列')}</Button>
    </fieldset></details>
    {busy && <p role="status">{t('Working…', '正在处理…')}</p>}{error && <p className="vl-error" role="alert">{error}</p>}
  </section>;
}

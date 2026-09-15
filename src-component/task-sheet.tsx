import { translator } from './localization.js';
import React, { useState } from 'react';
import { Button } from '@nimiplatform/kit/ui';
import { errorText, type TaskSheetRow, type VideoLingoProject } from '../src-electron/project-types.js';
import type { BatchItemInput } from '../src-electron/batches.js';
import { businessSettings } from '../src-electron/business-settings.js';

type Row = TaskSheetRow & { projectId?: string };
export function TaskSheetPanel({ locale, disabled, projects, readSheet, importFile, beginUrl, getProject, openProject, addItems }: {
  locale: string; disabled: boolean; projects: VideoLingoProject[];
  readSheet: (file: File) => Promise<{ rows: TaskSheetRow[] }>; importFile: (file: File) => Promise<VideoLingoProject>;
  beginUrl: (url: string) => Promise<VideoLingoProject>; getProject: (id: string) => Promise<VideoLingoProject>; openProject: (id: string) => Promise<void>;
  addItems: (items: (BatchItemInput & { title: string })[]) => void;
}) {
  const t = translator(locale);
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const patch = (number: number, values: Partial<Row>) => setRows(previous => previous.map(row => row.row === number ? { ...row, ...values } : row));
  const perform = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  return <details><summary>{t('Import the original Excel task sheet', '导入原 Excel 任务表')}</summary>
    <p>{t('Columns: Video File, Source Language, Target Language, Dubbing, Status. Blank/Error rows are selected initially. Associate each selected row with its media project, then add it to the queue. This does not start AI.',
      '列名：Video File、Source Language、Target Language、Dubbing、Status。初始选中状态为空或 Error 的行。为每个所选行关联媒体项目后再加入队列，此操作不会开始 AI。')}</p>
    <input type="file" accept=".xlsx" aria-label="batch-task-sheet" disabled={disabled || busy} onChange={event => {
      const file = event.target.files?.[0]; if (file) void perform(async () => setRows((await readSheet(file)).rows));
    }} />
    {rows.map(row => <div key={row.row} className="vl-section">
      <label><input type="checkbox" checked={row.selected} disabled={disabled || busy} onChange={event => patch(row.row, { selected: event.target.checked })} />
        {row.row}. {row.videoFile}</label>
      <p>{row.sourceLanguageSpecified ? row.sourceLanguage || t('Automatic source language', '自动识别原文') : t('Project source-language setting', '使用项目原文语言设置')} → {row.targetLanguage || t('Project target-language setting', '使用项目目标语言设置')} · {row.dubbing ? t('Dubbing', '配音') : t('Subtitles', '字幕')}
        {row.status && <> · {t('Sheet status', '表中状态')}：{row.status}</>}</p>
      {row.selected && <div className="vl-row"><select aria-label={`sheet-project-${row.row}`} value={row.projectId || ''} disabled={disabled || busy} onChange={event => patch(row.row, { projectId: event.target.value })}>
        <option value="">{t('Choose a media project', '选择媒体项目')}</option>{projects.filter(project => project.source || project.id === row.projectId).map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
        {row.projectId ? <Button tone="secondary" disabled={busy} onClick={() => void perform(() => openProject(row.projectId!))}>{t('Open project', '打开项目')}</Button>
          : row.isUrl ? <Button tone="secondary" disabled={disabled || busy} onClick={() => void perform(async () => patch(row.row, { projectId: (await beginUrl(row.videoFile)).id }))}>{t('Download into a new project', '下载到新项目')}</Button>
          : <input type="file" aria-label={`sheet-file-${row.row}`} disabled={disabled || busy} onChange={event => {
            const file = event.target.files?.[0]; if (!file) return;
            void perform(async () => { if (file.name.toLowerCase() !== row.videoFile.toLowerCase()) throw new Error(`Row ${row.row}: choose ${row.videoFile}`); patch(row.row, { projectId: (await importFile(file)).id }); });
          }} />}
      </div>}
    </div>)}
    {rows.length > 0 && <Button disabled={disabled || busy || !rows.some(row => row.selected)} onClick={() => void perform(async () => {
      const selected = rows.filter(row => row.selected), items: (BatchItemInput & { title: string })[] = [];
      if (selected.some(row => !row.projectId)) throw new Error(t('Associate every selected row with a media project.', '请为每个所选行关联媒体项目。'));
      if (new Set(selected.map(row => row.projectId)).size !== selected.length) throw new Error(t('Use a separate project for each row.', '每行需要独立项目；同一媒体可导入到多个项目。'));
      for (const row of selected) {
        const project = await getProject(row.projectId!);
        if (!project.source) throw new Error(`Row ${row.row}: ${project.error || 'finish the media download first'}`);
        const settings = businessSettings(project);
        items.push({ projectId: project.id, title: project.title, sourceLanguage: row.sourceLanguageSpecified ? row.sourceLanguage : settings.sourceLanguage,
          targetLanguage: row.targetLanguage || settings.targetLanguage, burnSubtitles: settings.burnSubtitles, vocalEnhancement: settings.vocalEnhancement,
          ...(row.dubbing ? { dubbing: { voiceKind: 'reference', referenceMode: 'first', burnSubtitles: settings.burnSubtitles } as const } : {}) });
      }
      addItems(items); setRows([]);
    })}>{t('Add selected rows to the queue', '将所选行加入队列')}</Button>}
    {error && <p className="vl-error" role="alert">{error}</p>}
  </details>;
}

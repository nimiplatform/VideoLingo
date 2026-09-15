import React, { useEffect, useReducer, useState } from 'react';
import { Button, ConfirmDialog } from '@nimiplatform/kit/ui';
import { errorText, type VideoLingoProject } from '../src-electron/project-types.js';
import { CleanupConfirmation, type CleanupTarget } from './cleanup-confirmation.js';
import { translator } from './localization.js';

export function CleanupAction({ project, kind, locale, disabled, clear }: {
  project: VideoLingoProject; kind: CleanupTarget['kind']; locale: string; disabled: boolean;
  clear: (target: CleanupTarget) => Promise<void>;
}) {
  const t = translator(locale);
  const [confirmation] = useState(() => new CleanupConfirmation());
  const [, update] = useReducer(value => value + 1, 0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (disabled && !confirmation.pending) { confirmation.cancel(); update(); }
  }, [disabled]);
  const dubbing = kind === 'dubbing';
  const label = dubbing ? t('Delete dubbing files', '删除配音文件') : t('Clear media and reselect', '清空媒体并重新选择');
  return <div className="vl-cleanup-action">
    <Button tone="danger" disabled={disabled} onClick={() => {
      setError(''); confirmation.open({ projectId: project.id, title: project.title || project.source?.name || t('Untitled project', '未命名项目'), kind }); update();
    }}>{project.cleanupPending ? t('Retry cleanup…', '重试清理…') : label}</Button>
    <ConfirmDialog open={!!confirmation.target} title={dubbing ? t('Delete this project’s dubbing?', '删除此项目的配音？') : t('Clear this project’s media?', '清空此项目的媒体？')}
      confirmLabel={dubbing ? t('Permanently delete dubbing', '确认删除配音') : t('Permanently clear media', '确认清空媒体')}
      cancelLabel={t('Cancel', '取消')} confirmTone="danger" loading={confirmation.pending} pendingLabel={t('Deleting…', '正在删除…')}
      message={<>
        <p><strong>{t('Project', '项目')}：{confirmation.target?.title}</strong> · {confirmation.target?.projectId.slice(0, 8)}</p>
        <p>{dubbing
          ? t('Permanently delete all generated speech clips, dubbing subtitles, audio task sheets, mixed audio and dubbed videos in this project, including earlier dubbing runs. Dubbing progress will be cleared.', '永久删除此项目生成的所有配音片段、配音字幕、音频任务表、混合音轨和配音视频，包括旧配音结果，并清除配音进度。')
          : t('Permanently delete this project’s source media and processing files: transcription, subtitles and revisions, separated audio, uploaded references and dubbing. The project record remains.', '永久删除此项目的源媒体和处理文件：转写、字幕及校对版本、分离音频、上传参考和配音结果。项目记录保留。')}</p>
        {dubbing && <p>{t('Source media, transcription, translation subtitles, separated audio and uploaded references are kept.', '源媒体、转写、翻译字幕、分离音频和上传参考保留。')}</p>}
        <p>{t('This cannot be undone. Regenerating results may require new AI processing. Files already exported to your chosen location are not deleted.', '此操作不可撤销，重新生成可能需要再次推理。已导出到你选择位置的文件不会被删除。')}</p>
        {error && <p role="alert" className="vl-error">{error}</p>}
      </>}
      onClose={() => { confirmation.cancel(); update(); }}
      onConfirm={() => {
        if (disabled) return;
        setError('');
        const operation = confirmation.confirm(clear); update();
        void operation.catch(error => setError(errorText(error))).finally(update);
      }} />
  </div>;
}

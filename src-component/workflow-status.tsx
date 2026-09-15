import { translator } from './localization.js';
import React, { useEffect, useState } from 'react';
import { Button } from '@nimiplatform/kit/ui';
import type { Batch } from '../src-electron/batches.js';
import { errorText } from '../src-electron/project-types.js';

export function WorkflowStatus({ workflowId, locale, read, control, onRunning }: {
  workflowId?: string; locale: string; read: (id: string) => Promise<Batch>; control: (id: string, action: 'resume' | 'pause' | 'stop') => Promise<Batch>;
  onRunning: (running: boolean) => void;
}) {
  const t = translator(locale);
  const [flow, setFlow] = useState<Batch>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { onRunning(flow?.state === 'running'); }, [flow?.state, workflowId]);
  useEffect(() => {
    setFlow(undefined); setError(''); if (!workflowId) return;
    let active = true;
    const update = () => { void read(workflowId).then(value => { if (active) setFlow(value); }).catch(error => { if (active) setError(errorText(error)); }); };
    update(); const timer = setInterval(update, 1800);
    return () => { active = false; clearInterval(timer); };
  }, [workflowId]);
  if (!workflowId) return null;
  const item = flow?.items[0];
  const steps: Record<string, string> = { transcribe: t('Recognize speech', '识别语音'), nlp: t('Split sentences', '分句'), translate: t('Translate and align subtitles', '翻译并对齐字幕'),
    'subtitle-video': t('Burn subtitles', '烧录字幕'), separate: t('Separate vocals and background', '分离人声与背景'), dub: t('Generate and merge dubbing', '生成配音并合成') };
  const states: Record<string, string> = { ready: t('Ready', '待开始'), running: t('Running', '进行中'), paused: t('Paused', '已暂停'), canceled: t('Stopped', '已停止'),
    interrupted: t('Interrupted; resume explicitly', '已中断，请明确恢复'), completed: t('Completed', '完成'), 'completed-with-errors': t('Needs attention', '需要处理错误') };
  const act = (action: 'resume' | 'pause' | 'stop') => { setBusy(true); setError(''); void control(workflowId, action).then(setFlow).catch(error => setError(errorText(error))).finally(() => setBusy(false)); };
  return <section className="vl-section"><h3>{flow?.purpose === 'dubbing' ? t('Dubbing progress', '配音进度') : t('Subtitle progress', '字幕进度')}</h3>
    <p role="status">{states[flow?.state || 'ready']} · {steps[item?.step || 'transcribe']}</p>
    {(item?.error || error) && <p className="vl-error" role="alert">{error || item?.error}</p>}
    {item?.noSpeech && <p>{t('No speech was detected.', '未识别到语音。')}</p>}
    <div className="vl-row"><Button disabled={busy || !flow || flow.state === 'running' || flow.state === 'completed'} onClick={() => act('resume')}>{t('Resume', '恢复')}</Button>
      <Button tone="secondary" disabled={busy || flow?.state !== 'running'} onClick={() => act('pause')}>{t('Pause and retain progress', '暂停并保留进度')}</Button>
      <Button tone="secondary" disabled={busy || flow?.state === 'completed'} onClick={() => act('stop')}>{t('Stop', '停止')}</Button></div>
  </section>;
}

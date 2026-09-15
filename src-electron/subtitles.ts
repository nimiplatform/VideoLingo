import type { VideoLingoProject } from './project-types.js';

export type SubtitlePair = { source: string; translation: string };
export type SubtitleContent = { display: SubtitlePair; dubbing: SubtitlePair };
export type SubtitleReview = SubtitleContent & {
  translationKey: string; revision: string; origin: 'model' | 'user'; durationMs: number;
  files: Record<string, string>; issues: string[];
};
export type SubtitleSaveInput = SubtitleContent & { translationKey: string; revision: string };
export type SubtitleCue = { start: number; end: number; text: string };
export const SUBTITLE_LIMIT = 256 * 1024;
export const SUBTITLE_FILES = ['output/src.srt', 'output/trans.srt', 'output/src_trans.srt', 'output/trans_src.srt',
  'output/audio/src_subs_for_audio.srt', 'output/audio/trans_subs_for_audio.srt'] as const;

export function parseSrt(value: string): SubtitleCue[] {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > SUBTITLE_LIMIT) throw new Error('Each subtitle file must be UTF-8 SRT up to 256 KiB');
  const blocks = value.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').trim().split(/\n(?:[ \t]*\n)+/gu);
  if (!value.trim() || blocks.length > 10000) throw new Error('Subtitle files must contain 1–10000 cues');
  return blocks.map((block, index) => {
    const [id, time, ...lines] = block.split('\n');
    const match = /^(\d{2,3}):([0-5]\d):([0-5]\d),(\d{3}) --> (\d{2,3}):([0-5]\d):([0-5]\d),(\d{3})$/u.exec(time || '');
    if (Number(id) !== index + 1 || !/^\d+$/u.test(id || '') || !match || !lines.join('\n').trim()) throw new Error(`Invalid SRT cue ${index + 1}: use consecutive numbers, HH:MM:SS,mmm --> HH:MM:SS,mmm and nonempty text`);
    const ms = (offset: number) => Number(match[offset]) * 3600000 + Number(match[offset + 1]) * 60000 + Number(match[offset + 2]) * 1000 + Number(match[offset + 3]);
    return { start: ms(1), end: ms(5), text: lines.join('\n').trim() };
  });
}

function time(ms: number): string {
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export function formatSrt(cues: SubtitleCue[]): string {
  return cues.map((cue, index) => `${index + 1}\n${time(cue.start)} --> ${time(cue.end)}\n${cue.text}\n`).join('\n');
}

export function subtitleIssues(content: SubtitleContent, durationMs: number, kinds: readonly ('display' | 'dubbing')[] = ['display', 'dubbing']): string[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('The source media duration is unavailable');
  const issues: string[] = [];
  for (const kind of kinds) {
    const source = parseSrt(content[kind]?.source), translated = parseSrt(content[kind]?.translation);
    if (source.length !== translated.length) issues.push(`${kind}: source and translation cue counts differ`);
    for (const [side, cues] of [['source', source], ['translation', translated]] as const) {
      cues.forEach((cue, index) => {
        const label = `${kind} ${side} #${index + 1}`;
        if (cue.end <= cue.start) issues.push(`${label}: end must be after start`);
        if (cue.end > durationMs) issues.push(`${label}: time exceeds source duration`);
        if (index && cue.start < cues[index - 1]!.end) issues.push(`${label}: overlaps or precedes the previous cue`);
      });
    }
    source.forEach((cue, index) => {
      const other = translated[index];
      if (other && (cue.start !== other.start || cue.end !== other.end)) issues.push(`${kind} #${index + 1}: source and translation times must match`);
    });
  }
  return issues;
}

// Preserve the upstream display/audio split and its six SRT output names.
export function subtitleOutputs(content: SubtitleContent): Record<string, string> {
  const source = parseSrt(content.display.source), translated = parseSrt(content.display.translation);
  const combined = (reverse: boolean) => source.map((cue, index) => ({ ...cue,
    text: (reverse ? [translated[index]?.text || '', cue.text] : [cue.text, translated[index]?.text || '']).join('\n') }));
  return { 'output/src.srt': formatSrt(source), 'output/trans.srt': formatSrt(translated),
    'output/src_trans.srt': formatSrt(combined(false)), 'output/trans_src.srt': formatSrt(combined(true)),
    'output/audio/src_subs_for_audio.srt': formatSrt(parseSrt(content.dubbing.source)),
    'output/audio/trans_subs_for_audio.srt': formatSrt(parseSrt(content.dubbing.translation)) };
}

export function currentSubtitleRevision(project: VideoLingoProject) {
  return project.subtitleRevision?.translationKey === project.translation?.key ? project.subtitleRevision : undefined;
}
export function subtitleKey(project: VideoLingoProject): string | undefined {
  return currentSubtitleRevision(project)?.revision || project.translation?.key;
}
export function subtitleFiles(project: VideoLingoProject): Record<string, string> {
  return currentSubtitleRevision(project)?.files || project.translation?.files || {};
}

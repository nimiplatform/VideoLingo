import { projectId, type DubbingInput, type VideoLingoProject } from './project-types.js';

export function dubbingSettingsFor(project: VideoLingoProject): DubbingInput {
  return { ...(project.dubbingSettings || project.dubbing?.input || { voiceKind: 'reference', referenceMode: 'first', burnSubtitles: project.settings?.burnSubtitles ?? true }),
    ...(project.source?.mediaType.startsWith('audio/') ? { burnSubtitles: false } : {}) };
}

/** Validate the user's selection before queueing any prerequisite inference. */
export function validateDubbingInput(id: string, value: DubbingInput): DubbingInput {
  projectId(id);
  if (!value || !['preset', 'asset', 'reference'].includes(value.voiceKind) || typeof value.burnSubtitles !== 'boolean') throw new Error('Choose dubbing settings');
  if (value.language !== undefined && (typeof value.language !== 'string' || value.language.length > 80)) throw new Error('Invalid speech language');
  const base: DubbingInput = { voiceKind: value.voiceKind, burnSubtitles: value.burnSubtitles, ...(value.language ? { language: value.language.trim() } : {}) };
  if (value.voiceKind !== 'reference') {
    if (typeof value.voiceId !== 'string' || !value.voiceId.trim() || value.voiceId.length > 256) throw new Error('Select an available voice');
    return { ...base, voiceId: value.voiceId.trim() };
  }
  if (!['first', 'per-segment', 'provided'].includes(value.referenceMode || '')) throw new Error('Choose a reference strategy');
  if (value.referenceMode !== 'provided') return { ...base, referenceMode: value.referenceMode };
  if (typeof value.referenceAssetPath !== 'string' || !new RegExp(`^projects/${id}/voice-reference/[0-9a-f-]+\\.(wav|mp3)$`).test(value.referenceAssetPath)) throw new Error('Upload this project’s reference audio');
  if (value.referenceText !== undefined && (typeof value.referenceText !== 'string' || value.referenceText.length > 20000)) throw new Error('Invalid reference transcript');
  return { ...base, referenceMode: 'provided', referenceAssetPath: value.referenceAssetPath, referenceText: value.referenceText || '' };
}

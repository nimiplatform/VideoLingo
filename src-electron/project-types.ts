export type ProjectState = 'empty' | 'ready' | 'downloading' | 'preparing' | 'transcribing' | 'separating' | 'annotating' | 'translating' | 'dubbing' | 'rendering' | 'receiving' | 'translating-preview' | 'voice-preview' | 'saving' | 'paused' | 'transcribed' | 'no-speech' | 'canceled' | 'failed' | 'interrupted';
export type DownloadInput = { url: string; resolution: '360' | '480' | '720' | '1080' | 'best'; proxy?: string; cookiesAssetPath?: string };
export type TaskSheetRow = { row: number; videoFile: string; isUrl: boolean; sourceLanguage: string; sourceLanguageSpecified: boolean; targetLanguage: string; dubbing: boolean; status: string; selected: boolean };
export type FailureDetails = import('@nimiplatform/sdk/types').NimiErrorFields;
export type TranslationInput = { targetLanguage: string; reflect: boolean; customTermsAssetPath?: string };
export type TranslationStage = {
  state: 'running' | 'completed' | 'canceled' | 'failed' | 'interrupted';
  input: TranslationInput; key: string; jobs: Record<string, string>; files: Record<string, string>; completedSteps: string[];
  runtimeJobId?: string; step?: string; error?: string; failure?: FailureDetails;
  settings?: import('./business-settings.js').BusinessSettings;
};
export type NlpStage = {
  state: 'running' | 'completed' | 'canceled' | 'failed' | 'interrupted';
  selectionKey: string; inputPath: string; jobs: Record<string, string>;
  runtimeJobId?: string; outputPath?: string; text?: string; error?: string; failure?: FailureDetails;
  textTruncated?: boolean;
};
export type PreviewInput = {
  kind: 'translation' | 'voice'; text: string; targetLanguage?: string; sourceLanguage?: string; reflect?: boolean;
  language?: string; voiceKind?: 'default' | 'preset' | 'asset' | 'reference'; voiceId?: string;
  referenceAssetPath?: string; referenceText?: string;
};
export type PreviewStage = {
  kind: 'translation' | 'voice'; state: 'running' | 'completed' | 'failed' | 'canceled' | 'interrupted'; input: PreviewInput;
  step?: string; runtimeJobId?: string; voiceAssetId?: string; resultPath?: string; audioPath?: string; text?: string;
  durationSeconds?: number; sampleRateHz?: number; channels?: number; error?: string; failure?: FailureDetails;
};
export type MediaInput = { name: string; assetPath: string; mediaType: string; sizeBytes: number; sha256: string };
export type AudioChunk = { assetPath: string; offsetSeconds: number; durationSeconds: number; resultPath?: string };
export type SeparationPair = {
  jobId: string; vocalsArtifactId: string; backgroundArtifactId: string;
  vocalsPath: string; backgroundPath: string; sampleRateHz: number; channels: number;
};
export type SeparationStage = {
  state: 'running' | 'receiving' | 'paused' | 'completed' | 'canceled' | 'failed' | 'interrupted';
  selectionKey: string;
  chunks?: AudioChunk[];
  sourceSettings?: { sourceHash: string };
  inputFormat?: { sampleRateHz: number; channels: number };
  pairs: SeparationPair[];
  currentChunk: number;
  runtimeJobId?: string;
  vocalsPath?: string;
  backgroundPath?: string;
  sampleRateHz?: number;
  channels?: number;
  durationSeconds?: number;
  error?: string;
};
export type VideoLingoProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  state: ProjectState;
  settings?: import('./business-settings.js').BusinessSettings;
  archivedAt?: string;
  workflowId?: string;
  dubbingSettings?: DubbingInput;
  cleanupPending?: 'media' | 'dubbing';
  source?: MediaInput;
  downloadInput?: DownloadInput;
  mediaPreview?: { sourceHash: string; state: 'preparing' | 'completed' | 'failed' | 'interrupted'; assetPath?: string; error?: string;
    durationSeconds?: number; sourceDurationSeconds?: number; videoCopied?: boolean; width?: number; height?: number };
  chunks: AudioChunk[];
  currentChunk: number;
  runId?: string;
  runtimeJobId?: string;
  languageHint: string;
  selectionKey?: string;
  transcriptionSource?: { vocalPath?: string; rawSampleRate: number; rawBitrate: string };
  separation?: SeparationStage;
  preview?: PreviewStage;
  nlp?: NlpStage;
  translation?: TranslationStage;
  subtitleRevision?: { translationKey: string; revision: string; savedAt: string; files: Record<string, string> };
  dubbing?: DubbingStage;
  subtitleVideo?: { translationKey: string; assetPath: string };
  invalidatedJobIds?: string[];
  detectedLanguage?: string;
  sourceLanguage?: string;
  reportedLanguages?: string[];
  unreportedLanguageChunks?: number;
  wordCount?: number;
  transcript?: string;
  transcriptTruncated?: boolean;
  outputPaths: string[];
  error?: string;
};

export function projectId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)) {
    throw new Error('Invalid VideoLingo project');
  }
  return value;
}

export function sourceAssetPath(id: string, filename: string, uploadId: string): string {
  projectId(id);
  projectId(uploadId);
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension || !['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'wav', 'mp3', 'flac', 'm4a'].includes(extension)) {
    throw new Error('Choose one of the supported video or audio formats');
  }
  return `projects/${id}/input/${uploadId}.${extension}`;
}

export function isWorking(state: ProjectState): boolean {
  return ['downloading', 'preparing', 'transcribing', 'separating', 'annotating', 'translating', 'dubbing', 'rendering', 'receiving', 'translating-preview', 'voice-preview', 'saving'].includes(state);
}

export function errorText(error: unknown): string {
  const value = error as { message?: string; reasonCode?: string; code?: string };
  const message = value?.message || String(error);
  const reason = value?.reasonCode || value?.code;
  return reason && !message.includes(reason) ? `${message} (${reason})` : message;
}

export function sourceLanguageFor(project: VideoLingoProject): string {
  return project.sourceLanguage || project.languageHint || project.detectedLanguage || '';
}

export type DubbingInput = {
  voiceKind: 'preset' | 'asset' | 'reference'; voiceId?: string;
  referenceMode?: 'first' | 'per-segment' | 'provided'; referenceAssetPath?: string; referenceText?: string;
  language?: string; burnSubtitles: boolean;
};
export type DubbingStage = {
  state: 'running' | 'completed' | 'canceled' | 'failed' | 'interrupted'; key: string; input: DubbingInput;
  jobs: Record<string, string>; voices: Record<string, string>; audio: Record<string, { assetPath: string; jobId: string }>;
  files: Record<string, string>; step?: string; runtimeJobId?: string; error?: string; failure?: FailureDetails;
  durationSeconds?: number;
  settings?: import('./business-settings.js').BusinessSettings;
  contextKey?: string;
};

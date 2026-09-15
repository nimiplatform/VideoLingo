/** App-owned controls from VideoLingo's original UI and config.yaml. */
export type BusinessSettings = {
  sourceLanguage: string; targetLanguage: string; burnSubtitles: boolean; vocalEnhancement: boolean; reflect: boolean;
  maxSplitLength: number; subtitleMaxLength: number; subtitleTargetMultiplier: number; maxWorkers: number; summaryLength: number;
  speedMin: number; speedAccept: number; speedMax: number; minSubtitleDuration: number; minTrimDuration: number; tolerance: number;
  ffmpegGpu: boolean; rawSampleRate: number; rawBitrate: string; customTermsAssetPath?: string;
};

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  sourceLanguage: '', targetLanguage: '简体中文', burnSubtitles: true, vocalEnhancement: false, reflect: true,
  maxSplitLength: 20, subtitleMaxLength: 75, subtitleTargetMultiplier: 1.2, maxWorkers: 4, summaryLength: 8000,
  speedMin: 1, speedAccept: 1.2, speedMax: 1.4, minSubtitleDuration: 2.5, minTrimDuration: 3.5, tolerance: 1.5,
  ffmpegGpu: false, rawSampleRate: 32000, rawBitrate: '128k',
};

export function validateBusinessSettings(value: BusinessSettings): BusinessSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose the project processing settings');
  const result = { ...value };
  if (!['', 'en', 'zh', 'ja', 'fr', 'de', 'it', 'ru', 'es'].includes(result.sourceLanguage)
    || typeof result.targetLanguage !== 'string' || !result.targetLanguage.trim() || result.targetLanguage.length > 80) throw new Error('Choose valid source and target languages');
  for (const name of ['burnSubtitles', 'vocalEnhancement', 'reflect', 'ffmpegGpu'] as const) {
    if (typeof result[name] !== 'boolean') throw new Error(`Invalid ${name}`);
  }
  const integer = (name: keyof BusinessSettings, min: number, max: number) => {
    const number = result[name]; if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  };
  integer('maxSplitLength', 8, 60); integer('subtitleMaxLength', 20, 200); integer('maxWorkers', 1, 64);
  integer('summaryLength', 1, 1000000); integer('rawSampleRate', 16000, 192000);
  if (![16000, 22050, 24000, 32000, 44100, 48000].includes(result.rawSampleRate)) throw new Error('Choose a supported MP3 extraction sample rate');
  for (const name of ['subtitleTargetMultiplier', 'speedMin', 'speedAccept', 'speedMax', 'minSubtitleDuration', 'minTrimDuration', 'tolerance'] as const) {
    if (!Number.isFinite(result[name]) || result[name] < 0 || result[name] > 1000) throw new Error(`Invalid ${name}`);
  }
  if (result.subtitleTargetMultiplier <= 0 || result.speedMin <= 0 || result.speedMin > result.speedAccept || result.speedAccept > result.speedMax) throw new Error('Use positive, ordered minimum / acceptable / maximum speeds');
  if (typeof result.rawBitrate !== 'string' || !/^(?:3[2-9]|[4-9]\d|[12]\d\d|3[01]\d|320)k$/u.test(result.rawBitrate)) throw new Error('Use an MP3 bitrate from 32k to 320k');
  if (result.customTermsAssetPath !== undefined && typeof result.customTermsAssetPath !== 'string') throw new Error('Invalid custom terminology workbook');
  return result;
}

export function businessSettings(project: { settings?: BusinessSettings; languageHint?: string; translation?: { input: { targetLanguage: string; reflect: boolean; customTermsAssetPath?: string } } }): BusinessSettings {
  return project.settings || { ...DEFAULT_BUSINESS_SETTINGS, sourceLanguage: project.languageHint || '',
    ...(project.translation ? { targetLanguage: project.translation.input.targetLanguage, reflect: project.translation.input.reflect,
      ...(project.translation.input.customTermsAssetPath ? { customTermsAssetPath: project.translation.input.customTermsAssetPath } : {}) } : {}) };
}

export function pythonBusinessSettings(settings: BusinessSettings) {
  return { max_workers: settings.maxWorkers, max_split_length: settings.maxSplitLength, summary_length: settings.summaryLength,
    speed_factor: { min: settings.speedMin, accept: settings.speedAccept, max: settings.speedMax },
    min_subtitle_duration: settings.minSubtitleDuration, min_trim_duration: settings.minTrimDuration, tolerance: settings.tolerance,
    subtitle: { max_length: settings.subtitleMaxLength, target_multiplier: settings.subtitleTargetMultiplier },
    ffmpeg_gpu: settings.ffmpegGpu, audio: { raw_sample_rate: settings.rawSampleRate, raw_bitrate: settings.rawBitrate } };
}

export function translationSettings(settings: BusinessSettings) {
  // Concurrency and encoding do not change a finished translation.
  return { maxSplitLength: settings.maxSplitLength, subtitleMaxLength: settings.subtitleMaxLength, subtitleTargetMultiplier: settings.subtitleTargetMultiplier,
    summaryLength: settings.summaryLength, speedMax: settings.speedMax, minTrimDuration: settings.minTrimDuration };
}

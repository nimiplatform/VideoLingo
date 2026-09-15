import en from '../translations/en.json' with { type: 'json' };
import zh from '../translations/zh-CN.json' with { type: 'json' };
import hk from '../translations/zh-HK.json' with { type: 'json' };
import ja from '../translations/ja.json' with { type: 'json' };
import es from '../translations/es.json' with { type: 'json' };
import ru from '../translations/ru.json' with { type: 'json' };
import fr from '../translations/fr.json' with { type: 'json' };

const dictionaries: Record<string, Record<string, string>> = { en, 'zh-CN': zh, 'zh-HK': hk, ja, es, ru, fr };
const aliases: Record<string, string> = {
  'Recognition language': 'Recog Lang', 'Target language': 'Target Lang',
  'Separate vocals before recognition': 'Vocal separation enhance', 'Burn subtitles into video': 'Burn-in Subtitles',
  'Burn translated subtitles into video': 'Burn-in Subtitles', 'Start subtitle processing': 'Start Processing Subtitles',
  'Start audio processing': 'Start Audio Processing',
  'Clear media and reselect': 'Delete and Reselect', 'Download all subtitles (ZIP)': 'Download All Srt Files',
  'Rough cut (words/tokens)': 'max_split_length (rough cut, words/tokens per chunk)',
  'Subtitle line length': 'max_length (max characters per subtitle line)',
};

/** Reuse the original product's language content, including its existing fallbacks. */
export function translator(locale: string) {
  const dictionary = dictionaries[locale] || dictionaries[locale.split('-')[0]!] || en;
  const keys = new Map(Object.keys(dictionary).map(key => [key.toLowerCase(), key]));
  return (english: string, chinese?: string): string => {
    const requested = aliases[english] || english;
    const key = keys.get(requested.toLowerCase());
    return key ? dictionary[key]! : locale.startsWith('zh') && chinese ? chinese : english;
  };
}

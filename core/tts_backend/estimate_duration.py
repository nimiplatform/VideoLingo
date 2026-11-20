import re
from typing import Optional
from pypinyin import pinyin, Style
import syllables


class AdvancedSyllableEstimator:
    def __init__(self):
        self.duration_params = {'en': 0.225, 'zh': 0.21, 'ja': 0.21, 'fr': 0.22, 'es': 0.22, 'ko': 0.21, 'default': 0.22}
        self.lang_patterns = {
            'zh': r'[\u4e00-\u9fff]', 'ja': r'[\u3040-\u309f\u30a0-\u30ff]',
            'fr': r'[àâçéèêëîïôùûüÿœæ]', 'es': r'[áéíóúñ¿¡]', 'en': r'[a-zA-Z]+', 'ko': r'[\uac00-\ud7af\u1100-\u11ff]'}
        self.lang_joiners = {'zh': '', 'ja': '', 'en': ' ', 'fr': ' ', 'es': ' ', 'ko': ' '}
        self.punctuation = {
            'mid': r'[，；：,;、]+', 'end': r'[。！？.!?]+', 'space': r'\s+',
            'pause': {'space': 0.15, 'default': 0.1}
        }

    def estimate_duration(self, text: str, lang: Optional[str] = None) -> float:
        syllable_count = self.count_syllables(text, lang)
        return syllable_count * self.duration_params.get(lang or 'default')

    def count_syllables(self, text: str, lang: Optional[str] = None) -> int:
        if not text.strip():
            return 0
        lang = lang or self._detect_language(text)

        vowels_map = {
            'fr': 'aeiouyàâéèêëîïôùûüÿœæ',
            'es': 'aeiouáéíóúü'
        }

        if lang == 'en':
            return self._count_english_syllables(text)
        elif lang == 'zh':
            text = re.sub(r'[^\u4e00-\u9fff]', '', text)
            return len(pinyin(text, style=Style.NORMAL))
        elif lang == 'ja':
            text = re.sub(r'[きぎしじちぢにひびぴみり][ょゅゃ]', 'X', text)
            text = re.sub(r'[っー]', '', text)
            return len(re.findall(r'[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]', text))
        elif lang in ('fr', 'es'):
            text = re.sub(r'e\b', '', text.lower()) if lang == 'fr' else text.lower()
            return max(1, len(re.findall(f'[{vowels_map[lang]}]+', text)))
        elif lang == 'ko':
            return len(re.findall(r'[\uac00-\ud7af]', text))
        return len(text.split())

    def _count_english_syllables(self, text: str) -> int:
        total = 0
        for word in text.strip().split():
            try:
                total += syllables.estimate(word)
            except Exception as error:
                raise ValueError(f"Cannot estimate the reading duration of {word!r}") from error
        return max(1, total)

    def _detect_language(self, text: str) -> str:
        # Kana first: the kanji of Japanese text are in the range of Chinese
        if re.search(self.lang_patterns['ja'], text):
            return 'ja'
        for lang, pattern in self.lang_patterns.items():
            if re.search(pattern, text):
                return lang
        return 'en'

    def process_mixed_text(self, text: str) -> dict:
        if not text or not isinstance(text, str):
            return {
                'language_breakdown': {},
                'total_syllables': 0,
                'punctuation': [],
                'spaces': [],
                'estimated_duration': 0
            }

        result = {'language_breakdown': {}, 'total_syllables': 0, 'punctuation': [], 'spaces': []}
        segments = re.split(f"({self.punctuation['space']}|{self.punctuation['mid']}|{self.punctuation['end']})", text)
        total_duration = 0

        for i, segment in enumerate(segments):
            if not segment:
                continue

            if re.match(self.punctuation['space'], segment):
                prev_lang = self._detect_language(segments[i - 1]) if i > 0 else None
                next_lang = self._detect_language(segments[i + 1]) if i < len(segments) - 1 else None
                if prev_lang and next_lang and (self.lang_joiners[prev_lang] == '' or self.lang_joiners[next_lang] == ''):
                    result['spaces'].append(segment)
                    total_duration += self.punctuation['pause']['space']
            elif re.match(f"{self.punctuation['mid']}|{self.punctuation['end']}", segment):
                result['punctuation'].append(segment)
                total_duration += self.punctuation['pause']['default']
            else:
                lang = self._detect_language(segment)
                if lang:
                    syllable_count = self.count_syllables(segment, lang)
                    if lang not in result['language_breakdown']:
                        result['language_breakdown'][lang] = {'syllables': 0, 'text': ''}
                    result['language_breakdown'][lang]['syllables'] += syllable_count
                    result['language_breakdown'][lang]['text'] += (
                        self.lang_joiners[lang] + segment if result['language_breakdown'][lang]['text'] else segment
                    )
                    result['total_syllables'] += syllable_count
                    total_duration += syllable_count * self.duration_params.get(lang, self.duration_params['default'])

        result['estimated_duration'] = total_duration
        return result


def init_estimator():
    return AdvancedSyllableEstimator()


def estimate_duration(text: str, estimator: AdvancedSyllableEstimator):
    if not text or not isinstance(text, str):
        return 0
    return estimator.process_mixed_text(text)['estimated_duration']


if __name__ == "__main__":
    estimator = init_estimator()
    print(estimate_duration('你好', estimator))

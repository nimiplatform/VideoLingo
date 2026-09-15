"""Nimi-backed TTS boundary; no provider fallback or synthetic success audio."""
import re
from pathlib import Path

from core.asr_backend.audio_preprocess import get_audio_duration
from core.nimi_bridge import request_model
from core.utils.config_utils import load_key


def clean_text_for_tts(text):
    for character in ['&', '®', '™', '©']:
        text = text.replace(character, '')
    return text.strip()


def tts_main(text, save_as, number, task_df):
    text = clean_text_for_tts(text)
    if not re.sub(r'[^\w\s]', '', text).strip():
        raise ValueError('Speech synthesis requires spoken text')
    output = Path(save_as)
    if output.exists():
        if get_audio_duration(str(output)) <= 0:
            raise ValueError('Cached speech audio is empty or unreadable')
        return
    settings = load_key('nimi_tts')
    origin = ''
    if task_df is not None and 'origin' in task_df:
        matching = task_df.loc[task_df['number'] == number, 'origin']
        if not matching.empty:
            origin = str(matching.iloc[0])
    reference = None
    mode = settings.get('reference_mode')
    if mode in {'first', 'per-segment'}:
        reference_number = task_df.iloc[0]['number'] if mode == 'first' else number
        reference = str((Path('output/audio/refers') / f'{reference_number}.wav').resolve(strict=True))
        if mode == 'first':
            origin = str(task_df.iloc[0]['origin'])
    elif mode == 'provided':
        reference = str(Path(settings['reference_path']).resolve(strict=True))
        origin = settings.get('reference_text', origin)
    request_model('speech', {'text': text, 'outputPath': str(output.resolve()), 'language': settings.get('language', ''),
                            'voiceKind': settings.get('voice_kind', 'default'), 'voiceId': settings.get('voice_id', ''),
                            'referencePath': reference, 'referenceText': origin})
    if not output.is_file() or get_audio_duration(str(output)) <= 0:
        raise ValueError('Nimi speech output is empty or unreadable')

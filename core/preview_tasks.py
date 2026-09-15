"""Explicit text/voice configuration previews; not a replacement for video NLP."""
import json
from pathlib import Path

from ruamel.yaml import YAML


def configuration(request):
    language = request.get("sourceLanguage", "en")
    if language not in {"en", "zh", "ja", "fr", "de", "it", "ru", "es"}:
        raise ValueError("Choose a supported source language for the text preview")
    value = {"target_language": request.get("targetLanguage", "简体中文"),
             "reflect_translate": request.get("reflect", True),
             "whisper": {"language": language, "detected_language": request.get('detectedLanguage', '')},
             "nimi_text_cache_key": request.get("selectionKey", ""),
             "nimi_persist_text_cache": request.get('operation') == 'translate-subtitles',
             "nimi_tts": request.get("voice", {}),
             "language_split_with_space": ["en", "fr", "de", "it", "ru", "es"],
             "language_split_without_space": ["zh", "ja"]}
    with open("config.yaml", "w", encoding="utf-8") as file:
        YAML().dump(value, file)


def translate_preview(request, workspace):
    from core.translate_lines import translate_lines

    source = request["text"].strip()
    if not source or len(source) > 600 or len(source.splitlines()) > 10:
        raise ValueError("Text preview accepts at most 600 characters and 10 explicit source lines")
    configuration(request)
    translated, original = translate_lines(source, None, None, None, None)
    if original != source or len(translated.splitlines()) != len(source.splitlines()):
        raise ValueError("Translation preview changed the source alignment")
    result = {"source": original, "translation": translated, "targetLanguage": request["targetLanguage"]}
    file = workspace / "translation-preview.json"
    file.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return {**result, "file": str(file)}


def voice_preview(request, workspace):
    import pandas as pd
    import soundfile as sf
    from core.tts_backend.tts_main import tts_main

    configuration(request)
    file = workspace / "voice-preview.wav"
    tts_main(request["text"], str(file), 1, pd.DataFrame({"number": [1], "origin": [request.get("referenceText", "")]}))
    info = sf.info(str(file))
    if info.frames <= 0:
        raise ValueError("Speech preview contains no decoded audio")
    return {"file": str(file), "durationSeconds": info.duration, "sampleRateHz": info.samplerate, "channels": info.channels}

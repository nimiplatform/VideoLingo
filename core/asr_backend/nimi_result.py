"""Translate the delivered Nimi transcript into VideoLingo's actual word table."""
import math


SUPPORTED_LANGUAGES = {"en", "es", "fr", "de", "it", "ru", "zh", "ja"}


def transcript_to_segment(transcript, offset_seconds, duration_seconds, source_language_hint=''):
    if not isinstance(transcript, dict):
        raise ValueError("Nimi did not return a typed transcription")
    if not math.isfinite(offset_seconds) or offset_seconds < 0:
        raise ValueError("Invalid source chunk offset")
    if not math.isfinite(duration_seconds) or duration_seconds <= 0:
        raise ValueError("Invalid source chunk duration")
    status = transcript.get("status")
    text, language, units = transcript.get("text"), transcript.get("language"), transcript.get("words")
    if status == "no-speech":
        if text != "" or language != "" or units != []:
            raise ValueError("Malformed no-speech result")
        return None
    if status != "transcribed" or not isinstance(text, str) or not text.strip() or not isinstance(units, list) or not units:
        raise ValueError("Source text and actual alignment units are required")
    if source_language_hint and source_language_hint not in SUPPORTED_LANGUAGES:
        raise ValueError('Choose a supported explicit source language')
    if language == '' and not source_language_hint:
        raise ValueError('The model did not report a language; choose the source language explicitly')
    if language != '' and language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"VideoLingo source-language processing does not support {language!r}")
    words = []
    previous_start = -1.0
    for unit in units:
        word = unit.get("text")
        start, end = unit.get("startSeconds"), unit.get("endSeconds")
        if not isinstance(word, str) or not word.strip() or len(word) > 30:
            raise ValueError("An alignment unit cannot pass VideoLingo word cleanup without loss")
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in (start, end)):
            raise ValueError("Nimi must supply actual numeric word timestamps")
        if not (0 <= start <= end <= duration_seconds) or start < previous_start:
            raise ValueError("Word timings are outside the submitted audio or out of order")
        previous_start = start
        words.append({"word": word, "start": start + offset_seconds, "end": end + offset_seconds})
    return {"text": text, "language": language, "start": words[0]["start"], "end": words[-1]["end"], "words": words}


def source_language_for_business(hint, reported_languages):
    if hint:
        if hint not in SUPPORTED_LANGUAGES:
            raise ValueError('Choose a supported explicit source language')
        return hint
    reports = set(reported_languages)
    if '' in reports or len(reports) != 1:
        raise ValueError('Missing or mixed model-reported languages require an explicit source-language choice')
    return reports.pop()

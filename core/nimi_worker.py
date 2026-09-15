"""Bounded media and subtitle operations. No Nimi session or inference engine."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import wave


def write_wav(path, data):
    with wave.open(io.BytesIO(data), "rb") as source:
        params = source.getparams()
        frames = source.readframes(source.getnframes())
    with wave.open(str(path), "wb") as target:
        # FFmpeg pipe WAV uses an unknown-length header; use the decoded samples.
        target.setnchannels(params.nchannels)
        target.setsampwidth(params.sampwidth)
        target.setframerate(params.framerate)
        target.writeframes(frames)
    return len(frames) / (params.nchannels * params.sampwidth * params.framerate)


def prepare(request, workspace):
    from core.asr_backend.audio_preprocess import convert_video_to_audio, audio_slice_wav, split_audio

    source = Path(request["source"]).resolve()
    source.relative_to(workspace)
    convert_video_to_audio(str(source))
    # Preserve the existing silence-boundary strategy while staying below 300 s.
    intervals = split_audio("output/audio/raw.mp3", target_len=240, win=30)
    chunks = []
    for index, (start, end) in enumerate(intervals):
        path = workspace / f"chunk-{index:05d}.wav"
        duration = write_wav(path, audio_slice_wav("output/audio/raw.mp3", start, end))
        if not (0 < duration <= 300):
            raise ValueError("Prepared audio is outside the supported transcription limit")
        chunks.append({"file": str(path), "offsetSeconds": start, "durationSeconds": duration})
    if not chunks:
        raise ValueError("The source has no decodable audio")
    return {"chunks": chunks}


def consume(request, workspace):
    import pandas as pd
    from core.asr_backend.nimi_result import transcript_to_segment
    from core.asr_backend.audio_preprocess import process_transcription
    from core._6_gen_sub import get_sentence_timestamps

    segments, texts, language = [], [], None
    for chunk in request["chunks"]:
        segment = transcript_to_segment(chunk["transcription"], chunk["offsetSeconds"], chunk["durationSeconds"])
        if segment is None:
            continue
        if language is not None and language != segment["language"]:
            raise ValueError("Mixed detected languages need an explicit source-language decision")
        language = segment["language"]
        frame = process_transcription({"segments": [segment]})
        if len(frame) != len(segment["words"]):
            raise ValueError("Original word cleanup discarded alignment units")
        # This validates future subtitle matching without substituting NLP splits.
        get_sentence_timestamps(frame, pd.DataFrame({"Source": [segment["text"]]}))
        segments.append(segment)
        texts.append(segment["text"])
    if not segments:
        return {"status": "no-speech", "language": "", "wordCount": 0, "text": "", "files": []}
    frame = process_transcription({"segments": segments})
    output = workspace / "result"
    output.mkdir()
    frame.to_excel(output / "cleaned_chunks.xlsx", index=False)
    frame.to_csv(output / "words.csv", index=False)
    text = "\n".join(texts)
    (output / "transcript.txt").write_text(text, encoding="utf-8")
    return {"status": "transcribed", "language": language, "wordCount": len(frame), "text": text,
            "files": [str(output / name) for name in ("cleaned_chunks.xlsx", "words.csv", "transcript.txt")]}


def main():
    request = json.loads(sys.stdin.readline())
    workspace = Path(request["workspace"]).resolve(strict=True)
    os.chdir(workspace)
    if request["operation"] in {"translate-preview", "voice-preview", "split-nlp", "translate-subtitles", "dub-video"}:
        from core.nimi_bridge import bind_host_channel
        bind_host_channel()
    with contextlib.redirect_stdout(sys.stderr):
        if request["operation"] == "prepare":
            result = prepare(request, workspace)
        elif request["operation"] == "consume":
            result = consume(request, workspace)
        elif request["operation"] == "assemble-separation":
            from core.separation_media import assemble_separation
            result = assemble_separation(request, workspace)
        elif request["operation"] == "translate-preview":
            from core.preview_tasks import translate_preview
            result = translate_preview(request, workspace)
        elif request["operation"] == "voice-preview":
            from core.preview_tasks import voice_preview
            result = voice_preview(request, workspace)
        elif request["operation"] == "split-nlp":
            from core.nlp_task import split_nlp
            result = split_nlp(request, workspace)
        elif request["operation"] == "translate-subtitles":
            from core.translation_task import translate_subtitles
            result = translate_subtitles(request, workspace)
        elif request["operation"] == "dub-video":
            from core.dubbing_task import dub_video
            result = dub_video(request, workspace)
        else:
            raise ValueError("Unknown VideoLingo media operation")
    print(json.dumps({"type": "result", "value": result}, ensure_ascii=False))


def run_main():
    try:
        main()
    except Exception as error:
        print(json.dumps({"type": "error", "message": str(error),
                          **getattr(error, "fields", {})}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    run_main()

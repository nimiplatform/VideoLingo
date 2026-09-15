"""Bounded media and subtitle operations. No Nimi session or inference engine."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import wave
from core.nimi_protocol import read_request, write_frame


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
    import subprocess
    from ruamel.yaml import YAML
    with open('config.yaml', 'w', encoding='utf-8') as file:
        YAML().dump(request.get('businessSettings', {}), file)
    from core.asr_backend.audio_preprocess import convert_video_to_audio, audio_slice_wav, split_audio, normalize_audio_volume, raw_audio_settings

    source = Path(request["source"]).resolve()
    source.relative_to(workspace)
    separation = request.get('purpose') == 'separation'
    channels = 1
    if separation:
        probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels', '-of', 'json', str(source)],
                               check=True, capture_output=True, text=True)
        streams = json.loads(probe.stdout)['streams']
        if not streams:
            raise ValueError('The source has no decodable audio track')
        sample_rate, channels = int(streams[0]['sample_rate']), int(streams[0]['channels'])
        input_audio = str(workspace / 'separation-source.wav')
        # Preserve original bandwidth/channels and its presentation clock on disk.
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source), '-map', '0:a:0', '-vn',
                        '-af', 'aresample=async=1:first_pts=0', '-c:a', 'pcm_s16le', '-rf64', 'auto', input_audio], check=True)
    else:
        convert_video_to_audio(str(source))
        sample_rate = 16000
        input_audio = 'output/audio/raw.mp3'
    if sample_rate <= 0 or channels <= 0:
        raise ValueError('Invalid source audio format')
    maximum_duration = min(300, (30 * 1024 ** 2) / (sample_rate * 2 * channels))
    window = min(30, maximum_duration / 8)
    target = min(240, maximum_duration - window)
    intervals = split_audio(input_audio, target_len=target, win=window)
    if request.get('vocals'):
        vocals = Path(request['vocals']).resolve(strict=True)
        vocals.relative_to(workspace)
        input_audio = str(workspace / 'normalized-vocals.wav')
        normalize_audio_volume(str(vocals), input_audio)
    chunks = []
    for index, (start, end) in enumerate(intervals):
        path = workspace / f"chunk-{index:05d}.wav"
        duration = write_wav(path, audio_slice_wav(input_audio, start, end, sample_rate=sample_rate, channels=channels))
        if not (0 < duration <= 300) or path.stat().st_size > 32 * 1024 ** 2:
            raise ValueError("Prepared audio is outside the supported transcription limit")
        chunks.append({"file": str(path), "offsetSeconds": start, "durationSeconds": duration})
    if not chunks:
        raise ValueError("The source has no decodable audio")
    return {"chunks": chunks, 'sampleRateHz': sample_rate, 'channels': channels}


def consume(request, workspace):
    import pandas as pd
    from core.asr_backend.nimi_result import source_language_for_business, transcript_to_segment
    from core.asr_backend.audio_preprocess import process_transcription
    from core._6_gen_sub import get_sentence_timestamps

    segments, texts, reports = [], [], []
    source_hint = request.get('sourceLanguageHint', '')
    for chunk in request["chunks"]:
        segment = transcript_to_segment(chunk["transcription"], chunk["offsetSeconds"], chunk["durationSeconds"], source_hint)
        if segment is None:
            continue
        reports.append(segment['language'])
        frame = process_transcription({"segments": [segment]})
        if len(frame) != len(segment["words"]):
            raise ValueError("Original word cleanup discarded alignment units")
        # This validates future subtitle matching without substituting NLP splits.
        get_sentence_timestamps(frame, pd.DataFrame({"Source": [segment["text"]]}))
        segments.append(segment)
        texts.append(segment["text"])
    if not segments:
        return {"status": "no-speech", "language": "", "sourceLanguage": source_hint, "reportedLanguages": [], "unreportedLanguageChunks": 0, "wordCount": 0, "text": "", "files": []}
    source_language = source_language_for_business(source_hint, reports)
    language = reports[0] if len(set(reports)) == 1 and reports[0] else ''
    frame = process_transcription({"segments": segments})
    output = workspace / "result"
    output.mkdir()
    frame.to_excel(output / "cleaned_chunks.xlsx", index=False)
    frame.to_csv(output / "words.csv", index=False)
    text = "\n".join(texts)
    (output / "transcript.txt").write_text(text, encoding="utf-8")
    return {"status": "transcribed", "language": language, "sourceLanguage": source_language,
            "reportedLanguages": sorted(set(reports) - {''}), "unreportedLanguageChunks": reports.count(''), "wordCount": len(frame), "text": text,
            "files": [str(output / name) for name in ("cleaned_chunks.xlsx", "words.csv", "transcript.txt")]}


def main():
    request = read_request()
    # Business output goes to stderr; it must also preserve Unicode in a frozen
    # process, whose Python startup does not honor the development -X utf8 flag.
    sys.stderr.reconfigure(encoding='utf-8', errors='strict')
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
        elif request["operation"] == "render-subtitles":
            from core.subtitle_video_task import render_subtitles
            result = render_subtitles(request, workspace)
        elif request["operation"] == "compatible-preview":
            from core.media_preview import compatible_preview
            result = compatible_preview(request, workspace)
        elif request['operation'] == 'read-task-sheet':
            from core.import_tasks import read_task_sheet
            result = read_task_sheet(request, workspace)
        elif request['operation'] == 'download-url':
            from core.import_tasks import download_url
            result = download_url(request, workspace)
        elif request['operation'] == 'zip-subtitles':
            from core.import_tasks import zip_subtitles
            result = zip_subtitles(request, workspace)
        else:
            raise ValueError("Unknown VideoLingo media operation")
    write_frame({"type": "result", "value": result})


def run_main():
    try:
        main()
    except Exception as error:
        write_frame({"type": "error", "message": str(error),
                     **getattr(error, "fields", {})})
        raise SystemExit(1)


if __name__ == "__main__":
    run_main()

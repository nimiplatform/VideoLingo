"""Original dubbing scheduling, actual duration adjustment and background mixing."""
import json
import subprocess
from pathlib import Path
from ruamel.yaml import YAML
from core.preview_tasks import configuration
from core.nimi_bridge import request_model


def dub_video(request, workspace):
    configuration(request)
    yaml = YAML()
    with open('config.yaml', encoding='utf-8') as file:
        settings = yaml.load(file)
    settings.update(request['businessSettings'])
    settings.update({'burn_subtitles': request['burnSubtitles'],
                     'allowed_video_formats': ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm'],
                     'allowed_audio_formats': ['wav', 'mp3', 'flac', 'm4a']})
    with open('config.yaml', 'w', encoding='utf-8') as file:
        yaml.dump(settings, file)
    from core._1_ytdlp import write_input_manifest
    from core.asr_backend.audio_preprocess import convert_video_to_audio, get_audio_duration
    from core._8_1_audio_task import gen_audio_task_main
    from core._8_2_dub_chunks import gen_dub_chunks
    from core._9_refer_audio import extract_refer_audio_main
    from core._10_gen_audio import gen_audio
    from core._11_merge_audio import merge_full_audio
    from core._12_dub_to_vid import merge_video_audio

    source = Path(request['source']).resolve(strict=True)
    source.relative_to(workspace)
    write_input_manifest(str(source), request['mediaKind'])
    convert_video_to_audio(str(source))
    gen_audio_task_main()
    gen_dub_chunks()
    if request['voice'].get('reference_mode') in {'first', 'per-segment'}:
        extract_refer_audio_main()
    request_model('checkpoint', {'stage': 'audio-tasks'})
    gen_audio()
    request_model('checkpoint', {'stage': 'speech'})
    merge_full_audio()
    # Audio-only input still gets the separated background mixed into the result.
    mixed_audio = workspace / 'output/dub_with_background.wav'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', 'output/audio/background.wav', '-i', 'output/dub.mp3',
                    '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=3[a]', '-map', '[a]',
                    '-c:a', 'pcm_s16le', str(mixed_audio)], check=True)
    merge_video_audio()
    duration = get_audio_duration(str(mixed_audio))
    if duration <= 0:
        raise ValueError('Dubbing produced no playable mixed audio')
    files = ['output/dub.mp3', 'output/dub.srt', 'output/dub_with_background.wav', 'output/audio/tts_tasks.xlsx']
    video_info = None
    if request['mediaKind'] == 'video':
        video = workspace / 'output/output_dub.mp4'
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)], check=True, capture_output=True, text=True)
        video_info = json.loads(probe.stdout)
        if not {'audio', 'video'}.issubset({stream['codec_type'] for stream in video_info['streams']}):
            raise ValueError('Dubbed video is missing video or audio')
        files.append('output/output_dub.mp4')
    return {'files': files, 'durationSeconds': duration, 'videoInfo': video_info}

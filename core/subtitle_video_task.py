from pathlib import Path
import json
import subprocess
from ruamel.yaml import YAML


def render_subtitles(request, workspace):
    from core._1_ytdlp import write_input_manifest
    from core._7_sub_into_vid import merge_subtitles_to_video
    source = Path(request['source']).resolve(strict=True)
    source.relative_to(workspace)
    with open('config.yaml', 'w', encoding='utf-8') as file:
        YAML().dump({'burn_subtitles': True, 'ffmpeg_gpu': request.get('businessSettings', {}).get('ffmpeg_gpu', False),
                     'allowed_video_formats': ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm'],
                     'allowed_audio_formats': ['wav', 'mp3', 'flac', 'm4a']}, file)
    write_input_manifest(str(source), 'video')
    merge_subtitles_to_video()
    output = workspace / 'output/output_sub.mp4'
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', str(output)], check=True, capture_output=True, text=True)
    info = json.loads(probe.stdout)
    if float(info['format']['duration']) <= 0 or not any(s['codec_type'] == 'video' for s in info['streams']):
        raise ValueError('Subtitle video has no complete video stream')
    return {'file': str(output)}

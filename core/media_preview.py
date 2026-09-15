"""Create a real browser-compatible preview without replacing the source asset."""
import json
import math
import subprocess
from pathlib import Path


def probe(filename):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(filename)],
                            check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def compatible_preview(request, workspace):
    source = Path(request['source']).resolve(strict=True)
    source.relative_to(workspace)
    original = probe(source)
    video = next((stream for stream in original['streams'] if stream['codec_type'] == 'video'), None)
    if not video:
        raise ValueError('The original media has no video stream for this preview')
    duration = float(video.get('duration') or original['format']['duration'])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('The original video has no valid duration')
    output = workspace / 'preview.mp4'
    copy_video = video['codec_name'] == 'h264' and video.get('pix_fmt') == 'yuv420p'
    codec = ['-c:v', 'copy'] if copy_video else ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '20']
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source), '-map', '0:v:0', '-map', '0:a:0?',
                    *codec, '-c:a', 'aac', '-movflags', '+faststart', str(output)], check=True)
    converted = probe(output)
    rendered = next(stream for stream in converted['streams'] if stream['codec_type'] == 'video')
    converted_duration = float(rendered.get('duration') or converted['format']['duration'])
    original_start = float(video.get('start_time', 0)) - float(original['format'].get('start_time', 0))
    preview_start = float(rendered.get('start_time', 0)) - float(converted['format'].get('start_time', 0))
    if rendered['codec_name'] != 'h264' or rendered.get('pix_fmt') != 'yuv420p':
        raise ValueError('The generated preview does not have the required video codec')
    if abs(converted_duration - duration) > .1 or abs(preview_start - original_start) > .1:
        raise ValueError('Preview conversion changed the video timeline')
    audio = next((stream for stream in converted['streams'] if stream['codec_type'] == 'audio'), None)
    original_audio = next((stream for stream in original['streams'] if stream['codec_type'] == 'audio'), None)
    if original_audio and (not audio or audio['codec_name'] != 'aac'):
        raise ValueError('The generated preview lost the source audio')
    return {'file': str(output), 'durationSeconds': converted_duration, 'sourceDurationSeconds': duration,
            'videoCopied': copy_video, 'width': rendered['width'], 'height': rendered['height']}

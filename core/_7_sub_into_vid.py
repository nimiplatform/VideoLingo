import json
import os
import subprocess
import time
from core._1_ytdlp import find_video_files
from core.utils import *
from core.utils.subtitle_style import get_subtitle_filter_candidates

OUTPUT_DIR = "output"
OUTPUT_VIDEO = f"{OUTPUT_DIR}/output_sub.mp4"
SRC_SRT = f"{OUTPUT_DIR}/src.srt"
TRANS_SRT = f"{OUTPUT_DIR}/trans.srt"


def check_gpu_available():
    try:
        result = subprocess.run(['ffmpeg', '-nostdin', '-encoders'], capture_output=True, text=True)
        return 'h264_nvenc' in result.stdout
    except Exception:
        return False


def merge_subtitles_to_video():
    from core._1_ytdlp import is_audio_only_input
    if is_audio_only_input():
        rprint("[bold green]🎵 Audio-only input: skipping video merge. Subtitle files are ready in the `output` directory.[/bold green]")
        return

    video_file = find_video_files()
    os.makedirs(os.path.dirname(OUTPUT_VIDEO), exist_ok=True)

    if not load_key("burn_subtitles"):
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', video_file, '-c', 'copy', OUTPUT_VIDEO], check=True)
        return

    if not os.path.exists(SRC_SRT) or not os.path.exists(TRANS_SRT):
        raise FileNotFoundError("Subtitle files not found in the 'output' directory")

    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', video_file],
        check=True, capture_output=True, text=True,
    )
    dimensions = json.loads(result.stdout)['streams'][0]
    TARGET_WIDTH, TARGET_HEIGHT = int(dimensions['width']), int(dimensions['height'])
    rprint(f"[bold green]Video resolution: {TARGET_WIDTH}x{TARGET_HEIGHT}[/bold green]")

    ffmpeg_gpu = load_key("ffmpeg_gpu")
    if ffmpeg_gpu:
        rprint("[bold green]will use GPU acceleration.[/bold green]")

    # The built-in typesetting first; the plain subtitles filter if this ffmpeg can not burn it
    subtitle_filters = get_subtitle_filter_candidates('subtitle', SRC_SRT, TRANS_SRT, TARGET_WIDTH, TARGET_HEIGHT)
    for attempt, subtitle_filter in enumerate(subtitle_filters):
        ffmpeg_cmd = [
            'ffmpeg', '-nostdin', '-i', video_file,
            '-vf', (
                f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease,"
                f"pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
                f"{subtitle_filter}"
            ),
        ]
        if ffmpeg_gpu:
            ffmpeg_cmd.extend(['-c:v', 'h264_nvenc'])
        ffmpeg_cmd.extend(['-y', OUTPUT_VIDEO])

        rprint("🎬 Start merging subtitles to video...")
        start_time = time.time()
        process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.DEVNULL)

        try:
            process.wait()
            if process.returncode == 0:
                rprint(f"\n✅ Done! Time taken: {time.time() - start_time:.2f} seconds")
                return
            raise subprocess.CalledProcessError(process.returncode, ffmpeg_cmd)
        except subprocess.CalledProcessError as e:
            check_cancel()
            if attempt + 1 < len(subtitle_filters):
                rprint("[yellow]⚠️ Burning the typeset subtitles failed, trying the plain subtitles filter...[/yellow]")
                continue
            rprint(f"\n❌ Error occurred: {e}")
            raise
        except BaseException as e:
            rprint(f"\n❌ Error occurred: {e}")
            if process.poll() is None:
                process.kill()
            raise


if __name__ == "__main__":
    merge_subtitles_to_video()

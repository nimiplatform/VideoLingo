import os
from importlib.util import find_spec
import pandas as pd
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn
import soundfile as sf
from core.utils import *
from core.utils.config_utils import load_key_or
from core.utils.models import *

console = Console()


def time_to_samples(time_str, sr):
    """Unified time conversion function"""
    h, m, s = time_str.split(':')
    s, ms = s.split(',') if ',' in s else (s, '0')
    seconds = int(h) * 3600 + int(m) * 60 + float(s) + float(ms) / 1000
    return int(seconds * sr)


def extract_audio(reader, sr, start_time, end_time, out_file):
    """Simplified audio extraction function"""
    start = time_to_samples(start_time, sr)
    end = time_to_samples(end_time, sr)
    if not (0 <= start < end <= reader.frames):
        raise ValueError('Reference crop is outside the actual vocal audio')
    reader.seek(start)
    with sf.SoundFile(out_file, 'w', samplerate=sr, channels=reader.channels, subtype='PCM_16') as writer:
        remaining = end - start
        while remaining:
            block = reader.read(min(65536, remaining), dtype='float64', always_2d=True)
            if not len(block):
                raise ValueError('Reference audio ended before its requested crop')
            writer.write(block)
            remaining -= len(block)


def extract_refer_audio_main():
    if os.path.isfile(_VOCAL_AUDIO_FILE):
        reference_audio = _VOCAL_AUDIO_FILE
    elif load_key_or('nimi_tts', None) is not None:
        raise RuntimeError("Complete Nimi source separation before extracting reference audio")
    elif find_spec("demucs") is not None:
        from core.asr_backend.demucs_vl import demucs_audio
        demucs_audio()
        reference_audio = _VOCAL_AUDIO_FILE
    else:
        rprint(Panel(
            "Vocal separation is unavailable; using the original audio for references. "
            "The dubbed video will not keep the original background sound.",
            title="Info", border_style="yellow",
        ))
        reference_audio = _RAW_AUDIO_FILE

    if os.path.exists(os.path.join(_AUDIO_REFERS_DIR, '1.wav')):
        rprint(Panel("Reference audio already exists, skipping extraction", title="Info", border_style="blue"))
        return

    os.makedirs(_AUDIO_REFERS_DIR, exist_ok=True)
    df = pd.read_excel(_8_1_AUDIO_TASK)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
    ) as progress, sf.SoundFile(reference_audio) as reader:
        task = progress.add_task("Extracting audio segments...", total=len(df))

        for _, row in df.iterrows():
            out_file = os.path.join(_AUDIO_REFERS_DIR, f"{row['number']}.wav")
            extract_audio(reader, reader.samplerate, row['start_time'], row['end_time'], out_file)
            progress.update(task, advance=1)

    rprint(Panel(f"Audio segments saved to {_AUDIO_REFERS_DIR}", title="Success", border_style="green"))


if __name__ == "__main__":
    extract_refer_audio_main()

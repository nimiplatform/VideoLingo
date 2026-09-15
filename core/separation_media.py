"""Receive and assemble actual separated audio without changing its timeline."""
import math
from pathlib import Path

import numpy as np
import soundfile as sf


def inspect_pair(chunk, workspace):
    paths = [Path(chunk[name]).resolve(strict=True) for name in ("vocals", "background")]
    for path in paths:
        path.relative_to(workspace)
    vocals, background = [sf.info(str(path)) for path in paths]
    if vocals.frames <= 0 or (vocals.frames, vocals.samplerate, vocals.channels) != (background.frames, background.samplerate, background.channels):
        raise ValueError("The two separation outputs are incomplete or have different timelines")
    if (vocals.samplerate, vocals.channels) != (chunk["sampleRateHz"], chunk["channels"]):
        raise ValueError("Separation artifact metadata disagrees with the received WAV audio")
    # Prepared inputs are PCM at 16 kHz; allow only sample quantization on resampling.
    tolerance = 1 / 16000 + 1 / vocals.samplerate
    if abs(vocals.duration - chunk["durationSeconds"]) > tolerance:
        raise ValueError("Separation changed the source duration")
    return vocals


def assemble_separation(request, workspace):
    chunks = request["chunks"]
    if not chunks:
        raise ValueError("No complete separation pairs were received")
    infos = [inspect_pair(chunk, workspace) for chunk in chunks]
    rate, channels = infos[0].samplerate, infos[0].channels
    if any((info.samplerate, info.channels) != (rate, channels) for info in infos):
        raise ValueError("Separation chunks use incompatible audio formats")
    expected_frames = round((chunks[-1]["offsetSeconds"] + chunks[-1]["durationSeconds"]) * rate)
    output = workspace / "separation"
    output.mkdir()
    format_name = "RF64" if expected_frames * channels * 4 > 0xFFFFFFFF - 4096 else "WAV"
    files = []
    for role in ("vocals", "background"):
        destination = output / f"{role}.wav"
        with sf.SoundFile(str(destination), "w", samplerate=rate, channels=channels, subtype="FLOAT", format=format_name) as writer:
            for chunk, info in zip(chunks, infos):
                start = round(chunk["offsetSeconds"] * rate)
                delta = start - writer.tell()
                if abs(delta) > math.ceil(rate / 16000) + 1:
                    raise ValueError("Separation chunks do not cover one continuous source timeline")
                if delta > 0:
                    writer.write(np.zeros((delta, channels), dtype=np.float32))
                elif delta < 0:
                    writer.seek(start)
                frames = 0
                with sf.SoundFile(chunk[role]) as reader:
                    for block in reader.blocks(blocksize=65536, dtype="float32", always_2d=True):
                        writer.write(block)
                        frames += len(block)
                if frames != info.frames:
                    raise ValueError("A separation audio stream ended before its declared frame count")
        files.append(str(destination))
    result = [sf.info(file) for file in files]
    if result[0].frames != result[1].frames:
        raise ValueError("Assembled vocals and background do not have the same duration")
    return {"vocalsFile": files[0], "backgroundFile": files[1], "sampleRateHz": rate, "channels": channels,
            "durationSeconds": result[0].duration, "frames": result[0].frames}

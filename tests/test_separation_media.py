"""Real WAV I/O tests for the deterministic receiver, not AI acceptance."""
from pathlib import Path
import tempfile
import unittest

import numpy as np
import soundfile as sf
from core.separation_media import assemble_separation


class SeparationMediaTests(unittest.TestCase):
    def pair(self, root, index, length=1600, background_length=None):
        vocals = root / f"v{index}.wav"
        background = root / f"b{index}.wav"
        sf.write(vocals, np.full((length, 2), 0.1, dtype=np.float32), 16000, subtype="FLOAT")
        sf.write(background, np.full((background_length or length, 2), 0.02, dtype=np.float32), 16000, subtype="FLOAT")
        return {"vocals": str(vocals), "background": str(background), "offsetSeconds": index * 0.1,
                "durationSeconds": 0.1, "sampleRateHz": 16000, "channels": 2}

    def test_pair_is_assembled_on_the_source_timeline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(strict=True)
            result = assemble_separation({"chunks": [self.pair(root, 0), self.pair(root, 1)]}, root)
            self.assertEqual(result["frames"], 3200)
            self.assertEqual(result["channels"], 2)
            self.assertEqual(sf.info(result["backgroundFile"]).frames, 3200)

    def test_missing_or_short_second_output_cannot_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(strict=True)
            pair = self.pair(root, 0, background_length=800)
            with self.assertRaises(ValueError):
                assemble_separation({"chunks": [pair]}, root)
            self.assertFalse((root / "separation").exists())

    def test_unexplained_chunk_gap_is_not_filled_with_invented_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(strict=True)
            first, second = self.pair(root, 0), self.pair(root, 1)
            second["offsetSeconds"] = 0.2
            with self.assertRaises(ValueError):
                assemble_separation({"chunks": [first, second]}, root)


if __name__ == "__main__":
    unittest.main()

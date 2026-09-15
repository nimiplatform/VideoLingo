"""Deterministic media fixtures; no model output or product inference claims."""
import os
from pathlib import Path
import tempfile
import unittest
import subprocess
import hashlib
from unittest.mock import patch
import numpy as np
import soundfile as sf
from pydub import AudioSegment
from core.asr_backend.audio_preprocess import split_audio, normalize_audio_volume
from core._9_refer_audio import extract_audio
from core._11_merge_audio import merge_audio_segments, process_audio_segment
from core.media_preview import compatible_preview, probe


class StreamedMediaTests(unittest.TestCase):
    def setUp(self):
        self.previous = Path.cwd()
        self.temp = tempfile.TemporaryDirectory(prefix='videolingo-media-test-')
        os.chdir(self.temp.name)

    def tearDown(self):
        os.chdir(self.previous)
        self.temp.cleanup()

    def test_window_decoding_preserves_original_silence_cut_positions(self):
        rate = 16000
        samples = (np.sin(np.arange(9 * rate) * (2 * np.pi * 200 / rate)) * .3)
        samples[int(2.8 * rate):4 * rate] = 0
        samples[int(6.1 * rate):int(7.3 * rate)] = 0
        sf.write('source.wav', samples, rate)
        original = AudioSegment.from_file
        def bounded(file, *args, **kwargs):
            self.assertFalse(isinstance(file, (str, Path)), 'The whole source must not be loaded')
            result = original(file, *args, **kwargs)
            self.assertLessEqual(len(result), 2001)
            return result
        with patch('core.asr_backend.audio_preprocess.AudioSegment.from_file', side_effect=bounded):
            parts = split_audio('source.wav', target_len=3, win=1)
        self.assertEqual(len(parts), 3)
        self.assertAlmostEqual(parts[0][1], 3.3, delta=.02)
        self.assertAlmostEqual(parts[1][1], 6.6, delta=.02)
        self.assertEqual(parts[-1][1], 9)
        self.assertEqual(parts[0][1], parts[1][0])

    def test_reference_read_is_bounded_and_matches_original_slice(self):
        samples = np.random.default_rng(4).uniform(-.5, .5, (190000, 2))
        sf.write('source.wav', samples, 16000, subtype='FLOAT')
        original_read = sf.SoundFile.read
        sizes = []
        def bounded(reader, frames=-1, *args, **kwargs):
            sizes.append(frames); self.assertTrue(0 < frames <= 65536)
            return original_read(reader, frames, *args, **kwargs)
        with sf.SoundFile('source.wav') as reader, patch.object(sf.SoundFile, 'read', bounded):
            extract_audio(reader, 16000, '00:00:01.000', '00:00:10.000', 'crop.wav')
        sf.write('expected.wav', samples.astype('float32')[16000:160000], 16000)
        self.assertTrue(sizes)
        self.assertEqual(Path('crop.wav').read_bytes(), Path('expected.wav').read_bytes())

    def test_streamed_normalization_matches_pcm16_gain(self):
        samples = np.random.default_rng(7).integers(-2000, 2000, (160000, 2), dtype='int16')
        sf.write('source.wav', samples, 16000)
        expected = AudioSegment.from_file('source.wav')
        expected = expected.apply_gain(-20 - expected.dBFS)
        normalize_audio_volume('source.wav', 'normalized.wav')
        result, _ = sf.read('normalized.wav', dtype='int16', always_2d=True)
        np.testing.assert_array_equal(result.reshape(-1), np.frombuffer(expected.raw_data, dtype=np.int16))

    def test_disk_concat_preserves_actual_clips_and_millisecond_gaps(self):
        rate = 16000
        for name, frames in [('a.wav', 2400), ('b.wav', 3200)]:
            sf.write(name, np.sin(np.arange(frames) * .1) * .2, rate)
        clips = [process_audio_segment(name) for name in ['a.wav', 'b.wav']]
        expected = AudioSegment.silent(duration=120, frame_rate=rate) + clips[0]
        expected += AudioSegment.silent(duration=180, frame_rate=rate) + clips[1]
        merge_audio_segments(['a.wav', 'b.wav'], [(.12, .27), (.45, .65)], rate, 'merged.wav')
        result, _ = sf.read('merged.wav', dtype='int16')
        np.testing.assert_array_equal(result, np.frombuffer(expected.raw_data, dtype=np.int16))

    def test_non_h264_mov_is_reencoded_with_its_source_unchanged(self):
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=10:duration=1',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000:duration=1', '-c:v', 'mpeg4', '-c:a', 'pcm_s16le', 'source.mov'], check=True)
        before = hashlib.sha256(Path('source.mov').read_bytes()).hexdigest()
        result = compatible_preview({'source': str(Path('source.mov').resolve())}, Path.cwd())
        self.assertFalse(result['videoCopied'])
        self.assertAlmostEqual(result['durationSeconds'], result['sourceDurationSeconds'], delta=.1)
        self.assertEqual(hashlib.sha256(Path('source.mov').read_bytes()).hexdigest(), before)
        streams = probe(result['file'])['streams']
        self.assertEqual({stream['codec_name'] for stream in streams}, {'h264', 'aac'})


if __name__ == '__main__':
    unittest.main()

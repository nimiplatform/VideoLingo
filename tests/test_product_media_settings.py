"""Real deterministic media/row processing; no ASR, TTS or model doubles."""
import os
from pathlib import Path
import tempfile
import unittest
import numpy as np
import soundfile as sf
from ruamel.yaml import YAML
from core.nimi_worker import prepare


class ProductMediaSettingsTests(unittest.TestCase):
    def setUp(self):
        self.previous = Path.cwd()
        self.temp = tempfile.TemporaryDirectory(prefix='videolingo-product-media-')
        self.root = Path(self.temp.name).resolve(); os.chdir(self.root)

    def tearDown(self):
        os.chdir(self.previous); self.temp.cleanup()

    def source(self, name, frequency):
        rate = 48000
        sf.write(name, .25 * np.sin(np.arange(rate) * 2 * np.pi * frequency / rate), rate)
        return str((self.root / name).resolve())

    def test_separation_retains_high_band_while_asr_uses_16k(self):
        source = self.source('source.wav', 12000)
        samples, source_rate = sf.read(source)
        sf.write(source, np.column_stack([samples, samples * .5]), source_rate)
        request = {'source': source, 'purpose': 'separation', 'businessSettings': {'audio': {'raw_sample_rate': 32000, 'raw_bitrate': '128k'}}}
        result = prepare(request, self.root)
        separated, rate = sf.read(result['chunks'][0]['file'])
        self.assertEqual(rate, 48000)
        self.assertEqual(separated.shape[1], 2)
        self.assertAlmostEqual(float(np.sqrt(np.mean(separated[:, 1] ** 2)) / np.sqrt(np.mean(separated[:, 0] ** 2))), .5, places=2)
        self.assertGreater(float(np.sqrt(np.mean(separated ** 2))), .1)
        self.assertLessEqual(Path(result['chunks'][0]['file']).stat().st_size, 32 * 1024 ** 2)
        request['purpose'] = 'transcription'
        result = prepare(request, self.root)
        asr, rate = sf.read(result['chunks'][0]['file'])
        self.assertEqual(rate, 16000)
        self.assertLess(float(np.sqrt(np.mean(asr ** 2))), .02)

    def test_vocal_enhancement_uses_vocals_with_original_source_time_span(self):
        source = self.source('source.wav', 440)
        vocals = self.source('vocals.wav', 880)
        result = prepare({'source': source, 'vocals': vocals}, self.root)
        samples, rate = sf.read(result['chunks'][0]['file'])
        frequency = np.fft.rfftfreq(len(samples), 1 / rate)[np.argmax(abs(np.fft.rfft(samples)))]
        self.assertAlmostEqual(float(frequency), 880, delta=2)
        self.assertEqual(result['chunks'][0]['offsetSeconds'], 0)
        self.assertAlmostEqual(result['chunks'][0]['durationSeconds'], 1, places=3)

    def test_original_dubbing_grouping_responds_to_duration_setting(self):
        Path('output/audio').mkdir(parents=True)
        srt = '1\n00:00:00,000 --> 00:00:01,000\nFirst\n\n2\n00:00:01,100 --> 00:00:02,100\nSecond\n'
        for name in ['src_subs_for_audio.srt', 'trans_subs_for_audio.srt']:
            Path('output/audio', name).write_text(srt, encoding='utf-8')
        settings = {'speed_factor': {'min': 1, 'accept': 1.2, 'max': 1.4}, 'min_subtitle_duration': 2.5}
        with open('config.yaml', 'w', encoding='utf-8') as file: YAML().dump(settings, file)
        from core._8_1_audio_task import process_srt
        self.assertEqual(len(process_srt()), 1)
        settings['min_subtitle_duration'] = .5
        with open('config.yaml', 'w', encoding='utf-8') as file: YAML().dump(settings, file)
        result = process_srt()
        self.assertEqual(len(result), 2)
        self.assertEqual(result.iloc[1]['start_time'], '00:00:01.100')


if __name__ == '__main__': unittest.main()

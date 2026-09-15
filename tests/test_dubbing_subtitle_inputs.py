import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd
from ruamel.yaml import YAML


class DubbingSubtitleInputTests(unittest.TestCase):
    def test_display_edit_does_not_replace_the_separate_spoken_input(self):
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                Path('output/audio').mkdir(parents=True)
                with open('config.yaml', 'w', encoding='utf-8') as file:
                    YAML().dump({'speed_factor': {'min': 1, 'accept': 1.2, 'max': 1.4},
                                 'min_subtitle_duration': 2.5, 'tolerance': 1.5}, file)
                header = '1\n00:00:00,000 --> 00:00:05,000\n'
                files = {'output/src.srt': 'Edited display source', 'output/trans.srt': '仅修改显示字幕',
                         'output/audio/src_subs_for_audio.srt': 'Original spoken source',
                         'output/audio/trans_subs_for_audio.srt': '保留配音台词'}
                for filename, text in files.items():
                    Path(filename).write_text(header + text + '\n', encoding='utf-8')
                from core._8_1_audio_task import gen_audio_task_main
                from core._8_2_dub_chunks import gen_dub_chunks
                from core.utils.models import _8_1_AUDIO_TASK
                gen_audio_task_main()
                # This test covers text ownership; media duration is independent.
                with patch('core._8_2_dub_chunks.get_audio_duration', return_value=5):
                    gen_dub_chunks()
                result = pd.read_excel(_8_1_AUDIO_TASK)
                self.assertEqual(result.iloc[0]['lines'], "['保留配音台词']")
                self.assertEqual(result.iloc[0]['src_lines'], "['Original spoken source']")
                self.assertEqual(result.iloc[0]['start_time'], '00:00:00.000')
                self.assertEqual(result.iloc[0]['end_time'], '00:00:05.000')
                for filename, text in files.items():
                    self.assertEqual(Path(filename).read_text(encoding='utf-8'), header + text + '\n')
            finally:
                os.chdir(previous)


if __name__ == '__main__':
    unittest.main()

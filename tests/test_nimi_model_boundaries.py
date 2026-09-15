import os
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from ruamel.yaml import YAML
from core.nimi_bridge import NimiRequestError
from core.tts_backend.tts_main import tts_main
from core.translate_lines import valid_translate_result
from core.nimi_annotation import Document, NimiLanguageAnalysis


class ModelBoundaryTests(unittest.TestCase):
    def test_single_character_requires_real_host_instead_of_silence(self):
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                with open('config.yaml', 'w', encoding='utf-8') as file:
                    YAML().dump({'nimi_tts': {'voice_kind': 'default'}}, file)
                with self.assertRaises(NimiRequestError):
                    tts_main('好', 'voice.wav', 1, None)
                self.assertFalse(Path('voice.wav').exists())
                with self.assertRaises(ValueError):
                    tts_main('!!!', 'voice.wav', 1, None)
                self.assertFalse(Path('voice.wav').exists())
            finally:
                os.chdir(previous)

    def test_malformed_translation_fields_fail_validation(self):
        self.assertEqual(valid_translate_result({'1': 'invalid'}, ['1'], ['origin', 'direct'])['status'], 'error')
        self.assertEqual(valid_translate_result({'1': {'direct': 'text'}}, ['1'], ['origin', 'direct'])['status'], 'error')

    def test_annotation_projection_uses_scalar_offsets_and_real_heads(self):
        # A mapping fixture only: this does not assert a model's linguistic output.
        source = '😀 a'
        value = {'text': source, 'language': 'en', 'tokens': [
            {'text': '😀', 'start': 0, 'end': 1, 'headIndex': 1, 'partOfSpeech': 'SYM', 'dependency': 'dep', 'isPunctuation': False},
            {'text': 'a', 'start': 2, 'end': 3, 'headIndex': 1, 'partOfSpeech': 'X', 'dependency': 'ROOT', 'isPunctuation': False}],
            'sentences': [{'startToken': 0, 'endToken': 2}]}
        doc = Document(value, source, 'en')
        self.assertEqual(doc[:1].text, '😀')
        self.assertEqual(doc.sents[0].text, source)
        self.assertIs(doc[0].head, doc[1])
        self.assertTrue(doc[1].is_sent_end)
        value['tokens'][1]['start'] = 3
        with self.assertRaises(ValueError):
            Document(value, source, 'en')

    def test_nlp_never_fabricates_missing_annotations(self):
        with self.assertRaises(ValueError):
            Document({'text': 'missing', 'language': 'en', 'tokens': [], 'sentences': []}, 'missing', 'en')
        with self.assertRaises(NimiRequestError):
            NimiLanguageAnalysis('en')('Real analysis requires the Host.')

    def test_reading_estimate_failure_preserves_cause_without_g2p(self):
        from core.tts_backend.estimate_duration import init_estimator
        estimator = init_estimator()
        cause = ValueError('dictionary failure')
        with patch('core.tts_backend.estimate_duration.syllables.estimate', side_effect=cause):
            with self.assertRaises(ValueError) as caught:
                estimator.count_syllables('hello', 'en')
        self.assertIs(caught.exception.__cause__, cause)
        self.assertFalse(hasattr(estimator, 'g2p_en'))

    def test_parallel_subtitle_refusal_is_not_swallowed(self):
        from core._5_split_sub import split_align_subs
        failure = NimiRequestError({'message': 'Denied', 'reasonCode': 'APP_AUTHORIZATION_DENIED'})
        settings = lambda key: {'max_length': 75, 'target_multiplier': 1.2} if key == 'subtitle' else 2
        with patch('core._5_split_sub.load_key', side_effect=settings), patch('core._5_split_sub.split_sentence', side_effect=failure):
            with self.assertRaises(NimiRequestError):
                split_align_subs(['x' * 80], ['翻译'])

    def test_first_reference_uses_first_transcript_for_later_lines(self):
        import pandas as pd
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                Path('output/audio/refers').mkdir(parents=True)
                # Existence-only fixture; the denied Host does not decode or accept it.
                Path('output/audio/refers/1.wav').write_bytes(b'not audio')
                Path('config.yaml').write_text('nimi_tts:\n  reference_mode: first\n', encoding='utf-8')
                df = pd.DataFrame({'number': [1, 2], 'origin': ['first source', 'second source']})
                failure = NimiRequestError({'message': 'Denied'})
                with patch('core.tts_backend.tts_main.request_model', side_effect=failure) as request:
                    with self.assertRaises(NimiRequestError):
                        tts_main('second translated line', 'voice.wav', 2, df)
                    self.assertEqual(request.call_args.args[1]['referenceText'], 'first source')
                    self.assertTrue(request.call_args.args[1]['referencePath'].endswith('1.wav'))
                self.assertFalse(Path('voice.wav').exists())
            finally:
                os.chdir(previous)

    def test_invalid_json_is_not_repaired_or_retried(self):
        from core.utils.ask_gpt import ask_gpt
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                Path('config.yaml').write_text('nimi_text_cache_key: negative-json-check\n', encoding='utf-8')
                with patch('core.utils.ask_gpt.request_model', return_value={'finishReason': 'stop', 'text': '```json\n{"x":1}\n```'}) as request:
                    with self.assertRaises(NimiRequestError):
                        ask_gpt('Request', resp_type='json')
                    self.assertEqual(request.call_count, 1)
                self.assertFalse(Path('output/gpt_log').exists())
            finally:
                os.chdir(previous)

    def test_failed_request_keeps_exact_prompt_and_error_without_success_cache(self):
        from core.utils.ask_gpt import ask_gpt
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                Path('config.yaml').write_text('nimi_text_cache_key: test-config\nnimi_persist_text_cache: true\n', encoding='utf-8')
                requests = []
                def request(kind, payload):
                    requests.append((kind, payload))
                    if kind == 'text':
                        raise NimiRequestError({'message': 'Invalid provider output', 'reasonCode': 'AI_OUTPUT_INVALID', 'traceId': 'failure-fixture'})
                    return {'saved': True}  # Persistence acknowledgment only, never an AI result.
                with patch('core.utils.ask_gpt.request_model', side_effect=request):
                    with self.assertRaises(NimiRequestError) as caught:
                        ask_gpt('Exact original prompt\nwith spacing.', resp_type='json', log_title='translate_faithfulness')
                self.assertIn('translate_faithfulness', str(caught.exception))
                self.assertEqual([kind for kind, _ in requests], ['text', 'checkpoint'])
                self.assertFalse(Path('output/gpt_log/translate_faithfulness.json').exists())
                error = json.loads(Path('output/gpt_log/error.json').read_text(encoding='utf-8'))[0]
                self.assertEqual(error['prompt'], 'Exact original prompt\nwith spacing.')
                self.assertIsNone(error['resp']); self.assertIsNone(error['resp_content'])
                self.assertEqual(error['failure']['traceId'], 'failure-fixture')
            finally:
                os.chdir(previous)


if __name__ == '__main__':
    unittest.main()

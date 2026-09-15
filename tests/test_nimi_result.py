import unittest
from core.asr_backend.nimi_result import source_language_for_business, transcript_to_segment


class NimiResultTests(unittest.TestCase):
    def result(self):
        return {"status": "transcribed", "language": "en", "text": "Sometimes you",
                "words": [{"text": "Sometimes", "startSeconds": 0, "endSeconds": 0.56},
                          {"text": "you", "startSeconds": 0.96, "endSeconds": 1.2}]}

    def test_source_offset_is_added_once_and_pause_retained(self):
        segment = transcript_to_segment(self.result(), 12.5, 2)
        self.assertEqual(segment["words"][0]["start"], 12.5)
        self.assertEqual(segment["words"][0]["end"], 13.06)
        self.assertEqual(segment["words"][1]["start"], 13.46)

    def test_missing_time_is_not_borrowed_from_previous_word(self):
        value = self.result()
        del value["words"][1]["startSeconds"]
        with self.assertRaises(ValueError):
            transcript_to_segment(value, 0, 2)

    def test_model_zero_length_units_are_not_inflated(self):
        value = self.result()
        value["words"][1]["endSeconds"] = 0.96
        unit = transcript_to_segment(value, 0, 2)["words"][1]
        self.assertEqual(unit["start"], unit["end"])

    def test_only_explicit_no_speech_is_empty_success(self):
        self.assertIsNone(transcript_to_segment({"status": "no-speech", "text": "", "language": "", "words": []}, 0, 2))
        with self.assertRaises(ValueError):
            transcript_to_segment({"status": "transcribed", "text": "", "language": "en", "words": []}, 0, 2)

    def test_unreported_language_stays_empty_with_an_explicit_source_choice(self):
        value = self.result(); value['language'] = ''
        segment = transcript_to_segment(value, 10, 2, 'en')
        self.assertEqual(segment['language'], '')
        self.assertEqual(segment['words'][0]['start'], 10)
        self.assertEqual(source_language_for_business('en', ['en', '']), 'en')

    def test_auto_or_unsupported_report_is_not_relabelled(self):
        value = self.result(); value['language'] = ''
        with self.assertRaises(ValueError):
            transcript_to_segment(value, 0, 2)
        value['language'] = 'unsupported'
        with self.assertRaises(ValueError):
            transcript_to_segment(value, 0, 2, 'en')
        with self.assertRaises(ValueError):
            source_language_for_business('', ['en', ''])
        with self.assertRaises(ValueError):
            source_language_for_business('', ['en', 'fr'])

    def test_consumer_keeps_language_reports_separate_from_business_language(self):
        from pathlib import Path
        import tempfile
        from core.nimi_worker import consume
        value = self.result(); value['language'] = ''
        with tempfile.TemporaryDirectory() as directory:
            result = consume({'sourceLanguageHint': 'en', 'chunks': [
                {'transcription': self.result(), 'offsetSeconds': 0, 'durationSeconds': 2},
                {'transcription': value, 'offsetSeconds': 2, 'durationSeconds': 2}]}, Path(directory))
            self.assertEqual(result['language'], '')
            self.assertEqual(result['sourceLanguage'], 'en')
            self.assertEqual(result['reportedLanguages'], ['en'])
            self.assertEqual(result['unreportedLanguageChunks'], 1)
            self.assertEqual(result['wordCount'], 4)


if __name__ == "__main__":
    unittest.main()

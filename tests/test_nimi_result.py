import unittest
from core.asr_backend.nimi_result import transcript_to_segment


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


if __name__ == "__main__":
    unittest.main()

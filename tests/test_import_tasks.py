"""Real workbook parsing and ordinary download configuration; no AI results."""
from pathlib import Path
import tempfile
import unittest
from openpyxl import Workbook
from core.import_tasks import read_task_sheet

HEADER = ['Video File', 'Source Language', 'Target Language', 'Dubbing', 'Status']


class TaskSheetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='videolingo-sheet-test-')
        self.root = Path(self.temp.name).resolve()

    def tearDown(self):
        self.temp.cleanup()

    def read(self, rows, header=HEADER):
        book = Workbook(); sheet = book.active
        sheet.append(header)
        for row in rows:
            sheet.append(row)
        file = self.root / 'tasks.xlsx'; book.save(file); book.close()
        return read_task_sheet({'file': str(file)}, self.root)['rows']

    def test_original_columns_and_status_are_preserved_without_claiming_completion(self):
        rows = self.read([
            ['demo.mp4', 'en', 'French', 1, None],
            ['https://example.com/media.mp4', 'auto', None, 0, 'Done'],
            ['another.mp4', 'zh', 'English', None, 'Error: missing media'],
        ])
        self.assertEqual([row['row'] for row in rows], [2, 3, 4])
        self.assertEqual([row['selected'] for row in rows], [True, False, True])
        self.assertTrue(rows[0]['dubbing']); self.assertFalse(rows[2]['dubbing'])
        self.assertEqual(rows[0]['targetLanguage'], 'French')
        self.assertEqual(rows[1]['sourceLanguage'], '')
        self.assertTrue(rows[1]['sourceLanguageSpecified'])
        self.assertEqual(rows[1]['status'], 'Done')
        self.assertTrue(rows[1]['isUrl'])

    def test_formula_and_out_of_scope_paths_are_refused_with_row_number(self):
        for name in ['../outside.mp4', 'C:\\outside.mp4', '=HYPERLINK("https://example.com","clip")']:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Row 2'):
                self.read([[name, 'en', 'French', 0, None]])

    def test_dubbing_values_are_not_truncated_to_a_different_choice(self):
        with self.assertRaisesRegex(ValueError, 'Dubbing must be 0 or 1'):
            self.read([['clip.mp4', 'en', '', 1.5, None]])

    def test_blank_source_language_inherits_instead_of_becoming_an_explicit_auto_hint(self):
        rows = self.read([['clip.mp4', None, None, 0, None]])
        self.assertFalse(rows[0]['sourceLanguageSpecified'])

    def test_missing_or_duplicate_headers_and_invalid_urls_fail(self):
        with self.assertRaisesRegex(ValueError, 'Expected one of each'):
            self.read([['clip.mp4']], ['Video File'])
        with self.assertRaisesRegex(ValueError, 'Expected one of each'):
            self.read([['clip.mp4']], [*HEADER, 'Status'])
        with self.assertRaisesRegex(ValueError, 'invalid media URL'):
            self.read([['http:clip', 'en', '', 0, None]])


if __name__ == '__main__':
    unittest.main()

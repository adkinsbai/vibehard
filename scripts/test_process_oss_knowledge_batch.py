import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('knowledge_batch', ROOT / 'process-oss-knowledge-batch.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class KnowledgeBatchRulesTests(unittest.TestCase):
    def test_zip_paths_and_text_selection(self):
        self.assertFalse(batch.safe_zip_name('../secret.pdf'))
        self.assertFalse(batch.safe_zip_name('/absolute.pdf'))
        self.assertFalse(batch.safe_zip_name('C:\\absolute.pdf'))
        self.assertTrue(batch.safe_zip_name('board/docs/manual.pdf'))
        self.assertTrue(batch.eligible_text_name('Board/README_ZH.md', 500))
        self.assertFalse(batch.eligible_text_name('Board/libraries/example/README.md', 500))
        self.assertFalse(batch.eligible_text_name('Board/CMakeLists.txt', 500))

    def test_chunking_is_bounded_and_overlaps(self):
        parts = list(batch.chunk_text('ESP32-S3 ' * 500, limit=200, overlap=20))
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(len(text) <= 200 for _, _, text in parts))
        self.assertTrue(all(parts[i + 1][0] < parts[i][1] for i in range(len(parts) - 1)))

    def test_auto_review_rejects_possible_secret(self):
        source = {'parent': {'key': 'knowledge/raw/v1/test/asset/digest', 'sha256': 'a' * 64},
                  'relative': 'board/manual.pdf', 'kind': 'direct'}
        pages = [{'page': 1, 'text': 'board notes ' * 30 + 'API_KEY=sk-123456789012345678901234',
                  'method': 'embedded_text', 'ocr_error': None}]
        result = batch.review_document(source, 'b' * 64, pages, 0, 0)
        self.assertEqual(result['review']['status'], 'quarantine')
        self.assertIn('possible_secret', result['review']['flags'])
        self.assertEqual(result['chunks'], [])
        self.assertFalse(result['review']['manualReview'])

    def test_auto_review_keeps_provenance_and_page(self):
        source = {'parent': {'key': 'knowledge/raw/v1/test/asset/digest', 'sha256': 'a' * 64},
                  'relative': 'board/manual.pdf', 'kind': 'direct'}
        pages = [{'page': 9, 'text': 'ESP32-S3 GPIO reference details. ' * 20,
                  'method': 'local_vision_ocr', 'ocr_error': None}]
        result = batch.review_document(source, 'b' * 64, pages, 1, 1)
        self.assertEqual(result['schema'], 'vibehard-processed-document/v1')
        self.assertEqual(result['review']['status'], 'auto_approved_for_index')
        self.assertEqual(result['chunks'][0]['page'], 9)
        self.assertEqual(result['chunks'][0]['method'], 'local_vision_ocr')
        self.assertEqual(result['rawObjectKey'], source['parent']['key'])


if __name__ == '__main__':
    unittest.main()

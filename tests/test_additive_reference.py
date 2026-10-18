import json
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]


class ReferenceIntegrityTests(unittest.TestCase):
    def test_source_coverage_and_raw_claims_remain_distinct(self):
        data = json.loads((ROOT / 'reference/additive-source-assessments.json').read_text(encoding='utf-8'))
        self.assertEqual(len(data['entries']), 683)
        self.assertEqual(data['audit']['with_bibliography'], 207)
        self.assertEqual(data['audit']['with_source_flags'], 198)
        self.assertEqual(data['audit']['duplicate_canonical_codes'], 0)
        self.assertEqual(data['audit']['unsafe_url_count'], 0)
        self.assertEqual(data['entries']['GEN_13']['identity_status'], 'unresolved_generic')
        self.assertIn('GEN_13', data['audit']['unresolved_product_codes'])
        self.assertIsNone(data['entries']['E471']['source_description_text'])
        self.assertEqual(data['entries']['E471']['source_assessment']['dangerousnessLevel'], 1)
        self.assertEqual(data['entries']['E471']['danger_level_interpretation'], 'opaque_source_value_not_mapped')

    def test_curated_claims_have_primary_sources_and_explicit_scope(self):
        data = json.loads((ROOT / 'reference/additive-evidence.json').read_text(encoding='utf-8'))
        self.assertEqual(len(data['entries']), 7)
        self.assertIn('not_assessable', data['product_risk'])
        for code, entry in data['entries'].items():
            self.assertIsInstance(entry['attention_flag'], bool)
            self.assertTrue(entry['sources'])
            self.assertTrue(all(s['url'].startswith('https://') and s['date'] for s in entry['sources']))
        self.assertEqual(data['entries']['E450']['adi']['expressed_as'], 'phosphorus')

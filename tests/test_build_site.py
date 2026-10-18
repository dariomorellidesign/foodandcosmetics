import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/build_site.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ProductPublicationTests(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

    def test_gtin_routes_preserve_leading_zeros_and_reject_traversal(self):
        self.assertTrue(builder.valid_gtin("0000000000000"))
        self.assertFalse(builder.valid_gtin("8015854330022"))
        self.assertFalse(builder.valid_gtin("８０１５８５４３３００２１"))
        self.assertIn("/000/00/0000000000000.json", builder.paths("food", "0000000000000")[1])
        with self.assertRaises(ValueError):
            builder.paths("../private", "8015854330021")

    def test_external_text_is_escaped_and_never_becomes_script(self):
        record = {
            "type": "food",
            "id": "sample",
            "barcode": "8015854330021",
            "data": {
                "name": '</script><script>alert("x")</script>',
                "fat": None,
                "grade": 0,
                "additives": ["GEN_13", "E471"],
            },
        }
        item = builder.projection(record, self.manifest, {})
        result = builder.product_html(item, self.manifest)
        self.assertNotIn('<script>alert("x")</script>', result)
        self.assertIn("&lt;/script&gt;", result)
        self.assertIn("GEN_13", result)
        self.assertIsNone(item["data"]["fat"])
        self.assertEqual(item["data"]["grade"], 0)
        self.assertFalse(item["assessment"]["label_verified"])

    def test_unknown_inci_is_preserved_and_empty_inventory_is_not_absence(self):
        record = {
            "type": "cosmetics",
            "id": "sample",
            "barcode": "8015854330021",
            "data": {"name": "A\ufffd", "ingredients": ["known", "missing"]},
        }
        item = builder.projection(record, self.manifest, {"known": {"inci": "Aqua"}})
        self.assertEqual(
            item["ingredient_details"], [{"id": "known", "inci": "Aqua"}, {"id": "missing"}]
        )
        self.assertTrue(any("replacement" in value for value in item["warnings"]))
        record["type"], record["data"] = "food", {"additives": []}
        item = builder.projection(record, self.manifest, {})
        self.assertFalse(item["assessment"]["additive_absence_verified"])
        self.assertTrue(any("Empty additive" in value for value in item["warnings"]))


if __name__ == "__main__":
    unittest.main()

import importlib.util
import json
import unittest
import tempfile
import hashlib
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

    def test_picture_is_bound_to_record_id_and_not_untrusted_raw_url(self):
        record={"type":"food","id":"abc123","barcode":"0000000000000","data":{"photo":"javascript:alert(1)"}}
        item=builder.projection(record,self.manifest,{}, {"abc123":"jpg"})
        self.assertEqual(item["image"]["url"],self.manifest["image_base_url"]+"/ab/abc123.jpg")
        self.assertFalse(item["image"]["current_label_verified"])
        self.assertNotIn('javascript:',builder.product_html(item,self.manifest))
        self.assertNotIn("image",builder.projection(record,self.manifest,{}))
        record["id"]="AbC123"
        self.assertIn('/ab/AbC123.jpg',builder.projection(record,self.manifest,{}, {"AbC123":"jpg"})["image"]["url"])

    def test_ranking_preserves_zero_excludes_missing_and_has_stable_ties(self):
        self.assertEqual(builder.eligible_grade({"grade":0}),0)
        for value in [None,True,"90",-1,101,float('nan')]:
            self.assertIsNone(builder.eligible_grade({"grade":value}))
        self.assertIsNone(builder.eligible_grade({"grade":90,"gradeForbidden":True}))
        rows=[{"barcode":"3","rating":0},{"barcode":"2","rating":80},
              {"barcode":"1","rating":80},{"barcode":"4","rating":None}]
        index=builder.category_index("food","sample",rows)
        self.assertEqual([x["barcode"] for x in index["best"]],["1","2","3"])
        self.assertEqual([x["barcode"] for x in index["worst"]],["3","1","2"])
        self.assertEqual(index["excluded_missing_or_unusable_rating"],1)
        self.assertEqual(index,builder.category_index("food","sample",list(reversed(rows))))

    def test_small_complete_site_has_no_home_examples_and_publishes_indexes(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);manifest=dict(self.manifest);manifest["barcode_page_counts"]={"food":1,"cosmetics":1}
            manifest["assets"]={k:dict(v) for k,v in self.manifest["assets"].items()}
            for kind in ("food","cosmetics"):
                name=kind+"-products.jsonl"
                row={"type":kind,"id":"abc123","barcode":"0000000000000","barcode_check_digit_valid":1,
                     "data":{"name":"Fixture","category":"fixture","grade":0,"ingredients":[],"additives":[]}}
                raw=(json.dumps(row)+"\n").encode();(folder/name).write_bytes(raw)
                manifest["assets"][name]["sha256"]=hashlib.sha256(raw).hexdigest()
            mp=folder/"manifest.json";mp.write_text(json.dumps(manifest))
            summary=builder.build(folder,folder/"site",mp)
            home=(folder/"site/index.html").read_text(encoding="utf-8")
            self.assertNotIn("Monster",home);self.assertNotIn("KoRo",home);self.assertNotIn("8015854330021",home)
            self.assertIn("Provenienza e limiti",home)
            index=json.loads((folder/"site/indexes/food/fixture.json").read_text())
            self.assertEqual(index["best"][0]["rating"],0)
            self.assertEqual(summary["published_products"],{"food":1,"cosmetics":1})


if __name__ == "__main__":
    unittest.main()

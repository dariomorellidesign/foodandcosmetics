"""Read-only, reproducible export of additive records; no medical interpretation."""
import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def canonical(value):
    if not isinstance(value, str):
        return None
    value = re.sub(r"[\s()-]", "", value.removeprefix("en:")).upper()
    return value if re.fullmatch(r"E[0-9]{3,4}[A-Z]*", value) else None


def export(database):
    with database.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    if digest != manifest["assets"]["products.sqlite"]["sha256"]:
        raise ValueError("Database hash does not match the declared source snapshot")
    taxonomy = json.loads((ROOT / "reference/additives.json").read_text(encoding="utf-8"))
    entries, duplicates, flags = {}, [], Counter()
    with sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True) as con:
        for (raw,) in con.execute("SELECT data_json FROM reference_records WHERE table_name='Additive' ORDER BY id"):
            source = json.loads(raw)
            code = canonical(source["code"]) or (source["code"] if re.fullmatch(r"GEN_[0-9]+", source["code"]) else None)
            if not code or code in entries:
                duplicates.append(source["code"])
                continue
            identity = taxonomy["entries"].get("en:" + code.lower(), {})
            entries[code] = {"code": code, "identity_status": "unresolved_generic" if code.startswith("GEN_") else "e_code", "names": identity.get("names", {}),
                             "functions": identity.get("classes", []),
                             "identity_source": taxonomy["source"],
                             "source_assessment": source,
                             "source_assessment_status": "not_independently_validated",
                             "source_description_text": None,
                             "danger_level_interpretation": "opaque_source_value_not_mapped"}
            flags.update(source.get("riskCharacterization", []))
        product_codes, missing_inventory, empty_inventory = Counter(), 0, 0
        for (raw,) in con.execute("SELECT additives_json FROM products WHERE type='food' AND barcode_check_digit_valid=1"):
            values = json.loads(raw) if raw else None
            if not isinstance(values, list):
                missing_inventory += 1
            elif not values:
                empty_inventory += 1
            else:
                product_codes.update(values)
    if duplicates:
        raise ValueError("Duplicate or invalid additive identity: " + repr(duplicates))
    refs = [s for e in entries.values() for s in e["source_assessment"].get("sources", [])]
    urls = {s.get("url") for s in refs if s.get("url")}
    unsafe = [u for u in urls if urlsplit(u).scheme not in {"https", "http"} or not urlsplit(u).hostname or urlsplit(u).username]
    audit = {"entries": len(entries), "with_bibliography": sum(bool(e["source_assessment"]["sources"]) for e in entries.values()),
             "with_source_flags": sum(bool(e["source_assessment"]["riskCharacterization"]) for e in entries.values()),
             "citation_records": len(refs), "unique_nonempty_source_urls": len(urls),
             "citations_without_url": sum(not s.get("url") for s in refs), "unsafe_url_count": len(unsafe),
             "source_flag_vocabulary": dict(sorted(flags.items())),
             "food_inventory_missing": missing_inventory, "food_inventory_empty_unverified": empty_inventory,
             "unresolved_product_codes": dict(sorted((k,v) for k,v in product_codes.items() if canonical(k) not in entries)),
             "duplicate_canonical_codes": 0, "description_translation_keys_are_not_text": True}
    return {"schema_version": "1.0", "version": "additive-source/1.0.0", "snapshot_date": manifest["snapshot_date"],
            "source": {"description": manifest["source"], "database_sha256": digest,
                       "url": manifest["assets"]["products.sqlite"]["url"], "table": "reference_records/Additive"},
            "audit": audit, "entries": dict(sorted(entries.items()))}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "reference/additive-source-assessments.json")
    args = parser.parse_args()
    result = export(args.database)
    args.output.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(result["audit"], ensure_ascii=True, indent=2))

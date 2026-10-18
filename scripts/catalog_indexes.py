"""Versioned, source-reported rankings. No new nutrition or risk score."""

import math

RULES_VERSION = "source-rating/1.0.0"
LIMIT = 100


def eligible_grade(data):
    value = data.get("grade")
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value) or not 0 <= value <= 100
            or data.get("gradeForbidden") is True):
        return None
    return value


def category_index(kind, category, products):
    eligible = [p for p in products if p["rating"] is not None]
    return {
        "schema_version": "1.0", "type": kind, "category": category,
        "rules_version": RULES_VERSION,
        "criterion": "source_reported_grade_not_recomputed",
        "scope": "exact_source_category_in_this_snapshot_only",
        "tie_break": "barcode_ascending",
        "total_products": len(products), "eligible_products": len(eligible),
        "excluded_missing_or_unusable_rating": len(products) - len(eligible),
        "best": sorted(eligible, key=lambda p: (-p["rating"], p["barcode"]))[:LIMIT],
        "worst": sorted(eligible, key=lambda p: (p["rating"], p["barcode"]))[:LIMIT],
    }

"""Query the supplied SQLite snapshot read-only; Python standard library only."""

import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--barcode", required=True)
    parser.add_argument("--type", choices=["food", "cosmetics"])
    args = parser.parse_args()
    if not args.barcode.isascii() or not args.barcode.isdigit():
        parser.error("Barcode must be a digit string; preserve leading zeros")
    query, values = "SELECT type,id,barcode,data_json FROM products WHERE barcode=?", [args.barcode]
    if args.type:
        query += " AND type=?"
        values.append(args.type)
    with closing(sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        db.execute("PRAGMA query_only=ON")
        db.execute("PRAGMA trusted_schema=OFF")
        rows = db.execute(query, values).fetchall()
    print(
        json.dumps(
            [{"type": t, "id": i, "barcode": b, "data": json.loads(d)} for t, i, b, d in rows],
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

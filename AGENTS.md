# Food & Cosmetics catalog

Publish readable static HTML/JSON from the supplied snapshot. Preserve barcode strings, source values, missingness and provenance. Never invent units, identities or risk scores. No credentials, local paths, runtime files or photos in Git. Original SQLite/JSONL files belong in Releases. Tests: `python -m unittest discover -s tests`. Build: `python scripts/build_site.py --data-dir PATH --output _site`.

# Food & Cosmetics catalog

Publish readable static HTML/JSON from the supplied snapshot. Preserve barcode strings, source values, missingness and provenance. Never invent units, identities or risk scores. No credentials, local paths, runtime files in Git. Product photos are in the separate image host repository, not this source repository. Original SQLite/JSONL files belong in Releases. Tests: `python -m unittest discover -s tests`. Build: `python scripts/build_site.py --data-dir PATH --output _site`.

Remote MCP: `cd plugin && pnpm install --frozen-lockfile && pnpm build && pnpm check && pnpm test`. Keep it cloud-only: never introduce a localhost fallback. The remote adapter reports source ratings, not the private backend nutrition classification. Version ranking semantics and retain explicit missingness/exclusions. MCP Apps resources must stay data-driven and safe against HTML/URL injection.

# Food & Cosmetics · Remote MCP and reports

**Mercato italiano:** catalogo pubblico parziale di alimenti e cosmetici reperibili
nel contesto italiano, non catalogo globale o completo né attestazione di origine
italiana. La fonte dei prodotti è l'istantanea del 18 ottobre 2026 identificata
dal [manifest](../manifest.json), non un database pubblico anonimo o un registro
ufficiale. Risposte e interfaccia sono in italiano.

Live endpoint: [HTTPS MCP](https://food-and-cosmetics-mcp.food-and-cosmetics-mcp.workers.dev/mcp). [Health](https://food-and-cosmetics-mcp.food-and-cosmetics-mcp.workers.dev/health).
The personal ChatGPT connection is named **Food & Cosmetics**. It uses this remote URL, not the previous local tunnel.


Small, read-only Cloudflare Worker that reads the public GitHub Pages catalog.
It has no dependency on a local computer, PostgreSQL, an OpenAI API key or the
private backend. TypeScript is used only for this stateless hosting adapter and
the MCP Apps interface; the existing Python scoring backend remains separate.

## Reproduce

Node.js 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
pnpm dev
```

`http://localhost:8787/mcp` is the local transport test endpoint, not a dependency
of the deployed service. `http://localhost:8787/health` reports the remote data
source. The catalog URL is fixed to the public repository; tool arguments cannot
select arbitrary hosts or fall back to the private database.

For deployment, sign in to a free Cloudflare account:

```sh
pnpm exec wrangler login --scopes account:read user:read workers_scripts:write
pnpm deploy
```

Use the printed HTTPS `/mcp` URL in a personal ChatGPT custom app, with no
authentication: every tool reads already public data. The app connection is
personal unless separately distributed; the public MCP URL can be used by
anyone who knows it. It never exposes the owner's local database. Do not put
private data into this public adapter. No model API calls are made here.

Keep the Workers **Free** plan. Its request and CPU limits apply; reaching them
can make the service unavailable. This setup does not activate a paid plan.
Credentials belong in the local CLI credential store, never in this repository.

## Tools

- `lookup_product(barcode, kind)` — complete source-reported snapshot.
- `analyze_product(barcode, kind)` — report data and limitations.
- `get_scoring_breakdown(barcode, kind)` — distinguishes reported grade from
  dimensions that cannot be recomputed; no invented component values.
- `compare_products(barcodes, kind)` — two to five products.
- `explain_ingredient(ingredient)` — E-code names/functions, original source
  assessments/bibliography, and selected independently checked primary-source
  summaries, ADIs, studies and limits. Exact INCI identity for cosmetics remains
  separate; food toxicology is not applied to cosmetic use.
- `get_product_sources(barcode, kind)` — dates, record ID, hashes and public URLs.
- `list_categories(query, kind)` — source category names and IDs, at most 40.
- `rank_category(category, kind, order, limit)` — best/worst within the snapshot.
- `find_better_alternatives(barcode, kind, limit)` — same exact category and a
  strictly higher reported grade.
- `render_product_report(view, barcodes, kind, category, order)` — interactive
  product cards, comparison, alternatives or ranking, fetched by the server.

`kind` is `food` (default) or `cosmetics`; `order` is `best` or `worst`.
Ranking, alternatives and graphical reports accept `additive_filter`:
`any`, `none_listed` or `no_flagged`, and `exclude_additives` (up to 20 exact
E-codes). Filtering uses every category member before sorting, not a truncated
top 100. Restrictive filters exclude missing inventories and unresolved codes.
Empty lists are allowed only as unverified source inventories. `no_flagged`
excludes source flags OR curated attention flags; it is a documented selection
heuristic, not a claim of no health risk. These filters reject cosmetics.
[Italian methodology, audit and examples](../ADDITIVES.md).
Use category IDs returned by `list_categories`, not a guessed translation.
All tools are read-only. Invalid GTINs are rejected before network access.
Barcode strings retain leading zeros. Not found and unavailable are distinct
errors. Missing ratings and forbidden/unusable grades never become zero.

## Visual report

The resource `ui://food-and-cosmetics/report-v2.html` uses the standard MCP Apps
MIME type `text/html;profile=mcp-app` and `_meta.ui.resourceUri`. It is bundled
locally, requires no external scripts/fonts and only loads pictures from the
catalog image host. Source strings are rendered with `textContent`; URLs are
validated. Buttons call server tools through the official app bridge.

The same interface can be inspected at `/report?preview=1&barcodes=GTIN`.
For comparisons use comma-separated codes. For a ranking use
`/report?preview=1&view=ranking&category=CATEGORY_ID&kind=food&order=best`.
`/api/report` is the public read-only JSON companion for that preview.
Preview filters use `&additive_filter=none_listed` or `no_flagged`, with optional
`&exclude_additives=E951,E250`. Reports include expandable additive dossiers and
distinct scientific/source sections. Knowledge version: `additive-knowledge/1.0.0`.
The preview is not proof of ChatGPT rendering: the ChatGPT client must support
MCP Apps and the connection must point to the deployed endpoint.

## Method and limitations

Ranking rule `source-rating/1.0.0`: exact category/type, finite numeric grade
0–100, no `gradeForbidden=true`; sort descending/ascending with barcode ascending
for ties. Indexes precompute 100 results per order. Counts include products
excluded for missing or unusable ratings. Alternative similarity is explicitly
our exact-category heuristic. A higher source grade does not establish individual
dietary suitability, absence of allergens, current availability or a verified
health benefit. The source grade algorithm is not independently reconstructed.

Food nutrition remains in unverified native units/bases. The food export lacks
full ingredient text; an empty additive list is not proof of absence. Ingredient
presence is not a risk conclusion; dose/exposure is unavailable. Product names
and category names preserve source spelling, including replacement characters.
The snapshot does not automatically refresh from Open Food Facts. The old
private Python backend still offers its separate, versioned nutrient rules;
those classifications must not be confused with these source-reported grades.

Transport tests exercise initialization, tool schemas, errors and UI resource
delivery; catalog tests mock public HTTP responses. Real network smoke tests
should additionally call a real product, ranking and the report resource after
each deployment.

Official references:
[ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui),
[MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/documents/Quickstart.html),
[Workers limits/pricing](https://developers.cloudflare.com/workers/platform/pricing/).

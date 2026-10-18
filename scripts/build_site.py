"""Build directly readable HTML/JSON product pages. Python standard library only."""

import argparse
import hashlib
import html
import json
import shutil
from pathlib import Path
from collections import defaultdict
try:
    from catalog_indexes import category_index, eligible_grade
except ModuleNotFoundError:
    from scripts.catalog_indexes import category_index, eligible_grade

ROOT = Path(__file__).resolve().parents[1]
STYLE = """body{font:17px/1.6 system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;color:#18332c;background:#fafbf8}a{color:#075b45}header{border-bottom:1px solid #ccd8d0;padding-bottom:20px}h1{line-height:1.2;font-size:2.3rem}h2{margin-top:2rem}small,.muted{color:#53655d}.note{background:#f0f2e7;border-left:4px solid #8f9e58;padding:14px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:9px;border-bottom:1px solid #dbe2db;vertical-align:top}code{overflow-wrap:anywhere}input,select,button{font:inherit;padding:10px;margin:5px 0}input{max-width:100%;box-sizing:border-box}button{background:#075b45;color:white;border:0;border-radius:4px}nav{display:flex;gap:20px;flex-wrap:wrap}footer{margin-top:40px;border-top:1px solid #ccd8d0;padding-top:20px}li{margin-bottom:6px}.product-photo{float:right;margin:0 0 20px 24px;width:240px}.product-photo img{object-fit:contain;background:white;border-radius:12px}.product-photo figcaption{font-size:12px;color:#53655d}@media(max-width:600px){.product-photo{float:none;margin:16px 0}}"""
NUTRIENTS = {
    "calories": "Energia (calories)",
    "fat": "Grassi (fat)",
    "saturatedFat": "Grassi saturi (saturatedFat)",
    "sugar": "Zuccheri (sugar)",
    "sodium": "Sodio (sodium)",
    "proteins": "Proteine (proteins)",
    "fibers": "Fibre (fibers)",
    "fruits": "Quota vegetale (fruits)",
}


def encode(value):
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    )


def esc(value):
    return html.escape(str(value), quote=True)


def valid_gtin(code):
    if (
        not isinstance(code, str)
        or len(code) not in (8, 12, 13, 14)
        or not code.isascii()
        or not code.isdigit()
    ):
        return False
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(code[-2::-1]))
    return (10 - total % 10) % 10 == int(code[-1])


def paths(kind, code):
    if kind not in ("food", "cosmetics") or not valid_gtin(code):
        raise ValueError("Invalid product route")
    tail = f"{kind}/{code[:3]}/{code[3:5]}/{code}"
    return f"products/{tail}.html", f"data/{tail}.json"


def page(title, body, base, canonical, description="", structured=None, json_url=None):
    ld = ""
    if structured:
        ld = (
            '<script type="application/ld+json">'
            + encode(structured).replace("<", "\\u003c")
            + "</script>"
        )
    alternate = (
        f'<link rel="alternate" type="application/json" href="{esc(json_url)}">' if json_url else ""
    )
    return f'''<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · Food &amp; Cosmetics</title><meta name="description" content="{esc(description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="{esc(base + "/" + canonical)}">{alternate}<link rel="stylesheet" href="{esc(base)}/style.css">{ld}</head><body><header><a href="{esc(base)}/">Food &amp; Cosmetics</a><p class="muted">Mercato italiano · HTML e JSON</p></header><main>{body}</main><footer><a href="{esc(base)}/about.html">Provenienza e limiti</a> · <a href="{esc(base)}/manifest.json">Manifest</a> · <a href="{esc(base)}/llms.txt">Accesso per AI</a></footer></body></html>'''


def projection(record, manifest, ingredients, images=None):
    data = record["data"]
    result = {
        "schema_version": "1.1",
        "type": record["type"],
        "barcode": record["barcode"],
        "record_id": record["id"],
        "barcode_check_digit_valid": True,
        "source": {
            "name": manifest["source"],
            "snapshot_date": manifest["snapshot_date"],
            "record_updated_at": data.get("updated"),
            "original_sqlite_sha256": manifest["assets"]["products.sqlite"]["sha256"],
        },
        "data": data,
        "assessment": {
            "label_verified": False,
            "units_and_basis": "unverified_source_native_values",
            "rating": "source_reported_not_recomputed",
            "additive_absence_verified": False,
        },
        "warnings": [],
    }
    image_ext = (images or {}).get(str(record["id"]))
    identifier = str(record["id"])
    if image_ext in ("jpg", "png", "gif", "webp") and identifier.isascii() and identifier.isalnum():
        result["image"] = {
            "url": manifest["image_base_url"] + "/" + identifier[:2].lower() + "/" + identifier + "." + image_ext,
            "origin": "same_snapshot_product_id", "current_label_verified": False,
        }
    if record["type"] == "cosmetics":
        result["ingredient_details"] = [
            {"id": key, **{k: v for k, v in ingredients.get(key, {}).items() if v is not None}}
            for key in data.get("ingredients", [])
        ]
    else:
        result["warnings"].append(
            "Full ingredient label unavailable"
        )
        if not data.get("additives"):
            result["warnings"].append("Empty additive list: absence unverified")
    if "\ufffd" in encode(data):
        result["warnings"].append(
            "Source text contains replacement characters"
        )
    return result


def product_html(item, manifest):
    base = manifest["site_url"]
    data, code, kind = item["data"], item["barcode"], item["type"]
    hp, jp = paths(kind, code)
    name = data.get("name") or "Nome non disponibile"
    brand = data.get("brand") or "Marca non disponibile"
    rows = (
        "".join(
            f"<tr><th>{esc(label)}</th><td>{esc(data.get(key)) if data.get(key) is not None else 'Non disponibile'}</td></tr>"
            for key, label in NUTRIENTS.items()
        )
        if kind == "food"
        else ""
    )
    if kind == "food":
        codes = data.get("additives") or []
        inventory = (
            "<ul>" + "".join(f"<li><code>{esc(x)}</code></li>" for x in codes) + "</ul>"
            if codes
            else "<p>Elenco vuoto nella fonte; assenza non verificata.</p>"
        )
        details = f'<h2>Valori nutrizionali della fonte</h2><p class="note">Unità e basi native non validate; verificare la confezione. Nessun nuovo punteggio.</p><p>Formato dichiarato: <code>{esc(data.get("nutritionFactsFormat"))}</code></p><table>{rows}</table><h2>Additivi riportati</h2>{inventory}<p>Codici della fonte, senza deduzioni sul rischio. Eventuali GEN restano non risolti. Il testo integrale degli ingredienti non è incluso.</p>'
    else:
        details = (
            "<h2>Ingredienti / INCI riportati</h2><ul>"
            + "".join(
                f"<li>{esc(x.get('inci') or x['id'])} <small>({esc(x['id'])})</small></li>"
                for x in item.get("ingredient_details", [])
            )
            + "</ul><p>I nomi INCI sono collegati ai riferimenti della stessa istantanea. Identità mancanti restano identificate dal codice originale.</p>"
        )
    warn = "".join(f"<li>{esc(w)}</li>" for w in item["warnings"])
    picture = (
        f'<figure class="product-photo"><img src="{esc(item["image"]["url"])}" alt="Foto della scheda: {esc(name)}" width="240" height="240" loading="lazy" referrerpolicy="no-referrer"><figcaption>Foto dell’istantanea.</figcaption></figure>'
        if item.get("image") else '<p class="muted">Foto non disponibile nell’istantanea.</p>'
    )
    body = f'<h1>{esc(name)}</h1>{picture}<p>{esc(brand)} · <strong>{esc(code)}</strong></p><nav><a href="{esc(manifest["report_base_url"] + "?preview=1&barcodes=" + code + "&kind=" + kind)}">Apri report grafico</a><a href="{esc(base + "/" + jp)}">Leggi i dati JSON</a><a href="{esc(manifest["release_url"])}">Scarica il dataset completo</a></nav><p>Categoria della fonte: <code>{esc(data.get("category"))}</code></p><p>Ultimo aggiornamento dichiarato della scheda: {esc(data.get("updated"))}<br>Istantanea acquisita: {esc(manifest["snapshot_date"])}</p><p>Voto riportato dalla fonte: <strong>{esc(data.get("grade")) if data.get("grade") is not None else "non disponibile"}</strong>. Non ricalcolato da questo sito e distinto da una nostra valutazione.</p>{details}<h2>Qualità e provenienza</h2><ul>{warn}<li>Confezione attuale non verificata. Nessuna valutazione individuale di dose, esposizione o rischio.</li></ul><p>Record: <code>{esc(item["record_id"])}</code><br>Fonte: istantanea offline italiana.</p>'
    structured = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": name,
        "identifier": code,
        "gtin" + str(len(code)): code,
        "url": base + "/" + hp,
    }
    if item.get("image"):
        structured["image"] = item["image"]["url"]
    if data.get("brand"):
        structured["brand"] = {"@type": "Brand", "name": data["brand"]}
    return page(
        name + " — " + code,
        body,
        base,
        hp,
        f"{name}, {brand}, barcode {code}. Dati dichiarati dalla fonte, provenienza e JSON consultabile.",
        structured,
        base + "/" + jp,
    )


def write(output, relative, body):
    path = output / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8", newline="\n")


def build(data_dir, output, manifest_path=ROOT / "manifest.json"):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    ingredients = json.loads((ROOT / "reference/ingredients.json").read_text(encoding="utf-8"))
    images = json.loads((ROOT / "reference/images.json").read_text(encoding="utf-8"))
    category_names = json.loads((ROOT / "reference/categories.json").read_text(encoding="utf-8"))
    groups = defaultdict(list)
    base = manifest["site_url"]
    totals, excluded, urls, listings, seen = {}, {}, [], {}, set()
    for kind in ("food", "cosmetics"):
        source = data_dir / f"{kind}-products.jsonl"
        with source.open("rb") as stream:
            if (
                hashlib.file_digest(stream, "sha256").hexdigest()
                != manifest["assets"][source.name]["sha256"]
            ):
                raise ValueError("Source hash mismatch: " + source.name)
        totals[kind], excluded[kind], listings[kind] = 0, 0, []
        with source.open(encoding="utf-8") as stream:
            for line in stream:
                record = json.loads(line)
                code = record.get("barcode")
                if record.get("type") != kind:
                    raise ValueError("Mixed record type")
                if record.get("barcode_check_digit_valid") != 1 or not valid_gtin(code):
                    excluded[kind] += 1
                    continue
                if (kind, code) in seen:
                    raise ValueError("Duplicate product route")
                seen.add((kind, code))
                item = projection(record, manifest, ingredients, images)
                hp, jp = paths(kind, code)
                write(
                    output,
                    jp,
                    json.dumps(item, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False),
                )
                write(output, hp, product_html(item, manifest))
                category = record["data"].get("category")
                if isinstance(category, str) and category and all(c.isalnum() or c in "-_" for c in category) and category.isascii():
                    groups[(kind, category)].append({
                        "barcode": code, "name": record["data"].get("name"),
                        "brand": record["data"].get("brand"),
                        "rating": eligible_grade(record["data"]),
                        "image_url": item.get("image", {}).get("url"),
                        "url": base + "/" + hp,
                        "additives": record["data"].get("additives") if kind == "food" else None,
                    })
                totals[kind] += 1
                if totals[kind] % 10000 == 0:
                    print(f"Generated {kind}: {totals[kind]} HTML/JSON pairs", flush=True)
                urls.append(base + "/" + hp)
                listings[kind].append(
                    (code, record["data"].get("name") or "Nome non disponibile", hp)
                )
    categories = []
    for (kind, category), products in sorted(groups.items()):
        index = category_index(kind, category, products)
        write(output, f"indexes/{kind}/{category}.json", encode(index))
        categories.append({"type": kind, "id": category, "name": category_names.get(category, category),
                           "total_products": index["total_products"], "eligible_products": index["eligible_products"]})
    write(output, "indexes/categories.json", encode({"schema_version": "1.0", "categories": categories}))
    write(output, "reference/ingredients.json", encode(ingredients))
    shutil.copyfile(ROOT / "reference/additives.json", output / "reference/additives.json")
    for filename in ("additive-source-assessments.json", "additive-evidence.json"):
        shutil.copyfile(ROOT / "reference" / filename, output / "reference" / filename)
    source_additives = json.loads((ROOT / "reference/additive-source-assessments.json").read_text(encoding="utf-8"))
    evidence = json.loads((ROOT / "reference/additive-evidence.json").read_text(encoding="utf-8"))
    additive_links = []
    for code, entry in source_additives["entries"].items():
        review = evidence["entries"].get(code)
        name = (review or {}).get("name_it") or entry["names"].get("it") or entry["names"].get("en") or code
        body = f'<h1>{esc(code)} · {esc(name)}</h1><p>Mercato alimentare italiano · scheda additivo, non valutazione dei cosmetici.</p>'
        if review:
            body += '<h2>Valutazione verificata su fonti primarie</h2><p>' + esc(review["summary_it"]) + '</p><p>Verifica: ' + evidence["reviewed_at"] + '; selezione di fonti, non revisione sistematica esaustiva.</p>'
            if review.get("adi"):
                adi = review["adi"]
                body += f'<p>DGA: {adi["value"]} {esc(adi["unit"])}; espressa come {esc(adi["expressed_as"])}. Ambito: {esc(adi["scope"])}</p>'
            body += '<ul>' + ''.join(f'<li><a href="{esc(s["url"])}" rel="noreferrer">{esc(s["title"])}</a> · {esc(s["authority"])} · {esc(s["date"])}</li>' for s in review["sources"]) + '</ul>'
        else:
            body += '<p>Nessuna scheda scientifica indipendente ancora verificata per questo codice. Non significa assenza di rischi.</p>'
        raw = entry["source_assessment"]
        body += '<h2>Segnalazioni della fonte originale, non validate</h2><p>Le seguenti voci sono giudizi della fonte, non effetti clinici accertati. Non equivalgono a conclusioni EFSA/IARC. I testi descrittivi non sono disponibili: le chiavi di traduzione non sono descrizioni.</p><ul>' + ''.join('<li>' + esc(x) + '</li>' for x in raw["riskCharacterization"]) + '</ul>'
        if not raw["riskCharacterization"]:
            body += '<p>Nessuna segnalazione nel riferimento disponibile; non è una certificazione di sicurezza.</p>'
        body += '<details><summary>Bibliografia riportata dalla fonte (non verificata singolarmente)</summary><ul>'
        for ref in raw["sources"]:
            url = ref.get("url")
            label = esc(ref.get("label"))
            body += '<li>' + (f'<a href="{esc(url)}" rel="noreferrer">{label}</a>' if url and url.startswith(("https://", "http://")) else label + ' (URL mancante)') + f' · {esc(ref.get("year"))}</li>'
        body += '</ul></details><p>Dose, esposizione e rischio del singolo prodotto non disponibili.</p><p><a href="../reference/additive-source-assessments.json">Riferimenti originali e audit JSON</a> · <a href="../reference/additive-evidence.json">Schede verificate e metodologia JSON</a></p>'
        route = f"additives/{code}.html"
        write(output, route, page(code + " · " + name, body, base, route))
        urls.append(base + "/" + route)
        additive_links.append(f'<li><a href="{code}.html">{esc(code)} · {esc(name)}</a></li>')
    write(output, "additives/index.html", page("Archivio additivi", '<h1>Archivio additivi alimentari</h1><p>683 riferimenti della fonte; 7 schede verificate su fonti primarie. Segnalazioni, pericoli ed esposizione restano distinti.</p><ul>' + ''.join(additive_links) + '</ul>', base, "additives/index.html"))
    urls.append(base + "/additives/index.html")
    for kind, items in listings.items():
        items.sort()
        for offset in range(0, len(items), 1000):
            number = offset // 1000 + 1
            route = f"catalog/{kind}/{number}.html"
            prev = f'<a href="{number - 1}.html">Precedenti</a>' if offset else ""
            nxt = (
                f'<a href="{number + 1}.html">Successivi</a>' if offset + 1000 < len(items) else ""
            )
            entries = "".join(
                f'<li><a href="{base}/{hp}">{esc(name)}</a> · <code>{code}</code></li>'
                for code, name, hp in items[offset : offset + 1000]
            )
            write(
                output,
                route,
                page(
                    f"Catalogo {kind} · {number}",
                    f"<h1>Catalogo {kind}</h1><nav>{prev}{nxt}</nav><ul>{entries}</ul><nav>{prev}{nxt}</nav>",
                    base,
                    route,
                ),
            )
            urls.append(base + "/" + route)
    search = """<h2>Cerca per codice a barre</h2><form id="lookup"><label>Tipo <select id="kind"><option value="food">Alimento</option><option value="cosmetics">Cosmetico</option></select></label><br><label>Barcode <input id="barcode" inputmode="numeric" pattern="[0-9]{8,14}" required placeholder="Inserisci il codice a barre"></label> <button>Apri scheda</button><p id="error" role="status"></p></form><script>document.getElementById('lookup').onsubmit=function(e){e.preventDefault();const c=document.getElementById('barcode').value.trim(),k=document.getElementById('kind').value;if(![8,12,13,14].includes(c.length)||!/^[0-9]+$/.test(c)){document.getElementById('error').textContent='Inserisci un GTIN di 8, 12, 13 o 14 cifre.';return;}location.href='products/'+k+'/'+c.slice(0,3)+'/'+c.slice(3,5)+'/'+c+'.html';};</script>"""
    home = f'<h1>Alimenti e cosmetici del mercato italiano</h1><p>{totals["food"]:,} alimenti e {totals["cosmetics"]:,} cosmetici con GTIN valido. Catalogo parziale: non tutti i prodotti in commercio. Schede HTML leggibili senza JavaScript e JSON direttamente accessibili.</p>{search}<nav><a href="catalog/food/1.html">Sfoglia alimenti</a><a href="catalog/cosmetics/1.html">Sfoglia cosmetici</a><a href="additives/index.html">Archivio additivi e studi</a><a href="{manifest["release_url"]}">Download SQLite e JSONL non compressi</a></nav><p class="note">Istantanea della fonte del {manifest["snapshot_date"]}. Dati non verificati sulla confezione attuale; nessun nuovo punteggio sanitario calcolato. Le unità nutrizionali native richiedono verifica. I dati mancanti restano mancanti.</p>'
    write(
        output,
        "index.html",
        page(
            "Catalogo alimenti e cosmetici",
            home,
            base,
            "",
            "Catalogo parziale del mercato italiano: alimenti e cosmetici per barcode, HTML e JSON, fonti e limiti espliciti.",
        ),
    )
    about = "<h1>Provenienza e limiti</h1><p>Export dell’istantanea offline italiana fornito dal proprietario del repository, acquisito il 18 ottobre 2026. Progetto indipendente. Nomi, valutazioni e dati originali appartengono alle rispettive fonti; il sito non attribuisce una nuova licenza aperta ai dati di terzi.</p><p>Le schede HTML/JSON comprendono i record con GTIN valido. Le righe escluse per barcode mancante/non valido restano negli archivi originali della release. Le foto disponibili sono collegate tramite l’identificativo originale e ospitate separatamente; non certificano la confezione attuale. L’export alimentare non contiene il testo integrale degli ingredienti; gli elenchi vuoti non dimostrano assenza. I valori nutrizionali restano nei campi e nelle unità native non validate, senza conversioni. I voti sono riportati dalla fonte e non ricalcolati. INCI e nomi sono collegati tramite gli identificativi originali.</p><p>La data della scheda può essere precedente alla data dell’istantanea. I testi possono contenere caratteri sostitutivi già presenti nella fonte: non vengono inventate correzioni. Catalogo del mercato italiano, non attestazione di origine italiana dei prodotti. Il servizio MCP remoto consulta questi dati online e offre confronti e filtri su intere categorie. Il sito non offre ricerca per nome. Le schede additivi distinguono segnalazioni originali non validate e sette approfondimenti verificati su fonti primarie.</p>"
    write(output, "about.html", page("Provenienza e limiti", about, base, "about.html"))
    write(
        output,
        "404.html",
        page(
            "Scheda non presente",
            "<h1>Scheda non presente</h1><p>Il barcode può essere assente da questa istantanea o non valido. Controlla il tipo di prodotto e conserva gli zeri iniziali.</p>",
            base,
            "404.html",
        ),
    )
    write(output, "style.css", STYLE)
    urls += [base + "/", base + "/about.html"]
    parts = []
    for offset in range(0, len(urls), 45000):
        filename = f"sitemap-{offset // 45000 + 1}.xml"
        locs = "".join(f"<url><loc>{esc(url)}</loc></url>" for url in urls[offset : offset + 45000])
        write(
            output,
            filename,
            '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            + locs
            + "</urlset>",
        )
        parts.append(base + "/" + filename)
    write(
        output,
        "sitemap.xml",
        '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(f"<sitemap><loc>{esc(url)}</loc></sitemap>" for url in parts)
        + "</sitemapindex>",
    )
    write(output, "robots.txt", f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n")
    write(
        output,
        "llms.txt",
        f"# Food & Cosmetics\n\nPublic partial catalog for the ITALIAN food and cosmetics market (IT). Not a complete/global product register. Source: owner-supplied offline snapshot dated 2026-10-18; originals and SHA-256 in manifest.\n\n- HTML: {base}/products/{{type}}/{{barcode[0:3]}}/{{barcode[3:5]}}/{{barcode}}.html\n- JSON: {base}/data/{{type}}/{{barcode[0:3]}}/{{barcode[3:5]}}/{{barcode}}.json\n- Additive dossiers: {base}/additives/index.html; selected primary-source summaries: {base}/reference/additive-evidence.json; original unvalidated source assessments: {base}/reference/additive-source-assessments.json.\n- MCP category filters: none_listed means empty unverified inventory; no_flagged means no flags in available references, never risk-free; exclude_additives accepts exact E-codes. Unknown inventories/codes excluded; full category filtered before sorting.\n- Types: food, cosmetics. Preserve barcode strings and leading zeros.\n- OpenAPI: {base}/openapi.json\n- Manifest: {base}/manifest.json\n- Source-native units/bases unverified. No new risk score. Missing values are not zero or proof of absence. Source-reported grades are not recomputed.\n- Full noncompressed datasets: {manifest['release_url']}\n",
    )
    write(output, ".nojekyll", "")
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(manifest_path, output / "manifest.json")
    if (ROOT / "openapi.json").exists():
        shutil.copyfile(ROOT / "openapi.json", output / "openapi.json")
    summary = {
        "published_products": totals,
        "excluded_from_barcode_pages": excluded,
        "html_urls_in_sitemaps": len(urls),
        "source_assets_sha256_verified": True,
        "additive_source_entries": len(source_additives["entries"]),
        "independently_reviewed_additives": len(evidence["entries"]),
    }
    if totals != manifest["barcode_page_counts"]:
        raise ValueError("Published record counts differ from manifest")
    write(output, "build-summary.json", encode(summary))
    print(encode(summary), flush=True)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("_site"))
    args = parser.parse_args()
    build(args.data_dir, args.output)

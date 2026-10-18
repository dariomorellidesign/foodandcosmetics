"""Build directly readable HTML/JSON product pages. Python standard library only."""

import argparse
import hashlib
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLE = """body{font:17px/1.6 system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;color:#18332c;background:#fafbf8}a{color:#075b45}header{border-bottom:1px solid #ccd8d0;padding-bottom:20px}h1{line-height:1.2;font-size:2.3rem}h2{margin-top:2rem}small,.muted{color:#53655d}.note{background:#f0f2e7;border-left:4px solid #8f9e58;padding:14px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:9px;border-bottom:1px solid #dbe2db;vertical-align:top}code{overflow-wrap:anywhere}input,select,button{font:inherit;padding:10px;margin:5px 0}input{max-width:100%;box-sizing:border-box}button{background:#075b45;color:white;border:0;border-radius:4px}nav{display:flex;gap:20px;flex-wrap:wrap}footer{margin-top:40px;border-top:1px solid #ccd8d0;padding-top:20px}li{margin-bottom:6px}"""
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
    return f'''<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · Food &amp; Cosmetics</title><meta name="description" content="{esc(description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="{esc(base + "/" + canonical)}">{alternate}<link rel="stylesheet" href="{esc(base)}/style.css">{ld}</head><body><header><a href="{esc(base)}/">Food &amp; Cosmetics</a><p class="muted">Catalogo di dati alimentari e cosmetici · fonte dichiarata · accesso HTML e JSON</p></header><main>{body}</main><footer><a href="{esc(base)}/about.html">Provenienza e limiti</a> · <a href="{esc(base)}/manifest.json">Manifest</a> · <a href="{esc(base)}/llms.txt">Accesso per AI</a><p><small>Progetto indipendente, non affiliato a Yuka. I dati descrivono un'istantanea della fonte; non sono una verifica della confezione attuale.</small></p></footer></body></html>'''


def projection(record, manifest, ingredients):
    data = record["data"]
    result = {
        "schema_version": "1.0",
        "type": record["type"],
        "barcode": record["barcode"],
        "record_id": record["id"],
        "barcode_check_digit_valid": True,
        "source": {
            "name": "Yuka offline Italian snapshot supplied by repository owner",
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
    if record["type"] == "cosmetics":
        result["ingredient_details"] = [
            {"id": key, **{k: v for k, v in ingredients.get(key, {}).items() if v is not None}}
            for key in data.get("ingredients", [])
        ]
    else:
        result["warnings"].append(
            "Full ingredient label is not included in this offline food export"
        )
        if not data.get("additives"):
            result["warnings"].append("Empty additive list does not establish additive absence")
    if "\ufffd" in encode(data):
        result["warnings"].append(
            "Source text contains replacement characters; no spelling guessed"
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
        details = f'<h2>Valori nutrizionali della fonte</h2><p class="note">Valori nelle unità native della fonte, non validate per ogni scheda. Nessuna conversione o nuovo punteggio; verificare la confezione.</p><p>Formato dichiarato: <code>{esc(data.get("nutritionFactsFormat"))}</code></p><table>{rows}</table><h2>Additivi riportati</h2>{inventory}<p>Codici della fonte, senza deduzioni sul rischio. Eventuali GEN restano non risolti. Il testo integrale degli ingredienti non è incluso.</p>'
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
    body = f'<h1>{esc(name)}</h1><p>{esc(brand)} · <strong>{esc(code)}</strong></p><nav><a href="{esc(base + "/" + jp)}">Leggi i dati JSON</a><a href="{esc(manifest["release_url"])}">Scarica il dataset completo</a></nav><p>Categoria della fonte: <code>{esc(data.get("category"))}</code></p><p>Ultimo aggiornamento dichiarato della scheda: {esc(data.get("updated"))}<br>Istantanea acquisita: {esc(manifest["snapshot_date"])}</p><p>Voto riportato da Yuka: <strong>{esc(data.get("grade")) if data.get("grade") is not None else "non disponibile"}</strong>. Non ricalcolato da questo sito e distinto da una nostra valutazione.</p>{details}<h2>Qualità e provenienza</h2><ul>{warn}<li>Confezione attuale non verificata. Nessuna valutazione individuale di dose, esposizione o rischio.</li></ul><p>Record: <code>{esc(item["record_id"])}</code><br>Fonte: Yuka, export offline italiano. Campi mancanti e testi della fonte sono preservati nel JSON.</p>'
    structured = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": name,
        "identifier": code,
        "gtin" + str(len(code)): code,
        "url": base + "/" + hp,
    }
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
                item = projection(record, manifest, ingredients)
                hp, jp = paths(kind, code)
                write(
                    output,
                    jp,
                    json.dumps(item, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False),
                )
                write(output, hp, product_html(item, manifest))
                totals[kind] += 1
                if totals[kind] % 10000 == 0:
                    print(f"Generated {kind}: {totals[kind]} HTML/JSON pairs", flush=True)
                urls.append(base + "/" + hp)
                listings[kind].append(
                    (code, record["data"].get("name") or "Nome non disponibile", hp)
                )
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
    search = """<h2>Cerca per codice a barre</h2><form id="lookup"><label>Tipo <select id="kind"><option value="food">Alimento</option><option value="cosmetics">Cosmetico</option></select></label><br><label>Barcode <input id="barcode" inputmode="numeric" pattern="[0-9]{8,14}" required placeholder="8015854330021"></label> <button>Apri scheda</button><p id="error" role="status"></p></form><script>document.getElementById('lookup').onsubmit=function(e){e.preventDefault();const c=document.getElementById('barcode').value.trim(),k=document.getElementById('kind').value;if(![8,12,13,14].includes(c.length)||!/^[0-9]+$/.test(c)){document.getElementById('error').textContent='Inserisci un GTIN di 8, 12, 13 o 14 cifre.';return;}location.href='products/'+k+'/'+c.slice(0,3)+'/'+c.slice(3,5)+'/'+c+'.html';};</script>"""
    home = f'<h1>Dati leggibili, prodotto per prodotto</h1><p>{totals["food"]:,} alimenti e {totals["cosmetics"]:,} cosmetici con GTIN valido. Schede HTML leggibili senza JavaScript e JSON direttamente accessibili.</p>{search}<nav><a href="catalog/food/1.html">Sfoglia alimenti</a><a href="catalog/cosmetics/1.html">Sfoglia cosmetici</a><a href="{manifest["release_url"]}">Download SQLite e JSONL non compressi</a></nav><h2>Esempi</h2><ul><li><a href="products/food/801/58/8015854330021.html">Monster Cake — 8015854330021</a></li><li><a href="products/food/425/55/4255582816532.html">KoRo — 4255582816532</a></li></ul><p class="note">Istantanea della fonte del {manifest["snapshot_date"]}. Dati non verificati sulla confezione attuale; nessun nuovo punteggio sanitario calcolato. Le unità nutrizionali native richiedono verifica. I dati mancanti restano mancanti.</p>'
    write(
        output,
        "index.html",
        page(
            "Catalogo alimenti e cosmetici",
            home,
            base,
            "",
            "Schede alimenti e cosmetici per barcode, dati HTML e JSON, fonti e limiti espliciti.",
        ),
    )
    about = "<h1>Provenienza e limiti</h1><p>Export dell’istantanea offline italiana Yuka fornito dal proprietario del repository, acquisito il 18 ottobre 2026. Progetto indipendente non affiliato a Yuka. Nomi, valutazioni e dati originali appartengono alle rispettive fonti; il sito non attribuisce una nuova licenza aperta ai dati di terzi.</p><p>Le schede HTML/JSON comprendono i record con GTIN valido. Le righe escluse per barcode mancante/non valido restano negli archivi originali della release. Le immagini non sono pubblicate. L’export alimentare non contiene il testo integrale degli ingredienti; gli elenchi vuoti non dimostrano assenza. I valori nutrizionali restano nei campi e nelle unità native non validate, senza conversioni. I voti sono riportati dalla fonte e non ricalcolati. INCI e nomi sono collegati tramite gli identificativi originali.</p><p>La data della scheda può essere precedente alla data dell’istantanea. I testi possono contenere caratteri sostitutivi già presenti nella fonte: non vengono inventate correzioni. Questo servizio statico non è un MCP remoto e non offre un motore di ricerca per nome.</p>"
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
        f"# Food & Cosmetics\n\nPublic static product reference snapshot. Not affiliated with Yuka.\n\n- HTML: {base}/products/{{type}}/{{barcode[0:3]}}/{{barcode[3:5]}}/{{barcode}}.html\n- JSON: {base}/data/{{type}}/{{barcode[0:3]}}/{{barcode[3:5]}}/{{barcode}}.json\n- Types: food, cosmetics. Preserve barcode strings and leading zeros.\n- OpenAPI: {base}/openapi.json\n- Manifest: {base}/manifest.json\n- Source-native units/bases unverified. No new risk score. Missing values are not zero or proof of absence. Source-reported grades are not recomputed.\n- Full noncompressed datasets: {manifest['release_url']}\n",
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

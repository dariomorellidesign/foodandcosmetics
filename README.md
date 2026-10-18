# Food & Cosmetics

Catalogo pubblico per barcode, con pagine **HTML leggibili senza JavaScript** e dati **JSON direttamente accessibili**. Fonte: istantanea offline italiana fornita dal proprietario del repository; progetto indipendente, non affiliato a Yuka.

- [Apri il sito](https://dariomorellidesign.github.io/foodandcosmetics/)
- [Scarica SQLite e JSONL originali, non compressi](https://github.com/dariomorellidesign/foodandcosmetics/releases/tag/v2026.10.18)
- [Manifest e hash](manifest.json) · [Schema SQLite](schema.sql) · [Note e provenienza](DATA_NOTES.md)

## Contenuto

I file originali contengono 100.291 alimenti e 40.679 cosmetici. Il sito espone i 139.799 record con GTIN valido: 99.458 alimenti e 40.341 cosmetici. Le altre 1.171 righe restano negli archivi originali. Immagini escluse.

Ogni scheda ha HTML e JSON. I barcode sono stringhe: preservare gli zeri iniziali.

```text
/products/{type}/{barcode[0:3]}/{barcode[3:5]}/{barcode}.html
/data/{type}/{barcode[0:3]}/{barcode[3:5]}/{barcode}.json
```

`type`: `food` oppure `cosmetics`. Esempio JSON:
https://dariomorellidesign.github.io/foodandcosmetics/data/food/801/58/8015854330021.json

Il sito pubblica [OpenAPI](openapi.json), `/llms.txt`, `/robots.txt` e sitemap. L'indicizzazione e l'uso da parte di un'AI dipendono dal motore e dagli strumenti del client: non sono automatici né garantiti. Il sito è statico; non espone MCP o ricerca per nome.

## Qualità e interpretazione

I campi e i voti sono riportati dalla fonte, non ricalcolati. Le unità e le basi nutrizionali native non sono state validate per ogni prodotto: nessuna conversione o nuova valutazione sanitaria viene applicata. L'export alimentare non contiene il testo integrale degli ingredienti. Un elenco additivi vuoto non dimostra assenza. Gli INCI cosmetici sono collegati ai riferimenti della stessa istantanea.

Data dell'istantanea: 18 ottobre 2026; l'aggiornamento della singola scheda può essere precedente. Alcuni testi contengono caratteri sostitutivi già presenti nell'export: sono preservati e segnalati. Il sito non certifica la confezione attuale.

## Consultazione SQLite e riproduzione

Scaricare `products.sqlite` dalla release e verificarne SHA-256:

```bash
python scripts/query.py --database products.sqlite --barcode 8015854330021
```

Per generare il sito, scaricare i due JSONL originali nella cartella `.build-data`:

```bash
python -m unittest discover -s tests
python scripts/build_site.py --data-dir .build-data --output _site
```

Solo libreria standard Python. Il generatore verifica hash, GTIN e unicità degli URL. GitHub Actions pubblica `_site` su Pages dopo il rilascio dei file. Nessuna credenziale, configurazione privata o backup dell'applicazione è incluso.

## Attribuzione

Fonte: Yuka e i rispettivi titolari dei contenuti. Non viene attribuita una nuova licenza aperta ai dati di terzi. Questo repository non rappresenta Yuka e non concede diritti di riutilizzo sui suoi dati, testi, voti o immagini. [Condizioni della fonte](https://help.yuka.io/l/fr/article/pyaesjv84d).

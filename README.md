# Food & Cosmetics

Catalogo pubblico per barcode, con pagine **HTML leggibili senza JavaScript** e dati **JSON direttamente accessibili**. Fonte: istantanea offline italiana fornita dal proprietario del repository; progetto indipendente.

- [Apri il sito](https://dariomorellidesign.github.io/foodandcosmetics/)
- [Scarica SQLite e JSONL originali, non compressi](https://github.com/dariomorellidesign/foodandcosmetics/releases/tag/v2026.10.18)
- [Manifest e hash](manifest.json) · [Schema SQLite](schema.sql) · [Note e provenienza](DATA_NOTES.md)

## Contenuto

I file originali contengono 100.291 alimenti e 40.679 cosmetici. Il sito espone i 139.799 record con GTIN valido: 99.458 alimenti e 40.341 cosmetici. Le altre 1.171 righe restano negli archivi originali. 139.248 foto sono collegate alle schede e ospitate in un repository statico separato, con lo stesso identificativo prodotto.

Ogni scheda ha HTML e JSON. I barcode sono stringhe: preservare gli zeri iniziali.

```text
/products/{type}/{barcode[0:3]}/{barcode[3:5]}/{barcode}.html
/data/{type}/{barcode[0:3]}/{barcode[3:5]}/{barcode}.json
```

`type`: `food` oppure `cosmetics`. I percorsi includono il barcode completo, con i suoi zeri iniziali.

Il sito pubblica [OpenAPI](openapi.json), `/llms.txt`, `/robots.txt` e sitemap. L'indicizzazione e l'uso da parte di un'AI dipendono dal motore e dagli strumenti del client: non sono automatici né garantiti. Il sito è statico. Il servizio remoto MCP e il report grafico sono in [`plugin/`](plugin/README.md); consultano questi URL pubblici senza accedere a un computer locale. La ricerca per nome prodotto non è ancora disponibile.

## Qualità e interpretazione

I campi e i voti sono riportati dalla fonte, non ricalcolati. Le unità e le basi nutrizionali native non sono state validate per ogni prodotto: nessuna conversione o nuova valutazione sanitaria viene applicata. L'export alimentare non contiene il testo integrale degli ingredienti. Un elenco additivi vuoto non dimostra assenza. Gli INCI cosmetici sono collegati ai riferimenti della stessa istantanea.

Data dell'istantanea: 18 ottobre 2026; l'aggiornamento della singola scheda può essere precedente. Alcuni testi contengono caratteri sostitutivi già presenti nell'export: sono preservati e segnalati. Il sito non certifica la confezione attuale.

## Consultazione SQLite e riproduzione

Scaricare `products.sqlite` dalla release e verificarne SHA-256:

```bash
python scripts/query.py --database products.sqlite --barcode BARCODE_DEL_PRODOTTO
```

Per generare il sito, scaricare i due JSONL originali nella cartella `.build-data`:

```bash
python -m unittest discover -s tests
python scripts/build_site.py --data-dir .build-data --output _site
```

Solo libreria standard Python. Il generatore verifica hash, GTIN e unicità degli URL. GitHub Actions pubblica `_site` da `main`, sui push o con avvio manuale, dopo che i file della release indicata nel manifest sono disponibili. Nessuna credenziale, configurazione privata o backup dell'applicazione è incluso.

## Classifiche e report

Gli indici `/indexes/categories.json` e `/indexes/{type}/{category}.json` espongono le categorie presenti e i primi 100 voti per ordine. La regola `source-rating/1.0.0` ordina il voto riportato, risolve le parità per barcode e conta gli esclusi; non ricalcola il voto e non certifica il suo algoritmo. Le alternative usano la stessa categoria esatta e un voto strettamente maggiore: è una nostra euristica di similarità, non una verifica di allergeni o ingredienti.

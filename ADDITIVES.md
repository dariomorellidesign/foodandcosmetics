# Additivi alimentari e filtri del catalogo italiano

Versioni: `additive-knowledge/1.0.0`, `additive-source/1.0.0`,
`additive-evidence/1.0.0`, `additive-filter/1.0.0`. Verifica: 18 ottobre 2026.
Queste regole descrivono i dati disponibili: non calcolano un nuovo voto sanitario.

## Tre livelli distinti

1. **Identità e funzioni**: tassonomia Open Food Facts, con la propria attribuzione
   e versione in `reference/additives.json`.
2. **Segnalazioni della fonte del catalogo**: 683 record originali, 207 con
   bibliografia e 198 con segnalazioni. Sono giudizi non verificati individualmente,
   non conclusioni automaticamente attribuibili a EFSA o IARC. I 2.835 riferimenti
   includono 316 voci senza URL; i collegamenti non vuoti distinti sono 591.
   `dangerousnessLevel` resta un valore opaco: non ne inventiamo la scala.
   Le chiavi `shortDescriptionKey` / `longDescriptionKey` non sono testi recuperati.
3. **Approfondimenti verificati su fonti primarie**: sette schede iniziali
   (E171, E202, E250, E450, E466, E471, E951), con data, ambito, conclusioni,
   studi e limiti. È una selezione, non una revisione sistematica esaustiva di
   tutti gli studi o una verifica indipendente delle altre 676 schede.

La presenza non misura dose o esposizione. Pericolo, forza dell'evidenza e rischio
individuale sono campi distinti. Le DGA mantengono la sostanza di riferimento:
E450 in **fosforo**, E250 in **ione nitrito**, E202 in **acido sorbico**.
Non sono soglie per singola porzione. Quantità dell'additivo e consumo personale
non sono presenti; il rischio individuale rimane non determinabile.
Le schede riguardano impieghi **alimentari** nel contesto UE/Italia: non vengono
applicate agli INCI cosmetici o ai medicinali.

## Ricerca per categoria

Parametri MCP di `rank_category`, `find_better_alternatives` e
`render_product_report`:

| Parametro | Significato deterministico |
| --- | --- |
| `additive_filter: "any"` | Nessun filtro sugli additivi. |
| `additive_filter: "none_listed"` | Solo elenco additivi presente come array vuoto. Non certifica l'assenza sulla confezione. |
| `additive_filter: "no_flagged"` | Nessun codice con segnalazioni originali **oppure** `attention_flag=true` nelle sette schede verificate. Sono esclusi codici sconosciuti o non risolti. Non significa “senza rischi”. |
| `exclude_additives: ["E951", "E250"]` | Esclude codici E esatti; massimo 20. Non assimila automaticamente tutte le varianti a una famiglia. |

Ogni filtro restrittivo esclude inventari mancanti/non validi e codici non
riconosciuti. Gli array vuoti sono ammessi con stato `empty_unverified`:
l'intero export alimentare non contiene il testo integrale dell'etichetta,
quindi **nessun risultato è una certificazione “senza additivi”**. L'assenza di
segnalazioni per un codice noto non implica valutazione scientifica completa
o innocuità. `no_flagged` è una **nostra euristica conservativa di selezione**,
non uno standard ufficiale né una categoria tossicologica. Una segnalazione
originale resta motivo di esclusione anche se una scheda EFSA non rileva
criticità negli impieghi valutati: l'eventuale disaccordo rimane visibile.
Anche `attention_flag` è una nostra scelta editoriale di selezione sulla base
dell'approfondimento citato, non una classe ufficiale assegnata da EFSA/IARC.

L'indice include **tutti** i prodotti della categoria, non solo i primi 100.
Filtro prima, poi voto della fonte e parità per barcode crescente. La risposta
riporta corrispondenze prima/dopo esclusione dei voti mancanti e conteggi per
motivo di esclusione. Un voto mancante non diventa zero.
Categorie diverse non vengono fuse; “migliori” riguarda soltanto il catalogo.
Il filtro alimentare su `kind=cosmetics` restituisce un errore esplicito.

Esempi di richieste conversazionali:

- «Trova i migliori yogurt senza additivi elencati nel catalogo».
- «Mostra i migliori biscotti senza additivi segnalati nei riferimenti disponibili».
- «Confronta alternative nella stessa categoria, escludendo E951».

Il client prima trova l'ID con `list_categories`, poi invia ad esempio:

```json
{"category":"dry-pasta","kind":"food","order":"best","additive_filter":"no_flagged","exclude_additives":[],"limit":5}
```

## Audit e aggiornamento riproducibile

`scripts/export_additive_reference.py` apre SQLite **in sola lettura** e rifiuta
un database il cui hash non coincide con quello dichiarato nel manifest:

```sh
python scripts/export_additive_reference.py --database products.sqlite
python -m unittest discover -s tests
```

SQL usato: `reference_records WHERE table_name='Additive'` e inventari di
`products WHERE type='food' AND barcode_check_digit_valid=1`.
Audit incorporato in `reference/additive-source-assessments.json`:
unicità dei codici normalizzati, copertura bibliografica, URL mancanti/invalidi,
vocabolario delle segnalazioni e collegamenti non risolti.
49.538 elenchi alimentari sono vuoti ma non verificati; i quattro codici GEN
restano identificatori generici. E101a non ha un record corrispondente nella
tabella originale e non viene assimilato ad altri additivi.

Per aggiornare le schede verificate, modificare
`reference/additive-evidence.json`, citare fonti primarie, conservare limiti e
data di verifica, incrementare la versione se cambia l'interpretazione.
Un cambiamento di `attention_flag` richiede anche versione del filtro e test.
La conoscenza è pubblicata come JSON e pagine `/additives/CODICE.html`, ed è
inclusa nel servizio remoto per evitare richieste aggiuntive per ogni additivo.
La versione nel report identifica la conoscenza utilizzata. Gli archivi
originali e i voti dei prodotti non vengono riscritti.

Fonti utili per estendere il lavoro:
[EFSA OpenFoodTox](https://www.efsa.europa.eu/en/data-report/chemical-hazards-database-openfoodtox),
[WHO JECFA](https://apps.who.int/food-additives-contaminants-jecfa-database/Home).
L'esistenza di una scheda o di un'autorizzazione non equivale a una garanzia di
sicurezza a qualsiasi dose.

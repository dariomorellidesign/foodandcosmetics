# Provenienza e qualità

L'export dell'istantanea offline italiana è stato fornito dal proprietario del repository, con acquisizione dichiarata il 18 ottobre 2026. Non vengono pubblicati chiavi, credenziali, APK, librerie, file cifrati, log o indirizzi privati di download.

## File

`products.sqlite` conserva `products`, `diet_ingredients`, `reference_records` e `metadata`. La chiave prodotto è `(type,id)`. Il barcode è una stringa e può essere mancante o non valido. `data_json` conserva i campi originali. I due JSONL separano alimenti e cosmetici, un oggetto UTF-8 per riga. Dimensioni e hash sono nel manifest; i file non sono compressi.

Le tabelle di riferimento contengono anche giudizi e fonti bibliografiche della fonte originale. Non costituiscono valutazioni indipendenti di questo repository. Il sito usa solo ID, INCI e nomi della tabella Ingredient per rendere leggibili gli identificativi cosmetici.

## Controlli sull'export

- SQLite quick_check: ok.
- 100.291 alimenti e 40.679 cosmetici; 139.799 GTIN validi in totale.
- Nessun barcode alimentare valido duplicato; il generatore rifiuta comunque URL duplicati dello stesso tipo.
- Tutte le righe alimentari hanno `ingredients_json=[]`: manca il testo integrale degli ingredienti.
- 49.798 schede alimentari hanno inventario additivi vuoto: assenza non verificata.
- Calorie mancanti in 6.071 schede; fibre mancanti in 30.950.
- Formati nutrizionali dichiarati: EU, NA, AU, BR, MX; unità e basi native non validate.
- Alcuni testi hanno caratteri sostitutivi già presenti nell'export, preservati e segnalati.

Il checksum GTIN non dimostra la corrispondenza con la confezione fisica. Le immagini disponibili sono collegate allo stesso ID prodotto tramite `reference/images.json`. Sono ospitate separatamente e conservano i byte originali, con estensione corretta dalla firma del file. Il collegamento non certifica la confezione attuale. Il campo raw `photo` resta preservato.

Le schede JSON separano `source`, `data` e `assessment`. `data.grade` è il voto originale della fonte, non ricalcolato. La presenza di additivi non viene trasformata in una conclusione sul rischio. Gli identificativi generici non diventano E-code inventati. Dati mancanti non diventano zero o assenza di allergeni/additivi.

## Classifiche e alternative

Regola `source-rating/1.0.0`: solo stessa categoria esatta e stesso tipo; voto numerico finito 0–100, non vietato nella fonte. Mancanti e voti inutilizzabili sono esclusi e conteggiati. Migliori: voto decrescente; peggiori: crescente; parità risolta dal barcode crescente. Ogni indice conserva i primi 100 per ordine. Alternative: stessa categoria e voto strettamente maggiore del prodotto di partenza. La similarità per categoria è una nostra euristica; non verifica ingredienti, allergeni, disponibilità o idoneità individuale. Il voto è riportato dalla fonte: il suo algoritmo non è ricostruito o certificato da questo progetto. Non è un nuovo score sanitario.

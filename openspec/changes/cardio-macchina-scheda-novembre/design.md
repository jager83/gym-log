# Design

## Context

- Una serie cardio oggi è `{ duration, distance, level, speed, effort }` (`js/session.js` `prefillSet`), validata in `js/store.js` `isSet`, mostrata da `js/format.js` `formatSet` e dai campi di `js/views/controls.js` `setFields`. Il focus (`js/views/focus.js`) mostra il cronometro e poi gli altri campi.
- Lo storico e il grafico cardio (`js/metrics.js` `cardioMetric`, `chartSeries`) usano la distanza, altrimenti la durata.
- Ogni sessione salva una copia dei target (`session.targets`) e `programVersion`: lo storico non dipende dalla scheda corrente. Gli esercizi tolti finiscono già in "Non più in scheda" (`retiredExercises`).
- La scheda è un solo file, `data/program.json`, versione 1, messo in cache da `sw.js`.
- Le rotte sono in `js/app.js` (`#/workout/<id>` è l'anteprima in sola lettura, `js/views/preview.js`).

## Goals / Non-Goals

**Goals:**
- Serie cardio con macchina e campi per macchina, retrocompatibili.
- Scheda v2 caricata, scheda v1 consultabile.

**Non-Goals:**
- Precompilare watt, rpm, km o pendenza dall'ultima sessione (oggi il cardio non precompila nulla oltre alla durata obiettivo).
- Esiti "Nel range" o consigli di carico per il cardio.
- Storico filtrato per scheda o confronto tra schede.
- Modificare o cancellare schede archiviate dall'app.

## Decisions

### 1. La macchina sta sulla serie, non sul target
`set.machine: 'camminata' | 'cyclette'`. Le serie vecchie non ce l'hanno (`undefined`) e restano "legacy".
- Alternativa scartata: macchina sul target di sessione. Il cardio ha 1 serie, ma sulla serie il dato viaggia con i valori che descrive, e storico/format lo leggono senza guardare il target.
- Il target copia dalla scheda l'eventuale `machine` fissata: se presente la card non mostra la scelta.

### 2. Campi nuovi, nessuna migrazione
Campi nuovi della serie: `incline` (%, 1 decimale), `power` (W, intero), `cadence` (rpm, intero). `distance` e `speed` si riusano per la camminata; `level` resta solo per le serie legacy.
- `schemaVersion` resta 1: tutti i campi sono facoltativi e `isSet` li accetta (`machine` assente o uno dei due valori).
- Prefill di una serie cardio: `{ machine, duration, distance: null, speed: null, incline: null, power: null, cadence: null, effort: null }`, con `machine` = macchina fissata, altrimenti quella dell'ultima serie fatta con macchina (`lastDoneSets` esistente), altrimenti `camminata`.
- Cambio macchina: si aggiorna solo `machine`, i valori dell'altra macchina restano nella serie ma non si mostrano. Evita di perdere dati su un tocco sbagliato; costo trascurabile.
- STEPS: `incline` 0,5, `power` 5, `cadence` 1. `clampValue`: `incline` a 1 decimale, `power` e `cadence` interi (ramo di default).

### 3. Campi per macchina in un solo posto
`setFields(target, set)` in `controls.js` sceglie la lista da `set.machine`: camminata `duration, distance, speed, incline`; cyclette `duration, power, cadence`; legacy `duration, distance, level, speed`. Focus e lista sessione usano già `setFields`, quindi seguono. Etichette e unità (`%`, `W`, `rpm`) si aggiungono a `FIELD_LABELS` e `unitOf`.

### 4. Scelta macchina come due pulsanti
Due `button` con `aria-pressed` ("Camminata", "Cyclette") sopra i campi nel focus e nella riga della lista, solo se il target non ha `machine`. Azione `data-action="machine"` gestita dove si gestiscono `step` e input, con un nuovo `setMachine` in `session.js` che salva la sessione. Nessun widget nuovo: stile dei pulsanti esistenti.

### 5. Format, storico e grafico
- `formatSet` cardio: camminata "durata · km · km/h · %", cyclette "durata · W · rpm", legacy invariato.
- `cardioMetric` restituisce anche `machine` (della serie fatta): camminata `distance`, cyclette `power`, legacy `distance`; poi durata.
- `chartSeries` cardio: filtra le voci con la stessa `machine` dell'ultima voce, poi sceglie la metrica come oggi. Etichetta nuova `cardioPower: 'Potenza (W)'`.

### 6. Archivio come file statici
- `data/archive/index.json`: `[{ "version": 1, "name": "Scheda settembre 2026", "from": "2026-09-27", "to": "2026-11-17", "file": "program-v1.json" }]`.
- `data/archive/program-v1.json`: copia esatta dell'attuale `data/program.json` più `name`.
- `program.json` v2 aggiunge `"name": "Scheda novembre 2026"` e `"from": "2026-11-18"`; `normalizeProgram` li accetta facoltativi e li restituisce.
- Caricamento con `loadProgram(fetch, url)` già esistente, quindi la stessa validazione. Errore: messaggio nella vista, il resto dell'app non dipende dall'archivio.
- Rotte: `#/archive` (elenco) e `#/archive/<version>` (allenamenti). La vista di una versione riusa `previewSessionOf` e il markup dei blocchi di `preview.js` per ogni allenamento, senza "Inizia". Link "Schede precedenti" nella vista storico (dove già vive "Non più in scheda"), mostrato solo se l'indice ha voci.
- Alternativa scartata: salvare la scheda vecchia in localStorage. Sarebbe per dispositivo e appesantirebbe i backup; i file statici sono già versionati in git.
- `sw.js`: `data/archive/index.json` e `data/archive/program-v1.json` in `SHELL`, `CACHE_VERSION` a `gym-log-v15`.

### 7. Scheda v2: mappatura degli esercizi
Regola: stesso id solo se l'esercizio è lo stesso gesto sulla stessa attrezzatura (i carichi restano confrontabili). Recuperi a intervallo (120-180, 60-90) presi al valore minimo, come nella scheda v1.

| Giorno | Esercizio v2 | id | Note |
|---|---|---|---|
| 1, 2 | Camminata o cyclette (riscaldamento, 5 min) | `riscaldamento-cardio` | invariato, macchina a scelta |
| 1 | Mobilità anca 1 e 2 | `mobilita-anca-1`, `mobilita-anca-2` | invariati |
| 1 | Squat con alzata Landmine | `squat-landmine-alzata` | nuovo; 3×6-8, rec 120 |
| 1 | Lat Machine doppia maniglia | `lat-machine-doppia-maniglia` | nuovo; 3×6-8, rec 120 |
| 1 | Curl bicipiti + alzate laterali su panca 60° | `curl-panca-60`, `alzate-laterali-panca-60` | nuovi (seduti su panca, carichi diversi dalla versione in piedi); superserie 3×6-8+6-8, rec 60, per manubrio |
| 1 | Push down con fune + Hammer curl | `pushdown-fune`, `hammer-curl` | stessi id; superserie 2×6-8+6-8, rec 60 |
| 2 | Extra e intra rotazioni con elastico | `mobilita-spalla-extra`, `mobilita-spalla-intra` | invariati |
| 2 | Spinte su panca piana con manubri | `panca-piana-manubri` | nuovo; 3×6-8, rec 120, per manubrio |
| 2 | Spinte su panca 30° con manubri | `panca-30-manubri` | nuovo; 3×6-8, rec 120, per manubrio |
| 2 | Pulley con triangolo | `pulley-triangolo` | stesso id; 2×6-8, rec 120 |
| 2 | French press singola + curl bilanciere sagomato | `french-press-singola`, `curl-bilanciere-sagomato` | nuovi; superserie 3×6-8 (per lato) + 8-10, rec 120 |
| 3 | Pedalata su spinning (15 min) | `spinning` | stesso id, macchina fissata `cyclette` |
| 3 | Stacco alla Hexbar | `stacco-hexbar` | nuovo; 3×6-8, rec 120 |
| 3 | Rematore T-bar al bilanciere libero | `rematore-tbar` | stesso id, nome aggiornato; 3×6-8, rec 120 |
| 3 | Chest press a piastre | `chest-press-piastre` | nuovo (macchina a piastre, "maniglie su 3 o 4"); 3×6-8, rec 120 |
| 3 | Addome su panca declinata + Plank | `addome-panca-declinata`, `plank` | superserie 3×MAX+MAX, rec 120; plank stesso id |

Tolti, finiscono in "Non più in scheda": `goblet-squat-alzata`, `alzate-laterali`, `affondo-statico`, `piegamenti`, `chest-press`, `trazioni-assistite`, `curl-manubri`, `landmine-spinte`, `hyperextension`, `croci-pec-fly`.

Testi (`description`, `steps`, `tips`): le descrizioni del PDF diventano `description`; `steps` e `tips` nello stile della v1, con "Fai almeno 2 serie di avvicinamento" e il tempo 1-2 s / 3-4 s sugli esercizi di forza principali, come da indicazioni generali del trainer.

## Risks / Trade-offs

- [Le serie legacy di "Camminata o cyclette" non dicono la macchina] → restano un gruppo a sé nel grafico; appena si registra la prima serie con macchina il grafico passa a quella.
- [Il cambio di id spezza la continuità del grafico per esercizi simili (es. chest press)] → la mappatura è nella tabella sopra ed è da confermare prima dell'apply; cambiare un id dopo è possibile ma va fatto prima di registrare sessioni con la v2.
- [Valori dell'altra macchina rimasti nella serie] → non si mostrano né entrano nel grafico; dati in più nel backup, ininfluenti.
- [Sessione attiva aperta durante l'aggiornamento] → i target della sessione sono già copiati, la sessione prosegue con la v1; le serie cardio senza `machine` sono legacy e restano valide.

## Migration Plan

1. Deploy con `CACHE_VERSION` incrementata: la nuova versione si attiva alla riapertura successiva.
2. Prima del deploy esportare un backup dall'app (pulsante esistente), per sicurezza.
3. Rollback: `git revert`. Sicuro per i dati: `isSet` della versione attuale controlla solo i campi noti e ignora `machine`, `incline`, `power`, `cadence`.

## Open Questions

- Pendenza a passi di 0,5 o di 1: si regola sullo stepper in uso, non cambia spec né task.

# Proposal

## Why

Il cardio oggi registra sempre gli stessi campi (durata, km, livello, km/h), che vanno bene per il tappeto ma non per la cyclette, dove contano potenza e cadenza. Dal 18/11/2026 il trainer ha consegnato una nuova programmazione (fino alla prima settimana di gennaio) che cambia molti esercizi: va caricata senza perdere né lo storico delle sessioni né la possibilità di rivedere la scheda attuale.

## What Changes

- Sulla card di un esercizio cardio si sceglie la macchina: **Camminata** o **Cyclette**. La scelta parte dall'ultima usata per quell'esercizio; la scheda può fissarla (es. spinning = cyclette) e allora non si mostra la scelta.
- Campi per macchina:
  - Camminata: durata, distanza (km), velocità (km/h), pendenza (%).
  - Cyclette: durata, potenza (W), cadenza (pedalate al minuto, rpm).
- Le serie cardio salvate prima di questa change (senza macchina, con km/livello/velocità) restano valide e si mostrano come oggi.
- Storico e grafico cardio per macchina: camminata in km, cyclette in watt; fallback sulla durata.
- Archivio schede: la scheda attuale diventa la versione 1, consultabile in sola lettura da una nuova voce "Schede precedenti"; la nuova scheda di novembre 2026 è la versione 2.
- Nuova `data/program.json` (versione 2) dalla programmazione "Novembre 2026": gli esercizi che proseguono mantengono l'id (continuità di storico e grafico), quelli nuovi hanno id nuovi, quelli tolti finiscono in "Non più in scheda" come già avviene.
- `sw.js`: `CACHE_VERSION` incrementata e file d'archivio in cache per l'uso offline.

Nessuna modifica **BREAKING**: lo schema dati in localStorage resta `schemaVersion` 1 (campi nuovi facoltativi), i backup esistenti si importano senza migrazione.

## Capabilities

### New Capabilities
- `cardio-logging`: registrazione delle serie cardio con scelta della macchina (camminata o cyclette), campi per macchina, compatibilità con le serie salvate prima, storico e grafico per macchina.
- `program-archive`: versioni della scheda, archivio delle schede precedenti consultabili in sola lettura, sostituzione della scheda corrente senza perdere lo storico.

### Modified Capabilities
<!-- Nessuna: openspec/specs/ è vuoto, le spec storiche sono in docs/superpowers/specs. -->

## Impact

- Codice: `js/program.js` (campo `machine` sugli esercizi cardio), `js/session.js` (prefill della macchina, STEPS e clamp dei nuovi campi), `js/store.js` (validazione dei nuovi campi della serie), `js/format.js` (`formatSet` cardio), `js/metrics.js` (storico e grafico per macchina), `js/views/controls.js` e `js/views/focus.js` (scelta macchina e campi), nuova vista archivio in `js/views/`, `js/app.js` (rotta), `js/views/home.js` o `js/views/history.js` (link all'archivio), `css/main.css`.
- Dati: `data/program.json` riscritta (versione 2), nuovi `data/archive/index.json` e `data/archive/program-v1.json`.
- `sw.js`: `CACHE_VERSION` e `SHELL`.
- Test: `test/` per program, session, store, format, metrics, controls, archivio, sw.
- Nessuna dipendenza nuova.

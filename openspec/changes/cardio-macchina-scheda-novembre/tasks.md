# Tasks

Ogni task di codice: test prima (visto fallire), codice minimo, `npm test` verde, commit, checkbox.

## 1. Modello dati cardio

- [ ] 1.1 `machine` in scheda. RED: in `test/program.test.js` caso "cardio con machine cyclette è normalizzato con machine; machine su weight o valore ignoto lancia ProgramError che nomina l'esercizio"; fallisce perché `machine` non è letta. GREEN: `normalizeExercise` in `js/program.js` accetta `machine` solo per `cardio` con valori `camminata`/`cyclette` e la copia nell'esercizio (e nel controllo id duplicato).
- [ ] 1.2 Serie con macchina valide nello store. RED: in `test/store.test.js` caso "serie cardio con machine, incline, power, cadence passa la validazione; machine ignota la rifiuta; serie legacy { distance, level, speed } resta valida"; fallisce su `machine` ignota accettata. GREEN: `isSet` in `js/store.js` aggiunge `incline`, `power`, `cadence` ai numeri facoltativi e `machine` assente o in `CARDIO_MACHINES` (esportato da `program.js`); `isOptionalTargetCopy` accetta `machine`.
- [ ] 1.3 Prefill della macchina. RED: in `test/session.test.js` casi "cardio senza precedenti parte da camminata", "parte dalla macchina dell'ultima serie fatta con machine", "machine fissata in scheda vince sull'ultima", "il prefill cardio ha speed, incline, power, cadence a null e niente level"; falliscono perché `prefillSet` cardio non usa `previous`. GREEN: `prefillSet` in `js/session.js`.
- [ ] 1.4 Step e clamp dei campi nuovi. RED: in `test/session.test.js` "stepValue incline +0,5, power +5, cadence +1; clampValue incline a 1 decimale, power e cadence interi"; fallisce perché `STEPS.incline` manca. GREEN: `STEPS` e `clampValue`.
- [ ] 1.5 Cambio macchina. RED: in `test/session.test.js` "setMachine aggiorna solo machine della serie e lascia gli altri valori; ignora valori fuori da CARDIO_MACHINES e target con machine fissata"; fallisce perché `setMachine` non esiste. GREEN: `setMachine(state, exerciseId, setIndex, machine)` in `js/session.js`.

## 2. Riepilogo, storico e grafico

- [ ] 2.1 `formatSet` per macchina. RED: in `test/format.test.js` "camminata → '10:00 · 1,2 km · 6,5 km/h · 4,5%'", "cyclette → '15:00 · 120 W · 85 rpm' anche con distance valorizzata", "legacy invariato con liv"; falliscono sui casi nuovi. GREEN: `formatSet` in `js/format.js`.
- [ ] 2.2 Metrica e grafico per macchina. RED: in `test/metrics.test.js` "exerciseHistory cardio riporta machine; cyclette usa la potenza massima", "chartSeries filtra sulla macchina dell'ultima voce con etichetta 'Potenza (W)' o 'Distanza (km)'", "cyclette senza potenza ricade su 'Durata (min)'", "storico solo legacy invariato"; falliscono sulla potenza. GREEN: `cardioMetric`, `exerciseHistory`, `chartSeries`, `METRIC_LABELS.cardioPower` in `js/metrics.js`.
- [ ] 2.3 Storico e riepiloghi delle viste. Verifica: `test/history.test.js` e `test/days.test.js` con una sessione cyclette mostrano "120 W · 85 rpm"; aggiungere il caso se le viste non passano già per `formatSet`, altrimenti nessuna modifica (annotarlo nel commit del task 2.2).

## 3. Interfaccia cardio

- [ ] 3.1 Campi per macchina. RED: in `test/controls.test.js` "setFields cardio: camminata duration, distance, speed, incline; cyclette duration, power, cadence; legacy duration, distance, level, speed" e "unità %, W, rpm"; fallisce perché `setFields` non guarda la serie. GREEN: `setFields(target, set)`, `FIELD_LABELS`, `unitOf`, `DECIMAL_FIELDS` (incline) e `formatFieldValue` in `js/views/controls.js`; aggiornare i chiamanti di `setFields` (focus, lista sessione) e il riassunto unità cardio della riga.
- [ ] 3.2 Pulsanti Camminata/Cyclette. RED: in `test/controls.test.js` "machineToggleHtml: due button con aria-pressed sulla macchina corrente; stringa vuota se il target ha machine fissata"; in `test/focus-view.test.js` "la card cardio senza machine mostra la scelta, lo spinning no"; falliscono perché il markup non esiste. GREEN: `machineToggleHtml` in `controls.js`, inserito nella card del focus e nella riga cardio della lista; stile in `css/main.css` (mobile-first, classi, niente `!important`).
- [ ] 3.3 Azione `machine`. RED: in `test/focus-view.test.js` "click su Cyclette chiama setMachine, salva e ridisegna i campi della cyclette"; fallisce perché l'azione non è gestita. GREEN: gestore `data-action="machine"` dove sono gestiti `step` e input (focus e lista sessione).

## 4. Archivio schede

- [ ] 4.1 Nome e data della scheda. RED: in `test/program.test.js` "normalizeProgram restituisce name e from se presenti; name non stringa lancia ProgramError"; fallisce perché i campi sono scartati. GREEN: `normalizeProgram` in `js/program.js`.
- [ ] 4.2 Scheda v1 in archivio. Creare `data/archive/program-v1.json` (copia di `data/program.json` attuale con `"name": "Scheda settembre 2026"`) e `data/archive/index.json` come in design §6. RED: in `test/program.test.js` "program-v1.json d'archivio si carica con parseProgram e ha version 1; index.json elenca version, name, from, to, file esistente"; fallisce finché i file non ci sono.
- [ ] 4.3 Caricamento archivio. RED: nuovo `test/archive.test.js` "loadArchiveIndex con fetch finto restituisce le voci; con JSON non valido lancia; loadArchivedProgram usa loadProgram sul file della versione"; fallisce perché `js/archive.js` non esiste. GREEN: `js/archive.js` con `loadArchiveIndex` e `loadArchivedProgram` (riusa `loadProgram`).
- [ ] 4.4 Vista archivio. RED: in `test/archive.test.js` "archiveListHtml elenca nome e periodo con link #/archive/<version>", "archivedProgramHtml mostra tutti gli allenamenti in sola lettura senza 'Inizia'", "errore → 'Scheda non disponibile'"; fallisce perché `js/views/archive.js` non esiste. GREEN: `js/views/archive.js` che riusa `previewSessionOf` e il markup blocchi di `preview.js` (estrarre la funzione condivisa se serve, senza cambiare l'anteprima: `test/preview.test.js` resta verde).
- [ ] 4.5 Rotta e link. RED: in `test/history.test.js` "con indice non vuoto la vista storico mostra il link 'Schede precedenti' a #/archive; con indice vuoto no"; fallisce perché il link manca. GREEN: link in `js/views/history.js`, rotte `#/archive` e `#/archive/<version>` in `js/app.js`.
- [ ] 4.6 Offline. RED: in `test/sw.test.js` "data/archive/index.json e ogni file elencato nell'indice sono in SHELL" e "js/archive.js, js/views/archive.js in SHELL" (il test esistente sui moduli JS lo copre già); fallisce finché `SHELL` non li contiene. GREEN: `sw.js` `SHELL` e `CACHE_VERSION` a `gym-log-v15`.

## 5. Scheda novembre 2026

- [ ] 5.1 RED: in `test/program.test.js` "data/program.json è version 2, name 'Scheda novembre 2026', from '2026-11-18', ha gli id della tabella in design §7 per Giorno 1/2/3 e spinning con machine cyclette"; fallisce sulla versione. GREEN: riscrivere `data/program.json` secondo la tabella di design §7 (serie, ripetizioni, recuperi al minimo dell'intervallo, superserie come blocchi a due esercizi, `load` e `sides` come indicato, testi `description`/`steps`/`tips` dal PDF e nello stile v1). Verifica anche che `test/fixtures.js` e i test che leggono la scheda reale restino verdi.
- [ ] 5.2 Esercizi tolti. Verifica con un test in `test/history.test.js`: con una sessione v1 che contiene `goblet-squat-alzata` e la scheda v2, `retiredExercises` lo elenca e `pulley-triangolo` resta in scheda con lo storico v1.

## 6. Verifica finale

- [ ] 6.1 `npm test` verde.
- [ ] 6.2 Prova reale con `npm run serve`: importare un backup reale, avviare Giorno 1 (camminata: km, velocità, pendenza), cambiare in cyclette (watt, rpm), Giorno 3 spinning senza scelta; storico e grafico per macchina; "Schede precedenti" apre la v1; ricaricare offline e riaprire l'archivio. Esito annotato nel commit o in nota alla change.
- [ ] 6.3 Code review con superpowers:requesting-code-review e verifica con superpowers:verification-before-completion; correzioni applicate con test.

## Workflow follow-up

- Prima del deploy esportare un backup dall'app.
- Archiviare con `/opsx:archive` solo con tutte le checkbox spuntate e `npm test` verde, sincronizzando i delta in `openspec/specs`.

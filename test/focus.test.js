import test from 'node:test';
import assert from 'node:assert/strict';
import { blockPosition, focusPosition, nextPreview, sessionSummary, startTimerOn, toggleEffort } from '../js/focus.js';
import { DONE_EFFORT, startSession, updateSet } from '../js/session.js';
import { advanceTimer, pauseTimer, startTimer, timerStatus } from '../js/timer.js';
import { normalizeProgram } from '../js/program.js';
import { at, program } from './fixtures.js';

const T0 = '2026-09-27T18:00:00.000Z';

// Allenamento A: blocco 0 = panca (3 serie, blocco singolo); blocco 1 = superset
// curl (3 serie) + trazioni (4 serie).
const freshA = () => startSession(program(), { schemaVersion: 1, settings: { sound: true, bodyWeight: null }, lastExportAt: null, activeSession: null, sessions: [] }, 'A', at(T0)).activeSession;

const mark = (session, exerciseId, setIndex, effort = 'giusta') =>
  updateSet({ activeSession: session }, exerciseId, setIndex, { effort }, at(T0)).activeSession;

test('focusPosition: blocco singolo appena iniziato, prima serie del primo blocco', () => {
  const session = freshA();
  assert.deepEqual(focusPosition(session), {
    blockIndex: 0,
    round: 0,
    items: [{ exerciseId: 'panca', setIndex: 0 }],
    complete: false,
  });
});

test('focusPosition: superset con serie diverse, il giro alterna gli esercizi e prosegue con quello più lungo', () => {
  let session = freshA();
  // finisce il blocco 0 (panca)
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  assert.deepEqual(focusPosition(session), {
    blockIndex: 1,
    round: 0,
    items: [
      { exerciseId: 'curl', setIndex: 0 },
      { exerciseId: 'trazioni', setIndex: 0 },
    ],
    complete: false,
  });

  session = mark(session, 'curl', 0);
  session = mark(session, 'trazioni', 0);
  assert.deepEqual(focusPosition(session).round, 1);

  // curl ha solo 3 serie: oltre la sua fine il giro derivato resta con solo trazioni.
  session = mark(session, 'curl', 1);
  session = mark(session, 'trazioni', 1);
  session = mark(session, 'curl', 2);
  session = mark(session, 'trazioni', 2);
  assert.deepEqual(focusPosition(session), {
    blockIndex: 1,
    round: 3,
    items: [{ exerciseId: 'trazioni', setIndex: 3 }],
    complete: false,
  });
});

test('focusPosition: sessione completa', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'curl', setIndex);
  });
  [0, 1, 2, 3].forEach((setIndex) => {
    session = mark(session, 'trazioni', setIndex);
  });
  assert.deepEqual(focusPosition(session), { complete: true });
});

test('review focus: una serie successiva segnata fuori ordine non fa saltare avanti il giro derivato', () => {
  let session = freshA();
  // segna la terza serie di panca (indice 2) senza toccare le prime due: modifica manuale
  // dalla lista, fuori ordine.
  session = mark(session, 'panca', 2);
  assert.deepEqual(focusPosition(session), {
    blockIndex: 0,
    round: 0,
    items: [{ exerciseId: 'panca', setIndex: 0 }],
    complete: false,
  });
  // stesso comportamento passando esplicitamente il blocco (navigazione con le frecce)
  assert.equal(blockPosition(session, 0).round, 0);
  assert.equal(blockPosition(session, 0).blockComplete, false);
});

test('review focus: completare il blocco corrente fuori ordine sposta subito la posizione al blocco successivo', () => {
  let session = freshA();
  // segna le serie di panca in ordine sparso: 1, poi 0, poi 2 (l'ultima a chiudere il blocco).
  session = mark(session, 'panca', 1);
  session = mark(session, 'panca', 0);
  session = mark(session, 'panca', 2);
  assert.deepEqual(focusPosition(session), {
    blockIndex: 1,
    round: 0,
    items: [
      { exerciseId: 'curl', setIndex: 0 },
      { exerciseId: 'trazioni', setIndex: 0 },
    ],
    complete: false,
  });
});

test('blockPosition: blocco scelto già completo restituisce l\'ultimo giro con blockComplete true', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  assert.deepEqual(blockPosition(session, 0), {
    blockIndex: 0,
    round: 2,
    items: [{ exerciseId: 'panca', setIndex: 2 }],
    complete: false,
    blockComplete: true,
  });
  // il blocco successivo, non ancora iniziato, resta col giro corrente e blockComplete false
  assert.deepEqual(blockPosition(session, 1), {
    blockIndex: 1,
    round: 0,
    items: [
      { exerciseId: 'curl', setIndex: 0 },
      { exerciseId: 'trazioni', setIndex: 0 },
    ],
    complete: false,
    blockComplete: false,
  });
});

test('nextPreview: dopo l\'ultimo giro di un blocco mostra il primo esercizio del blocco successivo', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  assert.deepEqual(nextPreview(session), { exerciseId: 'curl', name: 'Curl', setIndex: 0, sets: 3 });
});

test('nextPreview: a metà blocco mostra il giro successivo dello stesso blocco', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  session = mark(session, 'curl', 0);
  session = mark(session, 'trazioni', 0);
  assert.deepEqual(nextPreview(session), { exerciseId: 'curl', name: 'Curl', setIndex: 1, sets: 3 });
});

test('nextPreview: null a sessione completa', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'curl', setIndex);
  });
  [0, 1, 2, 3].forEach((setIndex) => {
    session = mark(session, 'trazioni', setIndex);
  });
  assert.equal(nextPreview(session), null);
});

// --- Azioni della vista focus: fatica con timer, avvio timer, riepilogo -----------------------

const timedProgram = () => normalizeProgram({
  version: 1,
  defaultSets: 2,
  defaultRest: 60,
  workouts: [
    {
      id: 'T',
      name: 'Timer',
      blocks: [
        { rest: 30, exercises: [{ id: 'quad', name: 'Stretch quadricipiti', type: 'time', category: 'stretching', sides: 2, duration: 30 }] },
        { exercises: [{ id: 'plank', name: 'Plank', type: 'time', duration: { min: 45, max: 60 } }] },
        { exercises: [{ id: 'corsa', name: 'Corsa', type: 'cardio', sets: 1 }] },
      ],
    },
  ],
});

const S0 = Date.parse('2026-09-28T18:00:00.000Z');
const atSec = (seconds) => new Date(S0 + seconds * 1000);
const timedState = () =>
  startSession(timedProgram(), { schemaVersion: 1, settings: { sound: true, bodyWeight: null }, lastExportAt: null, activeSession: null, sessions: [] }, 'T', atSec(0));
const entry = (state, exerciseId, setIndex) => state.activeSession.entries[exerciseId][setIndex];

test('toggleEffort senza timer: segna e poi toglie la fatica', () => {
  const marked = toggleEffort(timedState(), 'plank', 0, 'giusta', atSec(5));
  assert.equal(entry(marked, 'plank', 0).effort, 'giusta');
  const cleared = toggleEffort(marked, 'plank', 0, 'giusta', atSec(6));
  assert.equal(entry(cleared, 'plank', 0).effort, null);
  const changed = toggleEffort(marked, 'plank', 0, 'dura', atSec(6));
  assert.equal(entry(changed, 'plank', 0).effort, 'dura');
});

test('toggleEffort con timer attivo sulla stessa serie (forza): ferma il timer, registra i secondi, segna la fatica', () => {
  const running = startTimer(timedState(), 'plank', 0, atSec(0));
  const state = toggleEffort(running, 'plank', 0, 'dura', atSec(40));
  assert.equal(state.activeSession.timer, null);
  assert.equal(entry(state, 'plank', 0).duration, 40);
  assert.equal(entry(state, 'plank', 0).effort, 'dura');
});

test('toggleEffort "fatto" con timer attivo (stretching): ferma il timer e resta fatta, non si annulla', () => {
  const running = startTimer(timedState(), 'quad', 0, atSec(0));
  const state = toggleEffort(running, 'quad', 0, DONE_EFFORT, atSec(12));
  assert.equal(state.activeSession.timer, null);
  assert.equal(entry(state, 'quad', 0).duration, 12);
  assert.equal(entry(state, 'quad', 0).effort, DONE_EFFORT);
});

test('toggleEffort su un\'altra serie non ferma il timer attivo', () => {
  const running = startTimer(timedState(), 'plank', 0, atSec(0));
  const state = toggleEffort(running, 'quad', 0, DONE_EFFORT, atSec(5));
  assert.equal(state.activeSession.timer.exerciseId, 'plank');
  assert.equal(entry(state, 'quad', 0).effort, DONE_EFFORT);
});

test('startTimerOn: nessun timer, avvia come startTimer', () => {
  const state = startTimerOn(timedState(), 'plank', 0, atSec(0));
  assert.equal(state.activeSession.timer.exerciseId, 'plank');
  assert.equal(state.activeSession.timer.runningSince, atSec(0).toISOString());
});

test('startTimerOn: cronometro in pausa su un\'altra serie viene chiuso registrando il tempo, poi parte il nuovo', () => {
  let state = startTimer(timedState(), 'corsa', 0, atSec(0));
  state = pauseTimer(state, atSec(300));
  state = startTimerOn(state, 'plank', 0, atSec(400));
  assert.equal(entry(state, 'corsa', 0).duration, 300);
  assert.equal(state.activeSession.timer.exerciseId, 'plank');
});

test('startTimerOn: lato 1 in attesa del lato 2 su un\'altra serie viene chiuso con i secondi del lato 1', () => {
  let state = startTimer(timedState(), 'quad', 0, atSec(0));
  state = advanceTimer(state, atSec(31), { sidesAuto: false }).state;
  assert.equal(timerStatus(state.activeSession, atSec(32)), 'side-done-stale');
  state = startTimerOn(state, 'plank', 0, atSec(40));
  assert.equal(entry(state, 'quad', 0).duration, 30);
  assert.equal(entry(state, 'quad', 0).effort, DONE_EFFORT);
  assert.equal(state.activeSession.timer.exerciseId, 'plank');
});

test('startTimerOn: timer in corso su un\'altra serie, non cambia nulla', () => {
  const running = startTimer(timedState(), 'plank', 0, atSec(0));
  assert.equal(startTimerOn(running, 'quad', 0, atSec(5)), running);
});

test('sessionSummary: esercizi con almeno una serie fatta, serie fatte, durata in secondi', () => {
  let state = timedState();
  state = toggleEffort(state, 'quad', 0, DONE_EFFORT, atSec(10));
  state = toggleEffort(state, 'quad', 1, DONE_EFFORT, atSec(20));
  state = toggleEffort(state, 'plank', 0, 'giusta', atSec(30));
  assert.deepEqual(sessionSummary(state.activeSession, atSec(45 * 60 + 12)), { exercises: 2, sets: 3, seconds: 45 * 60 + 12 });
  assert.equal(sessionSummary(state.activeSession, atSec(-5)).seconds, 0);
});

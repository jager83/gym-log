import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIDE_SWITCH_MS,
  advanceTimer,
  pauseTimer,
  resumeTimer,
  startNextSide,
  startTimer,
  stopTimer,
  timerElapsedMs,
  timerRemainingMs,
  timerStatus,
} from '../js/timer.js';
import { discardSession, finishSession, setSidesAuto, startRest, startSession, updateSet } from '../js/session.js';
import { validateState } from '../js/store.js';
import { normalizeProgram } from '../js/program.js';
import { emptyState } from './helpers.js';

const T0 = Date.parse('2026-09-28T18:00:00.000Z');
const atMs = (offsetMs) => new Date(T0 + offsetMs);
const atS = (seconds) => atMs(seconds * 1000);
const iso = (seconds) => atS(seconds).toISOString();

const SIDES_ON = { sound: true, bodyWeight: null, sidesAuto: true };
const SIDES_OFF = { sound: true, bodyWeight: null, sidesAuto: false };

// Blocco 0: stretching per lato (2 serie, 30 s per lato, recupero 30 s).
// Blocco 1: plank forza (2 serie da 60 s, recupero 60 s). Blocco 2: cardio + panca.
const timerProgram = () => normalizeProgram({
  version: 1,
  defaultSets: 2,
  defaultRest: 60,
  workouts: [
    {
      id: 'T',
      name: 'Timer',
      blocks: [
        {
          rest: 30,
          exercises: [{ id: 'quad', name: 'Stretch quadricipiti', type: 'time', category: 'stretching', sides: 2, duration: { min: 30, max: 30 } }],
        },
        { exercises: [{ id: 'plank', name: 'Plank', type: 'time', duration: { min: 45, max: 60 } }] },
        { exercises: [{ id: 'corsa', name: 'Corsa', type: 'cardio', sets: 1, duration: { min: 600, max: 900 } }] },
        { exercises: [{ id: 'panca', name: 'Panca', type: 'weight', reps: { min: 8, max: 10 } }] },
      ],
    },
  ],
});

const session0 = () => startSession(timerProgram(), emptyState(), 'T', atS(0));
const withSettings = (state, settings) => ({ ...state, settings });
const setOf = (state, exerciseId, setIndex) => state.activeSession.entries[exerciseId][setIndex];

test('startTimer countdown: forma spec, chiude il recupero attivo', () => {
  const resting = startRest(session0(), 90, atS(0), 1);
  assert.notEqual(resting.activeSession.restEndsAt, null);
  const state = startTimer(resting, 'plank', 0, atS(10));
  assert.equal(state.activeSession.restEndsAt, null);
  assert.equal(state.activeSession.restBlockIndex, null);
  assert.deepEqual(state.activeSession.timer, {
    exerciseId: 'plank',
    setIndex: 0,
    mode: 'countdown',
    side: 1,
    runningSince: iso(10),
    elapsedMs: 0,
    targetSeconds: 60,
    switchEndsAt: null,
  });
  assert.doesNotThrow(() => validateState(state));
});

test('startTimer cronometro per cardio: targetSeconds null', () => {
  const state = startTimer(session0(), 'corsa', 0, atS(0));
  assert.equal(state.activeSession.timer.mode, 'stopwatch');
  assert.equal(state.activeSession.timer.targetSeconds, null);
});

test('startTimer rifiuta serie fatte, esercizi non a tempo, serie inesistenti, durata assente', () => {
  const base = session0();
  const done = updateSet(base, 'plank', 0, { effort: 'giusta' }, atS(0));
  assert.equal(startTimer(done, 'plank', 0, atS(1)), done);
  assert.equal(startTimer(base, 'panca', 0, atS(1)), base);
  assert.equal(startTimer(base, 'plank', 9, atS(1)), base);
  assert.equal(startTimer(base, 'nessuno', 0, atS(1)), base);
  const noDuration = updateSet(base, 'plank', 0, { duration: 0 }, atS(0));
  assert.equal(startTimer(noDuration, 'plank', 0, atS(1)), noDuration);
  const noSession = emptyState();
  assert.equal(startTimer(noSession, 'plank', 0, atS(1)), noSession);
});

test('startTimer: un timer attivo resta; uno fermo di un\'altra serie viene sostituito', () => {
  const running = startTimer(session0(), 'plank', 0, atS(0));
  assert.equal(startTimer(running, 'plank', 1, atS(5)), running);
  assert.equal(startTimer(running, 'plank', 0, atS(5)), running);

  const paused = pauseTimer(startTimer(session0(), 'corsa', 0, atS(0)), atS(30));
  assert.equal(startTimer(paused, 'corsa', 0, atS(40)), paused);
  const replaced = startTimer(paused, 'plank', 0, atS(40));
  assert.equal(replaced.activeSession.timer.exerciseId, 'plank');
  assert.equal(replaced.activeSession.timer.runningSince, iso(40));

  const switching = advanceTimer(startTimer(session0(), 'quad', 0, atS(0)), atS(30), SIDES_ON).state;
  assert.equal(startTimer(switching, 'plank', 0, atS(31)), switching);
});

test('countdown per lato con sidesAuto on: avviso a fine lato 1, lato 2 dopo 5 s, fine: serie fatta e recupero', () => {
  let state = startTimer(session0(), 'quad', 0, atS(0));

  let result = advanceTimer(state, atMs(29_999), SIDES_ON);
  assert.equal(result.state, state);
  assert.equal(result.alert, false);
  assert.equal(timerStatus(state.activeSession, atMs(29_999)), 'running');
  assert.equal(timerRemainingMs(state.activeSession.timer, atMs(29_000)), 1000);

  assert.equal(timerStatus(state.activeSession, atS(30)), 'side-done-live');
  result = advanceTimer(state, atS(30), SIDES_ON);
  assert.equal(result.alert, true);
  state = result.state;
  assert.equal(state.activeSession.timer.side, 1);
  assert.equal(state.activeSession.timer.runningSince, null);
  assert.equal(state.activeSession.timer.switchEndsAt, iso(30 + SIDE_SWITCH_MS / 1000));
  assert.equal(timerStatus(state.activeSession, atS(33)), 'switching');
  assert.equal(setOf(state, 'quad', 0).effort, null);

  result = advanceTimer(state, atMs(34_999), SIDES_ON);
  assert.equal(result.state, state);
  assert.equal(result.alert, false);

  result = advanceTimer(state, atS(35), SIDES_ON);
  assert.equal(result.alert, false);
  state = result.state;
  assert.deepEqual(state.activeSession.timer, {
    exerciseId: 'quad',
    setIndex: 0,
    mode: 'countdown',
    side: 2,
    runningSince: iso(35),
    elapsedMs: 0,
    targetSeconds: 30,
    switchEndsAt: null,
  });
  assert.equal(timerStatus(state.activeSession, atS(50)), 'running');

  assert.equal(timerStatus(state.activeSession, atS(65)), 'finished-live');
  result = advanceTimer(state, atS(65), SIDES_ON);
  assert.equal(result.alert, true);
  state = result.state;
  assert.equal(state.activeSession.timer, null);
  assert.deepEqual(setOf(state, 'quad', 0), { duration: 30, effort: 'fatto' });
  assert.equal(state.activeSession.restEndsAt, iso(65 + 30));
  assert.equal(state.activeSession.restBlockIndex, 0);
  assert.equal(timerStatus(state.activeSession, atS(66)), 'idle');
  assert.doesNotThrow(() => validateState(state));
});

test('countdown per lato con sidesAuto off: attende, il lato 2 non parte mai da solo', () => {
  let state = startTimer(session0(), 'quad', 0, atS(0));
  let result = advanceTimer(state, atS(30), SIDES_OFF);
  assert.equal(result.alert, true);
  state = result.state;
  assert.deepEqual(state.activeSession.timer, {
    exerciseId: 'quad',
    setIndex: 0,
    mode: 'countdown',
    side: 1,
    runningSince: null,
    elapsedMs: 30_000,
    targetSeconds: 30,
    switchEndsAt: null,
  });
  assert.equal(timerStatus(state.activeSession, atS(31)), 'side-done-stale');

  [atS(36), atS(3600), atS(86_400)].forEach((now) => {
    const later = advanceTimer(state, now, SIDES_OFF);
    assert.equal(later.state, state);
    assert.equal(later.alert, false);
  });
  // Riattivare "Lati di seguito" mentre si attende non avvia il lato 2 da solo.
  assert.equal(advanceTimer(state, atS(3600), SIDES_ON).state, state);

  state = startNextSide(state, atS(100));
  assert.equal(state.activeSession.timer.side, 2);
  assert.equal(state.activeSession.timer.runningSince, iso(100));
  assert.equal(state.activeSession.timer.elapsedMs, 0);
  assert.equal(startNextSide(state, atS(101)), state);
});

test('spegnere "Lati di seguito" durante il cambio lato: il lato 2 non parte da solo, nessun avviso', () => {
  let state = withSettings(startTimer(session0(), 'quad', 0, atS(0)), SIDES_ON);
  state = advanceTimer(state, atS(30), state.settings).state;
  assert.equal(timerStatus(state.activeSession, atS(31)), 'switching');

  state = setSidesAuto(state, false);
  assert.equal(state.settings.sidesAuto, false);
  assert.equal(state.activeSession.timer.switchEndsAt, null);
  assert.equal(timerStatus(state.activeSession, atS(32)), 'side-done-stale');

  const later = advanceTimer(state, atS(3600), state.settings);
  assert.equal(later.state, state);
  assert.equal(later.alert, false);
  assert.equal(later.state.activeSession.timer.side, 1);

  // Riaccenderlo mentre si attende non avvia il lato 2 (regola del Task 3).
  const back = setSidesAuto(state, true);
  const afterBack = advanceTimer(back, atS(7200), back.settings);
  assert.equal(afterBack.state.activeSession.timer.side, 1);
  assert.equal(afterBack.state.activeSession.timer.runningSince, null);
  assert.equal(afterBack.alert, false);

  assert.equal(startNextSide(state, atS(40)).activeSession.timer.side, 2);
});

test('setSidesAuto senza timer in cambio lato non tocca il timer', () => {
  const running = startTimer(session0(), 'plank', 0, atS(0));
  assert.equal(setSidesAuto(running, false).activeSession.timer, running.activeSession.timer);
  assert.equal(setSidesAuto(session0(), false).activeSession.timer, null);
});

test('sidesAuto assente vale true', () => {
  const state = startTimer(session0(), 'quad', 0, atS(0));
  const { state: next } = advanceTimer(state, atS(30), { sound: true, bodyWeight: null });
  assert.equal(next.activeSession.timer.switchEndsAt, iso(35));
});

test('startNextSide durante il cambio lato salta l\'attesa; ignorato su esercizi a un lato', () => {
  const switching = advanceTimer(startTimer(session0(), 'quad', 0, atS(0)), atS(30), SIDES_ON).state;
  const started = startNextSide(switching, atS(32));
  assert.equal(started.activeSession.timer.side, 2);
  assert.equal(started.activeSession.timer.runningSince, iso(32));
  assert.equal(started.activeSession.timer.switchEndsAt, null);

  const plank = startTimer(session0(), 'plank', 0, atS(0));
  assert.equal(startNextSide(plank, atS(10)), plank);
});

test('stop anticipato: secondi effettivi arrotondati del lato in corso', () => {
  const plank = stopTimer(startTimer(session0(), 'plank', 0, atS(0)), atMs(42_400));
  assert.equal(plank.activeSession.timer, null);
  assert.deepEqual(setOf(plank, 'plank', 0), { duration: 42, effort: null });
  assert.equal(plank.activeSession.restEndsAt, null);

  const sideTwo = advanceTimer(
    advanceTimer(startTimer(session0(), 'quad', 0, atS(0)), atS(30), SIDES_ON).state,
    atS(35),
    SIDES_ON,
  ).state;
  const stopped = stopTimer(sideTwo, atMs(47_600));
  assert.deepEqual(setOf(stopped, 'quad', 0), { duration: 13, effort: 'fatto' });
  assert.equal(stopped.activeSession.restEndsAt, new Date(T0 + 47_600 + 30_000).toISOString());

  const duringSwitch = stopTimer(
    advanceTimer(startTimer(session0(), 'quad', 0, atS(0)), atS(30), SIDES_ON).state,
    atS(32),
  );
  assert.deepEqual(setOf(duringSwitch, 'quad', 0), { duration: 30, effort: 'fatto' });

  const overdue = stopTimer(startTimer(session0(), 'plank', 0, atS(0)), atS(75));
  assert.equal(setOf(overdue, 'plank', 0).duration, 60);

  const idle = session0();
  assert.equal(stopTimer(idle, atS(1)), idle);
});

test('fine ultimo lato per forza: durata registrata, fatica ancora da segnare, nessun recupero', () => {
  const state = startTimer(session0(), 'plank', 0, atS(0));
  assert.equal(timerStatus(state.activeSession, atS(60)), 'finished-live');
  const result = advanceTimer(state, atS(60), SIDES_ON);
  assert.equal(result.alert, true);
  assert.equal(result.state.activeSession.timer, null);
  assert.deepEqual(setOf(result.state, 'plank', 0), { duration: 60, effort: null });
  assert.equal(result.state.activeSession.restEndsAt, null);
});

test('grazia live 3000 ms: al limite avviso, oltre nessun avviso', () => {
  const state = startTimer(session0(), 'plank', 0, atS(0));
  assert.equal(advanceTimer(state, atS(63), SIDES_ON).alert, true);
  assert.equal(timerStatus(state.activeSession, atMs(63_001)), 'finished-stale');
  assert.equal(advanceTimer(state, atMs(63_001), SIDES_ON).alert, false);
});

test('scadenza ad app chiusa: nessun avviso, durata piena', () => {
  const plank = startTimer(session0(), 'plank', 0, atS(0));
  const closedPlank = advanceTimer(plank, atS(3600), SIDES_ON);
  assert.equal(closedPlank.alert, false);
  assert.equal(closedPlank.state.activeSession.timer, null);
  assert.deepEqual(setOf(closedPlank.state, 'plank', 0), { duration: 60, effort: null });

  const quad = startTimer(session0(), 'quad', 0, atS(0));
  assert.equal(timerStatus(quad.activeSession, atS(3600)), 'side-done-stale');
  const closedQuad = advanceTimer(quad, atS(3600), SIDES_ON);
  assert.equal(closedQuad.alert, false);
  assert.equal(closedQuad.state.activeSession.timer, null);
  assert.deepEqual(setOf(closedQuad.state, 'quad', 0), { duration: 30, effort: 'fatto' });
  // Il recupero parte dallo zero reale (65 s), non dalla riapertura: è già scaduto, niente avviso tardivo.
  assert.equal(closedQuad.state.activeSession.restEndsAt, iso(65 + 30));

  // Lato 1 scaduto ad app chiusa senza "Lati di seguito": attende, senza avviso.
  const waiting = advanceTimer(quad, atS(3600), SIDES_OFF);
  assert.equal(waiting.alert, false);
  assert.equal(waiting.state.activeSession.timer.side, 1);
  assert.equal(waiting.state.activeSession.timer.runningSince, null);
  assert.equal(setOf(waiting.state, 'quad', 0).effort, null);
});

test('riapertura durante il lato 2 (sidesAuto on): il lato 2 prosegue dalla sua partenza assoluta', () => {
  const quad = startTimer(session0(), 'quad', 0, atS(0));
  const result = advanceTimer(quad, atS(50), SIDES_ON);
  assert.equal(result.alert, false);
  assert.equal(result.state.activeSession.timer.side, 2);
  assert.equal(result.state.activeSession.timer.runningSince, iso(35));
  assert.equal(timerRemainingMs(result.state.activeSession.timer, atS(50)), 15_000);
});

test('cronometro: pausa, riprendi, stop sommano i tratti; advanceTimer non lo tocca', () => {
  let state = startTimer(session0(), 'corsa', 0, atS(0));
  state = pauseTimer(state, atS(10));
  assert.equal(timerStatus(state.activeSession, atS(15)), 'paused');
  assert.equal(timerElapsedMs(state.activeSession.timer, atS(15)), 10_000);
  assert.equal(pauseTimer(state, atS(16)), state);
  state = resumeTimer(state, atS(20));
  assert.equal(resumeTimer(state, atS(21)), state);
  assert.equal(timerStatus(state.activeSession, atS(22)), 'running');
  state = pauseTimer(state, atS(25));
  state = resumeTimer(state, atS(30));
  assert.equal(timerElapsedMs(state.activeSession.timer, atS(40)), 25_000);
  assert.equal(advanceTimer(state, atS(99_999), SIDES_ON).state, state);
  assert.equal(timerRemainingMs(state.activeSession.timer, atS(40)), null);

  const stopped = stopTimer(state, atMs(40_400));
  assert.equal(stopped.activeSession.timer, null);
  assert.equal(setOf(stopped, 'corsa', 0).duration, 25);
  assert.equal(setOf(stopped, 'corsa', 0).effort, null);
});

test('pausa/riprendi ignorati sul conto alla rovescia', () => {
  const state = startTimer(session0(), 'plank', 0, atS(0));
  assert.equal(pauseTimer(state, atS(10)), state);
  assert.equal(resumeTimer(state, atS(10)), state);
});

test('segnare la fatica di un\'altra serie non ferma il timer', () => {
  const state = startTimer(session0(), 'plank', 0, atS(0));
  const marked = updateSet(state, 'panca', 0, { effort: 'giusta', weight: 40 }, atS(5));
  assert.deepEqual(marked.activeSession.timer, state.activeSession.timer);
});

test('finishSession e discardSession azzerano il timer', () => {
  const running = startTimer(updateSet(session0(), 'panca', 0, { effort: 'giusta' }, atS(0)), 'plank', 0, atS(1));
  const finished = finishSession(running, atS(100));
  assert.equal(finished.activeSession, null);
  assert.equal(finished.sessions.at(-1).timer, null);
  assert.doesNotThrow(() => validateState(finished));
  assert.equal(discardSession(running).activeSession, null);
  assert.equal(finishSession(startTimer(session0(), 'plank', 0, atS(1)), atS(2)).activeSession, null);
});

test('timerStatus senza sessione o timer: idle; startSession parte con timer null', () => {
  assert.equal(timerStatus(null, atS(0)), 'idle');
  assert.equal(session0().activeSession.timer, null);
  assert.equal(timerStatus(session0().activeSession, atS(0)), 'idle');
  assert.equal(timerElapsedMs(null, atS(0)), 0);
});

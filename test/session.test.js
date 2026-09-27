import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampValue,
  clearRest,
  currentBlockIndex,
  discardSession,
  extendRest,
  finishSession,
  hasDoneSets,
  interleaveSets,
  lastDoneByWorkout,
  nextWorkoutId,
  restRemainingMs,
  restStatus,
  setSound,
  shouldStartRest,
  startRest,
  startSession,
  stepValue,
  updateSet,
} from '../js/session.js';
import { at, program } from './fixtures.js';
import { emptyState, playSession } from './helpers.js';

const T0 = '2026-09-27T18:00:00.000Z';
const T1 = '2026-09-27T19:00:00.000Z';

test('nextWorkoutId: primo avvio, rotazione circolare, allenamento rimosso', () => {
  const p = program();
  assert.equal(nextWorkoutId(p, []), 'A');
  assert.equal(nextWorkoutId(p, [{ workoutId: 'A' }]), 'B');
  assert.equal(nextWorkoutId(p, [{ workoutId: 'A' }, { workoutId: 'C' }]), 'A');
  assert.equal(nextWorkoutId(p, [{ workoutId: 'Z' }]), 'A');
});

test('lastDoneByWorkout tiene la data più recente per allenamento', () => {
  const sessions = [
    { workoutId: 'A', endedAt: '2026-09-01T10:00:00.000Z' },
    { workoutId: 'B', endedAt: '2026-09-03T10:00:00.000Z' },
    { workoutId: 'A', endedAt: '2026-09-05T10:00:00.000Z' },
  ];
  assert.deepEqual(lastDoneByWorkout(sessions), {
    A: '2026-09-05T10:00:00.000Z',
    B: '2026-09-03T10:00:00.000Z',
  });
});

test('startSession al primo avvio: struttura, target copiati, precompilato vuoto', () => {
  const state = startSession(program(), emptyState(), 'A', at(T0));
  const session = state.activeSession;
  assert.equal(session.workoutId, 'A');
  assert.equal(session.workoutName, 'Allenamento A');
  assert.equal(session.programVersion, 2);
  assert.equal(session.startedAt, T0);
  assert.equal(session.restEndsAt, null);
  assert.deepEqual(session.blocks, [
    { rest: 120, exerciseIds: ['panca'] },
    { rest: 90, exerciseIds: ['curl', 'trazioni'] },
  ]);
  assert.deepEqual(session.targets.panca, { name: 'Panca piana', type: 'weight', sets: 3, reps: { min: 8, max: 10 } });
  assert.deepEqual(session.entries.panca, [
    { reps: 10, effort: null, weight: null },
    { reps: 10, effort: null, weight: null },
    { reps: 10, effort: null, weight: null },
  ]);
  assert.equal(session.entries.trazioni.length, 4);
  assert.deepEqual(session.entries.trazioni[0], { reps: 8, effort: null, weight: 0 });
});

test('startSession precompila il tempo dal massimo del range', () => {
  const session = startSession(program(), emptyState(), 'B', at(T0)).activeSession;
  assert.deepEqual(session.entries.plank[0], { duration: 60, effort: null });
});

test('startSession rifiuta una seconda sessione aperta o un allenamento sconosciuto', () => {
  const state = startSession(program(), emptyState(), 'A', at(T0));
  assert.throws(() => startSession(program(), state, 'B', at(T0)), { message: 'Sessione già aperta' });
  assert.throws(() => startSession(program(), emptyState(), 'Z', at(T0)), { message: 'Allenamento sconosciuto: Z' });
});

test('precompilato: peso per indice, serie mancanti prendono l\'ultimo, esercizio condiviso tra allenamenti', () => {
  const p = program();
  const afterA = playSession(p, emptyState(), 'A', {
    panca: [
      { weight: 60, effort: 'giusta' },
      { weight: 62.5, reps: 9, effort: 'dura' },
    ],
  }, T0, T1);
  const session = startSession(p, afterA, 'B', at('2026-09-29T18:00:00.000Z')).activeSession;
  assert.deepEqual(session.entries.panca.map((set) => set.weight), [60, 62.5, 62.5, 62.5]);
  assert.deepEqual(session.entries.panca.map((set) => set.reps), [8, 8, 8, 8]);
});

test('precompilato: salta le sessioni in cui l\'esercizio non è stato fatto', () => {
  const p = program();
  const afterA = playSession(p, emptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] }, T0, T1);
  const afterB = playSession(p, afterA, 'B', { plank: [{ effort: 'giusta' }] }, '2026-09-29T18:00:00.000Z', '2026-09-29T19:00:00.000Z');
  const session = startSession(p, afterB, 'A', at('2026-10-01T18:00:00.000Z')).activeSession;
  assert.deepEqual(session.entries.panca.map((set) => set.weight), [60, 60, 60]);
});

test('precompilato: zavorra per esercizi a corpo libero', () => {
  const p = program();
  const afterA = playSession(p, emptyState(), 'A', { trazioni: [{ weight: 5, effort: 'giusta' }] }, T0, T1);
  const session = startSession(p, afterA, 'A', at('2026-10-01T18:00:00.000Z')).activeSession;
  assert.deepEqual(session.entries.trazioni.map((set) => set.weight), [5, 5, 5, 5]);
});

test('interleaveSets alterna i superset e continua con l\'esercizio che ha più serie', () => {
  const session = startSession(program(), emptyState(), 'A', at(T0)).activeSession;
  assert.deepEqual(
    interleaveSets(session.blocks[1], session.targets).map(({ exerciseId, setIndex }) => `${exerciseId}${setIndex}`),
    ['curl0', 'trazioni0', 'curl1', 'trazioni1', 'curl2', 'trazioni2', 'trazioni3'],
  );
});

test('shouldStartRest: blocco singolo e superset', () => {
  const session = startSession(program(), emptyState(), 'A', at(T0)).activeSession;
  assert.equal(shouldStartRest(session, 'panca', 0), true);
  assert.equal(shouldStartRest(session, 'panca', 1), true);
  assert.equal(shouldStartRest(session, 'panca', 2), false);
  assert.equal(shouldStartRest(session, 'curl', 0), false);
  assert.equal(shouldStartRest(session, 'trazioni', 0), true);
  assert.equal(shouldStartRest(session, 'curl', 2), false);
  assert.equal(shouldStartRest(session, 'trazioni', 2), true);
  assert.equal(shouldStartRest(session, 'trazioni', 3), false);
  assert.equal(shouldStartRest(session, 'nope', 0), false);
});

test('updateSet avvia il recupero solo alla prima segnatura della fatica', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'panca', 0, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, '2026-09-27T18:02:00.000Z');

  state = clearRest(state);
  state = updateSet(state, 'panca', 0, { effort: 'dura' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);

  state = updateSet(state, 'panca', 0, { effort: null }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);
  assert.equal(state.activeSession.entries.panca[0].effort, null);
});

test('updateSet nel superset avvia il recupero solo a fine giro', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'curl', 0, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);
  state = updateSet(state, 'trazioni', 0, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, '2026-09-27T18:01:30.000Z');
});

test('updateSet applica il clamp e accetta null', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'panca', 0, { weight: 62.3, reps: 9.6 }, at(T0));
  assert.deepEqual(state.activeSession.entries.panca[0], { reps: 10, effort: null, weight: 62.5 });
  state = updateSet(state, 'panca', 0, { weight: -5 }, at(T0));
  assert.equal(state.activeSession.entries.panca[0].weight, 0);
  state = updateSet(state, 'panca', 0, { weight: null }, at(T0));
  assert.equal(state.activeSession.entries.panca[0].weight, null);
  state = updateSet(state, 'panca', 0, { effort: 'boh' }, at(T0));
  assert.equal(state.activeSession.entries.panca[0].effort, null);
});

test('updateSet non modifica lo stato per esercizio o serie inesistenti', () => {
  const state = startSession(program(), emptyState(), 'A', at(T0));
  assert.equal(updateSet(state, 'nope', 0, { weight: 10 }, at(T0)), state);
  assert.equal(updateSet(state, 'panca', 9, { weight: 10 }, at(T0)), state);
  assert.equal(updateSet(emptyState(), 'panca', 0, { weight: 10 }, at(T0)).activeSession, null);
});

test('clampValue e stepValue', () => {
  assert.equal(clampValue('weight', 62.74), 62.5);
  assert.equal(clampValue('reps', -1), 0);
  assert.equal(clampValue('duration', 44.6), 45);
  assert.equal(clampValue('weight', Number.NaN), null);
  assert.equal(stepValue('weight', 60, 1), 60.5);
  assert.equal(stepValue('weight', null, 1), 0.5);
  assert.equal(stepValue('reps', 0, -1), 0);
  assert.equal(stepValue('duration', 60, 1), 65);
});

test('currentBlockIndex segue il primo blocco incompleto', () => {
  let state = startSession(program(), emptyState(), 'C', at(T0));
  assert.equal(currentBlockIndex(state.activeSession), 0);
  state = startSession(program(), emptyState(), 'A', at(T0));
  [0, 1, 2].forEach((index) => { state = updateSet(state, 'panca', index, { effort: 'giusta' }, at(T0)); });
  assert.equal(currentBlockIndex(state.activeSession), 1);
});

test('timer: start, extend, clear, remaining e stati', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  assert.equal(restStatus(state.activeSession, at(T0)), 'idle');
  assert.equal(extendRest(state, 15), state);

  state = startRest(state, 60, at(T0));
  assert.equal(state.activeSession.restEndsAt, '2026-09-27T18:01:00.000Z');
  state = extendRest(state, 15);
  assert.equal(state.activeSession.restEndsAt, '2026-09-27T18:01:15.000Z');
  assert.equal(restRemainingMs(state.activeSession, at('2026-09-27T18:01:00.000Z')), 15000);
  assert.equal(restStatus(state.activeSession, at('2026-09-27T18:01:00.000Z')), 'running');
  assert.equal(restStatus(state.activeSession, at('2026-09-27T18:01:16.000Z')), 'expired-live');
  assert.equal(restRemainingMs(state.activeSession, at('2026-09-27T18:01:16.000Z')), 0);

  state = clearRest(state);
  assert.equal(state.activeSession.restEndsAt, null);
});

test('timer scaduto ad app chiusa è stale, niente avviso tardivo', () => {
  const state = startRest(startSession(program(), emptyState(), 'A', at(T0)), 60, at(T0));
  assert.equal(restStatus(state.activeSession, at('2026-09-27T18:30:00.000Z')), 'expired-stale');
  assert.equal(restStatus(null, at(T0)), 'idle');
});

test('finishSession sposta la sessione nello storico', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'panca', 0, { weight: 60, effort: 'giusta' }, at(T0));
  assert.equal(hasDoneSets(state.activeSession), true);
  state = finishSession(state, at(T1));
  assert.equal(state.activeSession, null);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0].endedAt, T1);
  assert.equal(state.sessions[0].restEndsAt, null);
});

test('finishSession senza serie fatte scarta la sessione', () => {
  const state = finishSession(startSession(program(), emptyState(), 'A', at(T0)), at(T1));
  assert.equal(state.activeSession, null);
  assert.equal(state.sessions.length, 0);
});

test('finishSession e discardSession senza sessione aperta non cambiano nulla', () => {
  const state = emptyState();
  assert.equal(finishSession(state, at(T1)), state);
  assert.equal(discardSession(state).activeSession, null);
  assert.equal(discardSession(state).sessions, state.sessions);
});

test('setSound', () => {
  assert.equal(setSound(emptyState(), false).settings.sound, false);
});

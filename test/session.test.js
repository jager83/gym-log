import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DONE_EFFORT,
  clampValue,
  clearRest,
  currentBlockIndex,
  discardSession,
  extendRest,
  finishSession,
  hasDoneSets,
  interleaveSets,
  lastDoneByWorkout,
  lastDoneSets,
  nextWorkoutId,
  restRemainingMs,
  restStatus,
  setBodyWeight,
  setSidesAuto,
  setSound,
  shouldStartRest,
  sourceSet,
  startRest,
  startSession,
  stepValue,
  updateSet,
} from '../js/session.js';
import { normalizeProgram } from '../js/program.js';
import { at, program } from './fixtures.js';
import { emptyState, playSession } from './helpers.js';

const T0 = '2026-09-27T18:00:00.000Z';
const T1 = '2026-09-27T19:00:00.000Z';

// Programma minimale con un esercizio cardio, usato solo per i test cardio: non tocca la
// fixture condivisa program() per non alterare le rotazioni di nextWorkoutId negli altri test.
const cardioProgram = (duration) => normalizeProgram({
  version: 1,
  defaultSets: 1,
  defaultRest: 60,
  workouts: [
    {
      id: 'D',
      name: 'Cardio',
      blocks: [{ exercises: [{ id: 'corsa', name: 'Corsa', type: 'cardio', sets: 1, ...(duration !== undefined ? { duration } : {}) }] }],
    },
  ],
});

// Programma minimale con un esercizio stretching (type time, category stretching), per i test
// sull'effort 'fatto'.
const stretchProgram = () => normalizeProgram({
  version: 1,
  defaultSets: 1,
  defaultRest: 30,
  workouts: [
    {
      id: 'S',
      name: 'Stretch',
      blocks: [{ exercises: [{ id: 'quad', name: 'Stretch quadricipiti', type: 'time', category: 'stretching', duration: { min: 30, max: 30 } }] }],
    },
  ],
});

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
  assert.equal(session.restBlockIndex, null);
  assert.deepEqual(session.blocks, [
    { rest: 120, phase: null, exerciseIds: ['panca'] },
    { rest: 90, phase: null, exerciseIds: ['curl', 'trazioni'] },
  ]);
  assert.deepEqual(session.targets.panca, {
    name: 'Panca piana',
    type: 'weight',
    category: 'forza',
    sides: 1,
    sets: 3,
    reps: { min: 8, max: 10 },
    load: 'total',
  });
  assert.deepEqual(session.entries.panca, [
    { reps: 10, effort: null, weight: null },
    { reps: 10, effort: null, weight: null },
    { reps: 10, effort: null, weight: null },
  ]);
  assert.equal(session.entries.trazioni.length, 4);
  assert.deepEqual(session.entries.trazioni[0], { reps: 8, effort: null, weight: 0 });
});

test('startSession copia bodyWeight dalle settings, o null se assente', () => {
  const withWeight = { ...emptyState(), settings: { sound: true, bodyWeight: 78.5 } };
  assert.equal(startSession(program(), withWeight, 'A', at(T0)).activeSession.bodyWeight, 78.5);
  assert.equal(startSession(program(), emptyState(), 'A', at(T0)).activeSession.bodyWeight, null);
});

test('startSession precompila il tempo dal massimo del range', () => {
  const session = startSession(program(), emptyState(), 'B', at(T0)).activeSession;
  assert.deepEqual(session.entries.plank[0], { duration: 60, effort: null });
});

test('startSession precompila cardio: duration dal max del target (o null se assente), altri campi vuoti', () => {
  const withDuration = startSession(cardioProgram({ min: 600, max: 1500 }), emptyState(), 'D', at(T0)).activeSession;
  assert.deepEqual(withDuration.entries.corsa[0], { duration: 1500, distance: null, level: null, speed: null, effort: null });
  assert.equal(withDuration.targets.corsa.duration.max, 1500);

  const withoutDuration = startSession(cardioProgram(), emptyState(), 'D', at(T0)).activeSession;
  assert.deepEqual(withoutDuration.entries.corsa[0], { duration: null, distance: null, level: null, speed: null, effort: null });
  assert.equal(withoutDuration.targets.corsa.duration, null);
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

test('lastDoneSets restituisce l\'array posizionale completo, non solo le serie fatte', () => {
  const sessions = [
    {
      entries: {
        panca: [
          { weight: 60, effort: 'giusta' },
          { weight: null, effort: null },
          { weight: 65, effort: 'giusta' },
        ],
      },
    },
  ];
  const result = lastDoneSets(sessions, 'panca');
  assert.equal(result.length, 3);
  assert.equal(result[1].effort, null);
  assert.equal(lastDoneSets(sessions, 'nope'), null);
});

test('sourceSet: stessa posizione se fatta, poi ultima fatta prima, poi prima fatta dopo, oltre la lunghezza ultima fatta', () => {
  const a = { weight: 60, effort: 'giusta' };
  const skipped = { weight: null, effort: null };
  const c = { weight: 65, effort: 'giusta' };
  const previous = [a, skipped, c];
  assert.equal(sourceSet(previous, 0), a);
  assert.equal(sourceSet(previous, 1), a);
  assert.equal(sourceSet(previous, 2), c);
  assert.equal(sourceSet(previous, 5), c);

  const onlyLast = [skipped, c];
  assert.equal(sourceSet(onlyLast, 0), c);
  assert.equal(sourceSet(onlyLast, 1), c);
  assert.equal(sourceSet(onlyLast, 2), c);

  assert.equal(sourceSet(null, 0), null);
});

test('precompilato: serie saltata in mezzo, la successiva prende la fatta precedente', () => {
  const p = program();
  const afterA = playSession(p, emptyState(), 'A', {
    panca: [{ weight: 60, effort: 'giusta' }, , { weight: 65, effort: 'giusta' }],
  }, T0, T1);
  const session = startSession(p, afterA, 'A', at('2026-09-29T18:00:00.000Z')).activeSession;
  assert.deepEqual(session.entries.panca.map((set) => set.weight), [60, 60, 65]);
});

test('precompilato: prima serie saltata, prende la prima fatta successiva; oltre la lunghezza prende l\'ultima fatta', () => {
  const p = program();
  const afterA = playSession(p, emptyState(), 'A', {
    panca: [, { weight: 62.5, effort: 'giusta' }],
  }, T0, T1);
  const session = startSession(p, afterA, 'B', at('2026-09-29T18:00:00.000Z')).activeSession;
  assert.deepEqual(session.entries.panca.map((set) => set.weight), [62.5, 62.5, 62.5, 62.5]);
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
  // panca è l'ultima serie di un blocco NON finale (segue il superset curl+trazioni):
  // C1 lo rende true, non più false, perché il recupero deve partire anche a fine esercizio.
  assert.equal(shouldStartRest(session, 'panca', 2), true);
  assert.equal(shouldStartRest(session, 'curl', 0), false);
  assert.equal(shouldStartRest(session, 'trazioni', 0), true);
  assert.equal(shouldStartRest(session, 'curl', 2), false);
  assert.equal(shouldStartRest(session, 'trazioni', 2), true);
  // trazioni,3 è l'ultima serie dell'ultimo blocco della sessione: resta false (fine allenamento).
  assert.equal(shouldStartRest(session, 'trazioni', 3), false);
  assert.equal(shouldStartRest(session, 'nope', 0), false);
});

// Scheda con un blocco di riscaldamento senza recupero (rest 0) seguito da un blocco di forza.
const noRestProgram = () => normalizeProgram({
  version: 1,
  workouts: [{
    id: 'A',
    name: 'Giorno 1',
    blocks: [
      { phase: 'riscaldamento', rest: 0, exercises: [{ id: 'giri', name: 'Giri', type: 'bodyweight', category: 'mobilita', sets: 2, reps: 10 }] },
      { rest: 60, exercises: [{ id: 'panca', name: 'Panca piana', type: 'weight', reps: { min: 8, max: 10 } }] },
    ],
  }],
});

test('rest 0: nessun recupero, né a fine giro né a fine blocco', () => {
  let state = startSession(noRestProgram(), emptyState(), 'A', at(T0));
  assert.equal(shouldStartRest(state.activeSession, 'giri', 0), false);
  assert.equal(shouldStartRest(state.activeSession, 'giri', 1), false);
  state = updateSet(state, 'giri', 0, { effort: DONE_EFFORT }, at(T0));
  state = updateSet(state, 'giri', 1, { effort: DONE_EFFORT }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);
  assert.equal(state.activeSession.restBlockIndex, null);
  assert.equal(shouldStartRest(state.activeSession, 'panca', 0), true);
});

test('esercizi MAX: conteggio precompilato vuoto', () => {
  const p = normalizeProgram({
    version: 1,
    workouts: [{ id: 'A', name: 'Giorno 1', blocks: [{ exercises: [
      { id: 'piegamenti', name: 'Piegamenti', type: 'bodyweight', reps: 'max' },
      { id: 'plank', name: 'Plank', type: 'time', duration: 'max' },
    ] }] }],
  });
  const state = startSession(p, emptyState(), 'A', at(T0));
  assert.deepEqual(state.activeSession.entries.piegamenti[0], { reps: null, effort: null, weight: 0 });
  assert.deepEqual(state.activeSession.entries.plank[0], { duration: null, effort: null });
  assert.deepEqual(state.activeSession.targets.piegamenti.reps, { min: 1, max: null });
});

test('startRest con 0 secondi non avvia il recupero', () => {
  const state = startSession(noRestProgram(), emptyState(), 'A', at(T0));
  assert.equal(startRest(state, 0, at(T0), 0), state);
});

test('shouldStartRest: ultima serie di un blocco singolo non finale è true (C1)', () => {
  const session = startSession(program(), emptyState(), 'B', at(T0)).activeSession;
  // Allenamento B: blocco 0 = panca (4 serie, non finale), blocco 1 (ultimo, 3 serie di default) = plank.
  assert.equal(shouldStartRest(session, 'panca', 3), true);
  assert.equal(shouldStartRest(session, 'plank', 2), false);
});

test('updateSet avvia il recupero solo alla prima segnatura della fatica', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'panca', 0, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, '2026-09-27T18:02:00.000Z');
  assert.equal(state.activeSession.restBlockIndex, 0);

  state = clearRest(state);
  assert.equal(state.activeSession.restBlockIndex, null);
  state = updateSet(state, 'panca', 0, { effort: 'dura' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);

  state = updateSet(state, 'panca', 0, { effort: null }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);
  assert.equal(state.activeSession.entries.panca[0].effort, null);
});

test('updateSet nel superset avvia il recupero solo a fine giro, con il restBlockIndex del blocco', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'curl', 0, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);
  state = updateSet(state, 'trazioni', 0, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, '2026-09-27T18:01:30.000Z');
  assert.equal(state.activeSession.restBlockIndex, 1);
});

test('updateSet (C3): un blocco diverso da quello in recupero lo chiude, lo stesso blocco no', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'panca', 0, { effort: 'giusta' }, at(T0));
  state = updateSet(state, 'panca', 1, { effort: 'giusta' }, at(T0));
  // Ultima serie di panca (blocco 0, non finale): C1, il recupero parte.
  state = updateSet(state, 'panca', 2, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restBlockIndex, 0);
  assert.notEqual(state.activeSession.restEndsAt, null);

  // Stesso blocco (0): modificare il peso non chiude il recupero (si prepara la serie dopo).
  const beforeSameBlock = state.activeSession.restEndsAt;
  state = updateSet(state, 'panca', 2, { weight: 60 }, at(T0));
  assert.equal(state.activeSession.restEndsAt, beforeSameBlock);
  assert.equal(state.activeSession.restBlockIndex, 0);

  // Blocco diverso (1): modificare il peso del curl chiude il recupero del blocco 0.
  state = updateSet(state, 'curl', 0, { weight: 20 }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);
  assert.equal(state.activeSession.restBlockIndex, null);
});

test('updateSet (C3): la fatica segnata chiude sempre il recupero attivo, anche nello stesso blocco', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'curl', 0, { effort: 'giusta' }, at(T0));
  // Fine giro 0 (curl+trazioni): parte il recupero, restBlockIndex 1.
  state = updateSet(state, 'trazioni', 0, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restBlockIndex, 1);
  assert.notEqual(state.activeSession.restEndsAt, null);

  // curl,1 è il primo esercizio del giro 1: non chiude il giro, ma la fatica segnata chiude
  // comunque il recupero precedente (anche se è nello stesso blocco); nessun nuovo recupero.
  state = updateSet(state, 'curl', 1, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null);
  assert.equal(state.activeSession.restBlockIndex, null);

  // trazioni,1 chiude il giro 1: parte un nuovo recupero, con il restBlockIndex giusto (1).
  state = updateSet(state, 'trazioni', 1, { effort: 'giusta' }, at(T0));
  assert.notEqual(state.activeSession.restEndsAt, null);
  assert.equal(state.activeSession.restBlockIndex, 1);
});

test('updateSet (C3): ultima serie di un blocco non finale avvia il recupero, dell\'ultimo blocco no', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  [0, 1, 2].forEach((index) => { state = updateSet(state, 'panca', index, { effort: 'giusta' }, at(T0)); });
  assert.notEqual(state.activeSession.restEndsAt, null, 'ultima serie di panca (blocco non finale): il recupero parte');

  [0, 1, 2].forEach((index) => {
    state = updateSet(state, 'curl', index, { effort: 'giusta' }, at(T0));
    state = updateSet(state, 'trazioni', index, { effort: 'giusta' }, at(T0));
  });
  state = updateSet(state, 'trazioni', 3, { effort: 'giusta' }, at(T0));
  assert.equal(state.activeSession.restEndsAt, null, 'ultima serie dell\'ultimo blocco: fine allenamento, nessun recupero');
  assert.equal(state.activeSession.restBlockIndex, null);
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

test('updateSet: il peso cambiato segue sulle serie successive non fatte con lo stesso peso', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'panca', 0, { weight: 60 }, at(T0));
  assert.deepEqual(state.activeSession.entries.panca.map((set) => set.weight), [60, 60, 60]);

  state = updateSet(state, 'panca', 1, { weight: 65 }, at(T0));
  assert.deepEqual(state.activeSession.entries.panca.map((set) => set.weight), [60, 65, 65]);

  // Una serie già fatta o con un peso suo non viene toccata.
  state = updateSet(state, 'panca', 1, { effort: 'giusta' }, at(T0));
  state = updateSet(state, 'panca', 2, { weight: 70 }, at(T0));
  state = updateSet(state, 'panca', 0, { weight: 62.5 }, at(T0));
  assert.deepEqual(state.activeSession.entries.panca.map((set) => set.weight), [62.5, 65, 70]);
});

test('updateSet: la zavorra segue come il peso, le ripetizioni no', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  state = updateSet(state, 'trazioni', 0, { weight: 5, reps: 6 }, at(T0));
  assert.deepEqual(state.activeSession.entries.trazioni.map((set) => set.weight), [5, 5, 5, 5]);
  assert.deepEqual(state.activeSession.entries.trazioni.map((set) => set.reps), [6, 8, 8, 8]);
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
  assert.equal(stepValue('duration', 60, 1, 'cardio'), 90);
  assert.equal(stepValue('duration', 90, -1, 'cardio'), 60);
});

test('clampValue e stepValue: distance, level, speed', () => {
  assert.equal(clampValue('distance', 5.678), 5.68);
  assert.equal(clampValue('distance', -1), 0);
  assert.equal(clampValue('level', 3.6), 4);
  assert.equal(clampValue('level', -2), 0);
  assert.equal(clampValue('speed', 8.34), 8.3);
  assert.equal(stepValue('distance', 5, 1), 5.1);
  assert.equal(stepValue('level', 3, 1), 4);
  assert.equal(stepValue('speed', 8, -1), 7.5);
});

test('updateSet: effort "fatto" accettato solo per category diversa da forza', () => {
  let forzaState = startSession(program(), emptyState(), 'A', at(T0));
  forzaState = updateSet(forzaState, 'panca', 0, { effort: DONE_EFFORT }, at(T0));
  assert.equal(forzaState.activeSession.entries.panca[0].effort, null);

  let stretchState = startSession(stretchProgram(), emptyState(), 'S', at(T0));
  stretchState = updateSet(stretchState, 'quad', 0, { effort: DONE_EFFORT }, at(T0));
  assert.equal(stretchState.activeSession.entries.quad[0].effort, DONE_EFFORT);

  // Gli EFFORTS "normali" restano accettati anche per category diversa da forza.
  stretchState = updateSet(stretchState, 'quad', 0, { effort: 'facile' }, at(T0));
  assert.equal(stretchState.activeSession.entries.quad[0].effort, 'facile');
});

test('updateSet: target senza category (backup precedente al Task 1) si comporta come forza, rifiuta "fatto"', () => {
  let state = startSession(program(), emptyState(), 'A', at(T0));
  // Simula un backup salvato prima del Task 1: il target non ha il campo category.
  const { category, ...targetWithoutCategory } = state.activeSession.targets.panca;
  state = {
    ...state,
    activeSession: { ...state.activeSession, targets: { ...state.activeSession.targets, panca: targetWithoutCategory } },
  };
  state = updateSet(state, 'panca', 0, { effort: DONE_EFFORT }, at(T0));
  assert.equal(state.activeSession.entries.panca[0].effort, null);
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

  // startRest prende il blockIndex del blocco che ha avviato il recupero (C2): la vista passa
  // currentBlockIndex(session), qui simuliamo il blocco 0.
  state = startRest(state, 60, at(T0), 0);
  assert.equal(state.activeSession.restEndsAt, '2026-09-27T18:01:00.000Z');
  assert.equal(state.activeSession.restBlockIndex, 0);
  state = extendRest(state, 15);
  assert.equal(state.activeSession.restEndsAt, '2026-09-27T18:01:15.000Z');
  assert.equal(state.activeSession.restBlockIndex, 0, 'extendRest mantiene il restBlockIndex');
  assert.equal(restRemainingMs(state.activeSession, at('2026-09-27T18:01:00.000Z')), 15000);
  assert.equal(restStatus(state.activeSession, at('2026-09-27T18:01:00.000Z')), 'running');
  assert.equal(restStatus(state.activeSession, at('2026-09-27T18:01:16.000Z')), 'expired-live');
  assert.equal(restRemainingMs(state.activeSession, at('2026-09-27T18:01:16.000Z')), 0);

  state = clearRest(state);
  assert.equal(state.activeSession.restEndsAt, null);
  assert.equal(state.activeSession.restBlockIndex, null);
});

test('timer scaduto ad app chiusa è stale, niente avviso tardivo', () => {
  const state = startRest(startSession(program(), emptyState(), 'A', at(T0)), 60, at(T0), 0);
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
  assert.equal(state.sessions[0].restBlockIndex, null);
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

test('setSidesAuto salva il booleano in settings senza toccare il resto', () => {
  const off = setSidesAuto(emptyState(), false);
  assert.equal(off.settings.sidesAuto, false);
  assert.equal(off.settings.sound, true);
  assert.equal(setSidesAuto(off, true).settings.sidesAuto, true);
});

test('startSession copia la phase dei blocchi', () => {
  const raw = {
    workouts: [
      {
        id: 'W',
        name: 'Con fasi',
        blocks: [
          { phase: 'riscaldamento', exercises: [{ id: 'spalle', name: 'Spalle', type: 'bodyweight', category: 'mobilita', reps: 10 }] },
          { exercises: [{ id: 'squat', name: 'Squat', type: 'weight', reps: 8 }] },
          { phase: 'defaticamento', exercises: [{ id: 'quad', name: 'Quadricipiti', type: 'time', category: 'stretching', sides: 2, duration: 30 }] },
        ],
      },
    ],
  };
  const session = startSession(normalizeProgram(raw), emptyState(), 'W', at(T0)).activeSession;
  assert.deepEqual(session.blocks.map((block) => block.phase), ['riscaldamento', null, 'defaticamento']);
});

test('setBodyWeight arrotonda a 0,1 kg, accetta null e riporta a null valori non validi', () => {
  assert.equal(setBodyWeight(emptyState(), 78.34).settings.bodyWeight, 78.3);
  assert.equal(setBodyWeight(emptyState(), 78).settings.bodyWeight, 78);
  assert.equal(setBodyWeight(emptyState(), null).settings.bodyWeight, null);
  assert.equal(setBodyWeight(emptyState(), 0).settings.bodyWeight, null);
  assert.equal(setBodyWeight(emptyState(), -5).settings.bodyWeight, null);
  assert.equal(setBodyWeight(emptyState(), Number.NaN).settings.bodyWeight, null);
  assert.equal(setBodyWeight(emptyState(), undefined).settings.bodyWeight, null);
});

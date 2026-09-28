import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProgramError,
  countKey,
  findExercise,
  findWorkout,
  loadProgram,
  normalizeProgram,
  parseProgram,
} from '../js/program.js';
import { program, rawProgram } from './fixtures.js';

test('normalizza numeri singoli in range e applica i default', () => {
  const p = program();
  assert.deepEqual(findExercise(p, 'trazioni'), {
    id: 'trazioni',
    name: 'Trazioni',
    type: 'bodyweight',
    sets: 4,
    reps: { min: 8, max: 8 },
  });
  assert.equal(findExercise(p, 'curl').sets, 3);
  assert.deepEqual(findExercise(p, 'plank').duration, { min: 45, max: 60 });
  assert.equal(findWorkout(p, 'A').blocks[0].rest, 120);
  assert.equal(findWorkout(p, 'A').blocks[1].rest, 90);
  assert.equal(p.version, 2);
});

test('load: default "total" per type weight, assente per gli altri tipi', () => {
  const p = program();
  assert.equal(findExercise(p, 'panca').load, 'total');
  assert.equal('load' in findExercise(p, 'trazioni'), false);
  assert.equal('load' in findExercise(p, 'plank'), false);
});

test('load: valore "per-dumbbell" valido', () => {
  const raw = rawProgram();
  raw.workouts[0].blocks[1].exercises[0].load = 'per-dumbbell';
  const p = normalizeProgram(raw);
  assert.equal(findExercise(p, 'curl').load, 'per-dumbbell');
});

test('load: valore sconosciuto', () => {
  expectError((r) => { r.workouts[0].blocks[1].exercises[0].load = 'per-arm'; }, 'esercizio curl: load sconosciuto "per-arm"');
});

test('load: ammesso solo per type weight', () => {
  expectError(
    (r) => { r.workouts[0].blocks[1].exercises[1].load = 'total'; },
    'esercizio trazioni: load ammesso solo per type weight',
  );
});

test('load: diverso sullo stesso id tra allenamenti è un id duplicato', () => {
  expectError((r) => { r.workouts[0].blocks[0].exercises[0].load = 'per-dumbbell'; }, 'id duplicato: panca');
});
test('applica i default globali quando mancano', () => {
  const raw = rawProgram();
  delete raw.defaultSets;
  delete raw.defaultRest;
  delete raw.version;
  const p = normalizeProgram(raw);
  assert.equal(p.defaultSets, 3);
  assert.equal(p.defaultRest, 90);
  assert.equal(p.version, 1);
});

test('lo stesso esercizio può stare in più allenamenti con target diversi', () => {
  const p = program();
  assert.equal(findWorkout(p, 'B').blocks[0].exercises[0].sets, 4);
  assert.deepEqual(findWorkout(p, 'B').blocks[0].exercises[0].reps, { min: 6, max: 8 });
});

test('countKey', () => {
  assert.equal(countKey('weight'), 'reps');
  assert.equal(countKey('bodyweight'), 'reps');
  assert.equal(countKey('time'), 'duration');
});

test('findWorkout e findExercise restituiscono null se assenti', () => {
  assert.equal(findWorkout(program(), 'Z'), null);
  assert.equal(findExercise(program(), 'nope'), null);
});

const expectError = (mutate, message) => {
  const raw = rawProgram();
  mutate(raw);
  assert.throws(
    () => normalizeProgram(raw),
    (error) => error instanceof ProgramError && error.message === message,
  );
};

test('validazione della scheda', () => {
  expectError((r) => { r.workouts = []; }, 'workouts vuoto');
  expectError((r) => { r.defaultRest = 0; }, 'defaultRest deve essere intero > 0');
  expectError((r) => { r.workouts[1].id = 'A'; }, 'id allenamento duplicato: A');
  expectError((r) => { delete r.workouts[2].name; }, 'allenamento C: name mancante');
  expectError((r) => { r.workouts[2].blocks = []; }, 'allenamento C: blocks vuoto');
  expectError((r) => { r.workouts[2].blocks[0].exercises = []; }, 'allenamento C, blocco 1: exercises vuoto');
  expectError((r) => { r.workouts[2].blocks[0].rest = -1; }, 'allenamento C, blocco 1: rest deve essere intero > 0');
  expectError((r) => { delete r.workouts[2].blocks[0].exercises[0].id; }, 'esercizio senza id');
  expectError((r) => { delete r.workouts[2].blocks[0].exercises[0].name; }, 'esercizio squat: name mancante');
  expectError((r) => { r.workouts[2].blocks[0].exercises[0].type = 'cardio'; }, 'esercizio squat: type sconosciuto "cardio"');
  expectError((r) => { r.workouts[1].blocks[0].exercises[0].name = 'Panca'; }, 'id duplicato: panca');
  expectError(
    (r) => { r.workouts[2].blocks.push({ exercises: [{ id: 'squat', name: 'Squat', type: 'weight', reps: 5 }] }); },
    'id duplicato: squat',
  );
  expectError((r) => { r.workouts[2].blocks[0].exercises[0].sets = 2.5; }, 'esercizio squat: sets deve essere intero > 0');
  expectError((r) => { delete r.workouts[2].blocks[0].exercises[0].reps; }, 'esercizio squat: reps mancante');
  expectError((r) => { delete r.workouts[1].blocks[1].exercises[0].duration; }, 'esercizio plank: duration mancante');
  expectError(
    (r) => { r.workouts[2].blocks[0].exercises[0].reps = { min: 10, max: 8 }; },
    'esercizio squat: reps: min maggiore di max',
  );
  expectError(
    (r) => { r.workouts[2].blocks[0].exercises[0].reps = 0; },
    'esercizio squat: reps: min e max devono essere interi > 0',
  );
});

test('parseProgram rifiuta JSON rotto', () => {
  assert.throws(() => parseProgram('{'), (error) => error instanceof ProgramError && error.message === 'JSON non valido');
});

test('loadProgram', async () => {
  const ok = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(rawProgram()) });
  assert.equal((await loadProgram(ok)).workouts.length, 3);

  const notFound = async () => ({ ok: false, status: 404, text: async () => '' });
  await assert.rejects(loadProgram(notFound), { message: 'program.json non raggiungibile (HTTP 404)' });

  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(loadProgram(offline), { message: 'Serve la connessione al primo avvio' });
});

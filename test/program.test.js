import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORIES,
  EXERCISE_TYPES,
  PHASES,
  ProgramError,
  countKey,
  findExercise,
  findWorkout,
  loadProgram,
  normalizeProgram,
  parseProgram,
} from '../js/program.js';
import { program, rawProgram } from './fixtures.js';

const allExercises = (shippedProgram) =>
  shippedProgram.workouts.flatMap((workout) => workout.blocks.flatMap((block) => block.exercises));

const allBlocks = (shippedProgram) => shippedProgram.workouts.flatMap((workout) => workout.blocks);

test('normalizza numeri singoli in range e applica i default', () => {
  const p = program();
  assert.deepEqual(findExercise(p, 'trazioni'), {
    id: 'trazioni',
    name: 'Trazioni',
    type: 'bodyweight',
    category: 'forza',
    sides: 1,
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

test('rest 0 di blocco è ammesso (nessun recupero)', () => {
  const raw = rawProgram();
  raw.workouts[2].blocks[0].rest = 0;
  assert.equal(findWorkout(normalizeProgram(raw), 'C').blocks[0].rest, 0);
});

test('reps o duration "max": range { min: 1, max: null }', () => {
  const raw = rawProgram();
  raw.workouts[2].blocks[0].exercises.push(
    { id: 'piegamenti', name: 'Piegamenti', type: 'bodyweight', reps: 'max' },
    { id: 'plank-max', name: 'Plank', type: 'time', duration: 'max' },
  );
  const p = normalizeProgram(raw);
  assert.deepEqual(findExercise(p, 'piegamenti').reps, { min: 1, max: null });
  assert.deepEqual(findExercise(p, 'plank-max').duration, { min: 1, max: null });
});

test('validazione della scheda', () => {
  expectError((r) => { r.workouts = []; }, 'workouts vuoto');
  expectError((r) => { r.defaultRest = 0; }, 'defaultRest deve essere intero > 0');
  expectError((r) => { r.workouts[1].id = 'A'; }, 'id allenamento duplicato: A');
  expectError((r) => { delete r.workouts[2].name; }, 'allenamento C: name mancante');
  expectError((r) => { r.workouts[2].blocks = []; }, 'allenamento C: blocks vuoto');
  expectError((r) => { r.workouts[2].blocks[0].exercises = []; }, 'allenamento C, blocco 1: exercises vuoto');
  expectError((r) => { r.workouts[2].blocks[0].rest = -1; }, 'allenamento C, blocco 1: rest deve essere intero >= 0');
  expectError((r) => { r.workouts[2].blocks[0].rest = 1.5; }, 'allenamento C, blocco 1: rest deve essere intero >= 0');
  expectError((r) => { delete r.workouts[2].blocks[0].exercises[0].id; }, 'esercizio senza id');
  expectError((r) => { delete r.workouts[2].blocks[0].exercises[0].name; }, 'esercizio squat: name mancante');
  expectError((r) => { r.workouts[2].blocks[0].exercises[0].type = 'unicorn'; }, 'esercizio squat: type sconosciuto "unicorn"');
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

test('EXERCISE_TYPES include cardio; CATEGORIES e PHASES', () => {
  assert.ok(EXERCISE_TYPES.includes('cardio'));
  assert.deepEqual(CATEGORIES, ['forza', 'stretching', 'mobilita']);
  assert.deepEqual(PHASES, ['riscaldamento', 'defaticamento']);
});

test('countKey cardio', () => {
  assert.equal(countKey('cardio'), 'duration');
});

test('category e sides: default forza/1', () => {
  const p = program();
  assert.equal(findExercise(p, 'panca').category, 'forza');
  assert.equal(findExercise(p, 'panca').sides, 1);
});

test('sides: 2 valido', () => {
  const raw = rawProgram();
  raw.workouts[0].blocks[0].exercises[0].sides = 2;
  raw.workouts[1].blocks[0].exercises[0].sides = 2;
  const p = normalizeProgram(raw);
  assert.equal(findExercise(p, 'panca').sides, 2);
});

test('sides: valore non valido', () => {
  expectError((r) => { r.workouts[0].blocks[0].exercises[0].sides = 3; }, 'esercizio panca: sides deve essere 1 o 2');
});

test('category: sconosciuta', () => {
  expectError(
    (r) => { r.workouts[0].blocks[0].exercises[0].category = 'crossfit'; },
    'esercizio panca: category sconosciuta "crossfit"',
  );
});

test('category: diversa da forza ammessa solo per time o bodyweight', () => {
  expectError(
    (r) => { r.workouts[0].blocks[0].exercises[0].category = 'stretching'; },
    'esercizio panca: category stretching ammessa solo per time o bodyweight',
  );
});

test('category: stretching valida per bodyweight', () => {
  const raw = rawProgram();
  raw.workouts[0].blocks[1].exercises[1].category = 'stretching';
  const p = normalizeProgram(raw);
  assert.equal(findExercise(p, 'trazioni').category, 'stretching');
});

test('steps: non array di stringhe non vuote', () => {
  expectError((r) => { r.workouts[0].blocks[0].exercises[0].steps = 'no'; }, 'esercizio panca: steps non valido');
  expectError((r) => { r.workouts[0].blocks[0].exercises[0].steps = ['ok', '']; }, 'esercizio panca: steps non valido');
  expectError((r) => { r.workouts[0].blocks[0].exercises[0].steps = ['ok', 5]; }, 'esercizio panca: steps non valido');
});

test('tips: non array di stringhe non vuote', () => {
  expectError((r) => { r.workouts[0].blocks[0].exercises[0].tips = 'no'; }, 'esercizio panca: tips non valido');
});

test('description: non stringa', () => {
  expectError((r) => { r.workouts[0].blocks[0].exercises[0].description = 42; }, 'esercizio panca: description non valida');
});

test('phase: sconosciuta', () => {
  expectError((r) => { r.workouts[0].blocks[0].phase = 'meta'; }, 'allenamento A, blocco 1: phase sconosciuta "meta"');
});

test('phase: assente resta null, valida se presente', () => {
  const p = program();
  assert.equal(findWorkout(p, 'A').blocks[0].phase, null);
  const raw = rawProgram();
  raw.workouts[0].blocks[0].phase = 'riscaldamento';
  const p2 = normalizeProgram(raw);
  assert.equal(findWorkout(p2, 'A').blocks[0].phase, 'riscaldamento');
});

test('cardio: duration facoltativa, reps ignorato', () => {
  const raw = rawProgram();
  raw.workouts[2].blocks[0].exercises[0] = { id: 'tapis', name: 'Tapis roulant', type: 'cardio', reps: 10 };
  const p = normalizeProgram(raw);
  const exercise = findExercise(p, 'tapis');
  assert.equal(exercise.duration, null);
  assert.equal('reps' in exercise, false);
});

test('cardio: duration valida se presente', () => {
  const raw = rawProgram();
  raw.workouts[2].blocks[0].exercises[0] = { id: 'tapis', name: 'Tapis roulant', type: 'cardio', duration: 1500 };
  const p = normalizeProgram(raw);
  assert.deepEqual(findExercise(p, 'tapis').duration, { min: 1500, max: 1500 });
});

test('id duplicato: sides diverso tra allenamenti', () => {
  expectError((r) => { r.workouts[1].blocks[0].exercises[0].sides = 2; }, 'id duplicato: panca');
});

test('id duplicato: category diversa tra allenamenti', () => {
  const raw = {
    version: 1,
    defaultSets: 3,
    defaultRest: 90,
    workouts: [
      { id: 'X', name: 'X', blocks: [{ exercises: [{ id: 'piegamenti', name: 'Piegamenti', type: 'bodyweight', reps: 10 }] }] },
      {
        id: 'Y',
        name: 'Y',
        blocks: [{ exercises: [{ id: 'piegamenti', name: 'Piegamenti', type: 'bodyweight', reps: 10, category: 'stretching' }] }],
      },
    ],
  };
  assert.throws(
    () => normalizeProgram(raw),
    (error) => error instanceof ProgramError && error.message === 'id duplicato: piegamenti',
  );
});

test('testi presenti su una sola occorrenza propagano a tutte', () => {
  const raw = rawProgram();
  raw.workouts[0].blocks[0].exercises[0].description = 'Spingi il bilanciere';
  raw.workouts[0].blocks[0].exercises[0].steps = ['Sdraiati', 'Spingi'];
  raw.workouts[0].blocks[0].exercises[0].tips = ['Scapole strette'];
  const p = normalizeProgram(raw);
  const inB = findWorkout(p, 'B').blocks[0].exercises[0];
  assert.equal(inB.description, 'Spingi il bilanciere');
  assert.deepEqual(inB.steps, ['Sdraiati', 'Spingi']);
  assert.deepEqual(inB.tips, ['Scapole strette']);
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

test('data/program.json spedito è valido e copre riscaldamento, defaticamento, cardio e sides:2', () => {
  const raw = JSON.parse(readFileSync(new URL('../data/program.json', import.meta.url), 'utf8'));
  const shipped = normalizeProgram(raw);
  const blocks = allBlocks(shipped);
  const exercises = allExercises(shipped);

  assert.ok(blocks.some((block) => block.phase === 'riscaldamento'), 'manca un blocco riscaldamento');
  assert.ok(blocks.some((block) => block.phase === 'defaticamento'), 'manca un blocco defaticamento');
  assert.ok(exercises.some((exercise) => exercise.type === 'cardio'), 'manca un esercizio cardio');
  assert.ok(exercises.some((exercise) => exercise.sides === 2), 'manca un esercizio a due lati');
  exercises.forEach((exercise) => {
    assert.ok(typeof exercise.description === 'string' && exercise.description !== '', `${exercise.id}: description mancante`);
    assert.ok(Array.isArray(exercise.steps) && exercise.steps.length > 0, `${exercise.id}: steps mancanti`);
    assert.ok(Array.isArray(exercise.tips) && exercise.tips.length > 0, `${exercise.id}: tips mancanti`);
  });
});

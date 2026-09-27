import test from 'node:test';
import assert from 'node:assert/strict';
import {
  epley,
  exerciseHistory,
  isDone,
  retiredExercises,
  sessionMetric,
  setOutcome,
} from '../js/metrics.js';
import { program } from './fixtures.js';

const pancaTarget = (reps) => ({ name: 'Panca piana', type: 'weight', sets: 3, reps });

const sessions = [
  {
    id: 's1',
    workoutId: 'A',
    endedAt: '2026-09-20T19:00:00.000Z',
    targets: { panca: pancaTarget({ min: 8, max: 10 }) },
    entries: {
      panca: [
        { weight: 60, reps: 10, effort: 'giusta' },
        { weight: 60, reps: 9, effort: 'dura' },
        { weight: 60, reps: 10, effort: null },
      ],
    },
  },
  {
    id: 's2',
    workoutId: 'B',
    endedAt: '2026-09-22T19:00:00.000Z',
    targets: { panca: pancaTarget({ min: 6, max: 8 }) },
    entries: { panca: [{ weight: 65, reps: 8, effort: null }] },
  },
  {
    id: 's3',
    workoutId: 'C',
    endedAt: '2026-09-24T19:00:00.000Z',
    targets: {
      panca: pancaTarget({ min: 6, max: 8 }),
      stacco: { name: 'Stacco', type: 'weight', sets: 3, reps: { min: 5, max: 5 } },
    },
    entries: {
      panca: [{ weight: 70, reps: 5, effort: 'dura' }],
      stacco: [{ weight: 100, reps: 5, effort: 'giusta' }],
    },
  },
];

test('isDone', () => {
  assert.equal(isDone({ effort: 'facile' }), true);
  assert.equal(isDone({ effort: null }), false);
  assert.equal(isDone({}), false);
});

test('epley', () => {
  assert.equal(epley(100, 10), 133.3);
  assert.equal(epley(60, 10), 80);
  assert.equal(epley(60, 0), 60);
});

test('setOutcome ai bordi del range', () => {
  const target = { min: 8, max: 10 };
  assert.equal(setOutcome({ weight: 60, reps: 7, effort: 'dura' }, 'weight', target), 'fallita');
  assert.equal(setOutcome({ weight: 60, reps: 8, effort: 'dura' }, 'weight', target), 'ok');
  assert.equal(setOutcome({ weight: 60, reps: 10, effort: 'facile' }, 'weight', target), 'ok');
  assert.equal(setOutcome({ weight: 60, reps: 11, effort: 'facile' }, 'weight', target), 'carico-basso');
  assert.equal(setOutcome({ weight: 60, reps: 7, effort: null }, 'weight', target), null);
  assert.equal(setOutcome({ weight: 60, reps: null, effort: 'dura' }, 'weight', target), null);
  assert.equal(setOutcome({ duration: 40, effort: 'dura' }, 'time', { min: 45, max: 60 }), 'fallita');
});

test('sessionMetric per tipo, solo serie fatte', () => {
  assert.equal(
    sessionMetric(
      [
        { weight: 60, reps: 10, effort: 'giusta' },
        { weight: 70, reps: 5, effort: 'dura' },
        { weight: 100, reps: 10, effort: null },
      ],
      'weight',
    ),
    81.7,
  );
  assert.equal(
    sessionMetric([{ weight: 0, reps: 8, effort: 'facile' }, { weight: 0, reps: 10, effort: 'dura' }], 'bodyweight'),
    10,
  );
  assert.equal(sessionMetric([{ duration: 45, effort: 'giusta' }, { duration: 60, effort: null }], 'time'), 45);
  assert.equal(sessionMetric([{ weight: 60, reps: 10, effort: null }], 'weight'), null);
});

test('sessionMetric ignora le serie con peso null', () => {
  assert.equal(sessionMetric([{ weight: null, reps: 10, effort: 'giusta' }], 'weight'), null);
});

test('exerciseHistory usa i target del giorno e salta le sessioni senza serie fatte', () => {
  const history = exerciseHistory(sessions, 'panca');
  assert.deepEqual(history.map((item) => item.sessionId), ['s1', 's3']);
  assert.deepEqual(history[0].target, { min: 8, max: 10 });
  assert.deepEqual(history[1].target, { min: 6, max: 8 });
  assert.equal(history[0].sets.length, 2);
  assert.equal(history[0].value, 80);
  assert.equal(history[0].name, 'Panca piana');
  assert.equal(history[0].type, 'weight');
});

test('retiredExercises elenca gli esercizi con storico non più in scheda', () => {
  assert.deepEqual(retiredExercises(program(), sessions), [{ id: 'stacco', name: 'Stacco' }]);
});

test('retiredExercises ignora gli esercizi fuori scheda senza serie fatte', () => {
  const withSkipped = [
    ...sessions,
    {
      id: 's4',
      workoutId: 'C',
      endedAt: '2026-09-26T19:00:00.000Z',
      targets: { croci: { name: 'Croci', type: 'weight', sets: 1, reps: { min: 10, max: 12 } } },
      entries: { croci: [{ weight: 12, reps: 12, effort: null }] },
    },
  ];
  assert.deepEqual(retiredExercises(program(), withSkipped), [{ id: 'stacco', name: 'Stacco' }]);
});

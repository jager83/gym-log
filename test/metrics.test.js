import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METRIC_LABELS,
  chartSeries,
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

test('sessionMetric weight ignora le serie con peso <= 0', () => {
  assert.equal(sessionMetric([{ weight: 0, reps: 10, effort: 'giusta' }], 'weight'), null);
  assert.equal(
    sessionMetric(
      [
        { weight: 0, reps: 10, effort: 'giusta' },
        { weight: 60, reps: 8, effort: 'giusta' },
      ],
      'weight',
    ),
    epley(60, 8),
  );
});

test('sessionMetric bodyweight con bodyWeight: 1RM su peso corporeo + zavorra', () => {
  const sets = [
    { weight: 5, reps: 8, effort: 'giusta' },
    { weight: 5, reps: 6, effort: 'dura' },
  ];
  assert.equal(sessionMetric(sets, 'bodyweight', 80), epley(85, 8));
  assert.equal(epley(85, 8), 107.7);
});

test('sessionMetric bodyweight senza bodyWeight resta sulle ripetizioni massime', () => {
  const sets = [
    { weight: 5, reps: 8, effort: 'giusta' },
    { weight: 5, reps: 6, effort: 'dura' },
  ];
  assert.equal(sessionMetric(sets, 'bodyweight'), 8);
  assert.equal(sessionMetric(sets, 'bodyweight', null), 8);
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
  assert.equal(history[0].metric, '1rm');
});

const bodyweightTarget = { name: 'Trazioni', type: 'bodyweight', sets: 1, reps: { min: 6, max: 8 } };

test('exerciseHistory: metric riflette come è stato calcolato value', () => {
  const bwSessions = [
    {
      id: 'b1',
      workoutId: 'A',
      endedAt: '2026-09-20T19:00:00.000Z',
      targets: { trazioni: bodyweightTarget },
      entries: { trazioni: [{ weight: 0, reps: 8, effort: 'giusta' }] },
    },
    {
      id: 'b2',
      workoutId: 'A',
      bodyWeight: 80,
      endedAt: '2026-09-22T19:00:00.000Z',
      targets: { trazioni: bodyweightTarget },
      entries: { trazioni: [{ weight: 5, reps: 8, effort: 'giusta' }] },
    },
  ];
  const history = exerciseHistory(bwSessions, 'trazioni');
  assert.equal(history[0].metric, 'reps');
  assert.equal(history[0].value, 8);
  assert.equal(history[1].metric, '1rm');
  assert.equal(history[1].value, epley(85, 8));
});

test('exerciseHistory: metric duration per gli esercizi a tempo', () => {
  const timeSessions = [
    {
      id: 't1',
      workoutId: 'B',
      endedAt: '2026-09-20T19:00:00.000Z',
      targets: { plank: { name: 'Plank', type: 'time', sets: 1, duration: { min: 45, max: 60 } } },
      entries: { plank: [{ duration: 50, effort: 'giusta' }] },
    },
  ];
  const history = exerciseHistory(timeSessions, 'plank');
  assert.equal(history[0].metric, 'duration');
  assert.equal(history[0].value, 50);
});

test('retiredExercises elenca gli esercizi con storico non più in scheda', () => {
  assert.deepEqual(retiredExercises(program(), sessions), [{ id: 'stacco', name: 'Stacco' }]);
});

test('chartSeries null se lo storico non ha punti', () => {
  assert.equal(chartSeries([]), null);
  assert.equal(chartSeries([{ type: 'weight', metric: '1rm', date: 'd1', value: null }]), null);
});

test('chartSeries: weight usa sempre l\'etichetta corrente', () => {
  const history = [
    { type: 'weight', metric: '1rm', date: '2026-09-20T19:00:00.000Z', value: 80 },
    { type: 'weight', metric: '1rm', date: '2026-09-22T19:00:00.000Z', value: 85 },
  ];
  assert.deepEqual(chartSeries(history), {
    label: METRIC_LABELS.weight,
    points: [
      { date: '2026-09-20T19:00:00.000Z', value: 80 },
      { date: '2026-09-22T19:00:00.000Z', value: 85 },
    ],
  });
});

test('chartSeries: bodyweight senza 1RM in storico usa le ripetizioni', () => {
  const history = [
    { type: 'bodyweight', metric: 'reps', date: '2026-09-20T19:00:00.000Z', value: 8 },
    { type: 'bodyweight', metric: 'reps', date: '2026-09-22T19:00:00.000Z', value: 9 },
  ];
  assert.deepEqual(chartSeries(history), {
    label: METRIC_LABELS.bodyweight,
    points: [
      { date: '2026-09-20T19:00:00.000Z', value: 8 },
      { date: '2026-09-22T19:00:00.000Z', value: 9 },
    ],
  });
});

test('chartSeries: bodyweight con storico misto tiene solo le voci 1RM con la nuova etichetta', () => {
  const history = [
    { type: 'bodyweight', metric: 'reps', date: '2026-09-18T19:00:00.000Z', value: 6 },
    { type: 'bodyweight', metric: '1rm', date: '2026-09-20T19:00:00.000Z', value: 107.7 },
    { type: 'bodyweight', metric: '1rm', date: '2026-09-22T19:00:00.000Z', value: 110 },
  ];
  assert.deepEqual(chartSeries(history), {
    label: METRIC_LABELS.bodyweightLoad,
    points: [
      { date: '2026-09-20T19:00:00.000Z', value: 107.7 },
      { date: '2026-09-22T19:00:00.000Z', value: 110 },
    ],
  });
});

test('chartSeries: esclude i punti con value null', () => {
  const history = [
    { type: 'time', metric: 'duration', date: '2026-09-20T19:00:00.000Z', value: 50 },
    { type: 'time', metric: 'duration', date: '2026-09-22T19:00:00.000Z', value: null },
  ];
  assert.deepEqual(chartSeries(history), {
    label: METRIC_LABELS.time,
    points: [{ date: '2026-09-20T19:00:00.000Z', value: 50 }],
  });
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

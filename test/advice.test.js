import test from 'node:test';
import assert from 'node:assert/strict';
import { adviceBySession, loadAdvice } from '../js/advice.js';

// Sessione terminata minimale: solo ciò che legge loadAdvice (entries, via lastDoneSets).
const sessionWith = (exerciseId, sets, targets = {}) => ({
  workoutId: 'A',
  endedAt: '2026-09-27T19:00:00.000Z',
  targets,
  entries: { [exerciseId]: sets },
});

const weightTarget = { name: 'Panca piana', type: 'weight', category: 'forza', sets: 3, reps: { min: 8, max: 10 } };
const bodyweightTarget = { name: 'Trazioni', type: 'bodyweight', sets: 3, reps: { min: 6, max: 8 } };
const timeTarget = { name: 'Plank', type: 'time', sets: 2, duration: { min: 45, max: 60 } };

const weightSets = (weight, repsList, effort = 'giusta') => repsList.map((reps) => ({ weight, reps, effort }));

test('storico vuoto: nessun suggerimento', () => {
  assert.equal(loadAdvice([], 'panca', weightTarget), null);
});

test('nessuna serie fatta: nessun suggerimento', () => {
  const sessions = [sessionWith('panca', [{ weight: 60, reps: 10, effort: null }])];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget), null);
});

test('category diversa da forza o cardio: nessun suggerimento', () => {
  const sessions = [sessionWith('panca', weightSets(60, [10, 10, 10]))];
  assert.equal(loadAdvice(sessions, 'panca', { ...weightTarget, category: 'stretching' }), null);
  const cardio = [sessionWith('bike', [{ duration: 1800, distance: 10, level: 5, speed: 20, effort: 'giusta' }])];
  assert.equal(loadAdvice(cardio, 'bike', { name: 'Bike', type: 'cardio', sets: 1, duration: { min: 1200, max: 1800 } }), null);
});

test('weight: tutte le serie al massimo del range, nessuna dura -> sali di 2,5 kg', () => {
  const sessions = [sessionWith('panca', weightSets(60, [10, 10, 10]))];
  assert.deepEqual(loadAdvice(sessions, 'panca', weightTarget), {
    kind: 'up',
    value: 62.5,
    text: "Prova 62,5 kg · l'ultima volta 10 rip su tutte le serie",
  });
});

test('weight: il passo parte dal peso massimo dell\'ultima volta', () => {
  const sessions = [sessionWith('panca', [
    { weight: 57.5, reps: 11, effort: 'facile' },
    { weight: 60, reps: 10, effort: 'giusta' },
    { weight: 60, reps: 10, effort: 'giusta' },
  ])];
  assert.deepEqual(loadAdvice(sessions, 'panca', weightTarget), {
    kind: 'up',
    value: 62.5,
    text: "Prova 62,5 kg · l'ultima volta 10 rip su tutte le serie",
  });
});

test('weight: una serie dura blocca l\'aumento', () => {
  const sessions = [sessionWith('panca', [
    { weight: 60, reps: 10, effort: 'giusta' },
    { weight: 60, reps: 10, effort: 'giusta' },
    { weight: 60, reps: 10, effort: 'dura' },
  ])];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget), null);
});

test('weight: una serie sotto il massimo del range non basta per salire', () => {
  const sessions = [sessionWith('panca', weightSets(60, [10, 10, 9]))];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget), null);
});

test('weight: almeno metà delle serie sotto il minimo -> scendi di 2,5 kg', () => {
  const sessions = [sessionWith('panca', weightSets(60, [8, 7, 6, 9]))];
  assert.deepEqual(loadAdvice(sessions, 'panca', weightTarget), {
    kind: 'down',
    value: 57.5,
    text: "Scendi a 57,5 kg · l'ultima volta sotto le 8 rip",
  });
});

test('weight: meno di metà delle serie sotto il minimo -> nessun suggerimento', () => {
  const sessions = [sessionWith('panca', weightSets(60, [8, 7, 9]))];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget), null);
});

test('weight: la discesa non va sotto 0', () => {
  const sessions = [sessionWith('panca', weightSets(2, [5, 5, 5]))];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget).value, 0);
});

test('weight senza peso registrato: nessuna discesa possibile', () => {
  const sessions = [sessionWith('panca', weightSets(null, [5, 5, 5]))];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget), null);
});

test('le serie saltate non contano', () => {
  const sessions = [sessionWith('panca', [
    { weight: 60, reps: 10, effort: 'giusta' },
    { weight: 60, reps: 10, effort: 'giusta' },
    { weight: 60, reps: 10, effort: null },
  ])];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget).kind, 'up');
  const low = [sessionWith('panca', [
    { weight: 60, reps: 6, effort: 'dura' },
    { weight: 60, reps: 10, effort: null },
    { weight: 60, reps: 10, effort: null },
  ])];
  assert.equal(loadAdvice(low, 'panca', weightTarget).kind, 'down');
});

test('usa l\'ultima sessione in cui l\'esercizio è stato fatto', () => {
  const sessions = [
    sessionWith('panca', weightSets(55, [6, 6, 6])),
    sessionWith('panca', weightSets(60, [10, 10, 10])),
    sessionWith('panca', [{ weight: 65, reps: 5, effort: null }]),
  ];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget).value, 62.5);
});

test('sessioni vecchie senza category: vale forza', () => {
  const oldTarget = { name: 'Panca piana', type: 'weight', sets: 3, reps: { min: 8, max: 10 } };
  const sessions = [sessionWith('panca', weightSets(60, [10, 10, 10]), { panca: oldTarget })];
  assert.equal(loadAdvice(sessions, 'panca', oldTarget).kind, 'up');
});

test('bodyweight con zavorra: sali di 1 kg', () => {
  const sessions = [sessionWith('trazioni', weightSets(5, [8, 9, 8]))];
  assert.deepEqual(loadAdvice(sessions, 'trazioni', bodyweightTarget), {
    kind: 'up',
    value: 6,
    text: "Prova con 6 kg di zavorra · l'ultima volta 8 rip su tutte le serie",
  });
});

test('bodyweight con zavorra: scendi di 1 kg, minimo 0', () => {
  const sessions = [sessionWith('trazioni', weightSets(0.5, [4, 5, 6]))];
  assert.deepEqual(loadAdvice(sessions, 'trazioni', bodyweightTarget), {
    kind: 'down',
    value: 0,
    text: "Scendi a 0 kg di zavorra · l'ultima volta sotto le 6 rip",
  });
});

test('bodyweight senza zavorra al massimo: prova con 2,5 kg', () => {
  const sessions = [sessionWith('trazioni', weightSets(0, [8, 8, 8]))];
  assert.deepEqual(loadAdvice(sessions, 'trazioni', bodyweightTarget), {
    kind: 'up',
    value: 2.5,
    text: 'Prova con 2,5 kg di zavorra',
  });
  const noWeight = [sessionWith('trazioni', weightSets(null, [8, 8, 8]))];
  assert.equal(loadAdvice(noWeight, 'trazioni', bodyweightTarget).value, 2.5);
});

test('bodyweight senza zavorra sotto il minimo: nessun suggerimento', () => {
  const sessions = [sessionWith('trazioni', weightSets(0, [3, 4, 5]))];
  assert.equal(loadAdvice(sessions, 'trazioni', bodyweightTarget), null);
});

test('time forza al massimo: prova 5 s in più', () => {
  const sessions = [sessionWith('plank', [{ duration: 60, effort: 'giusta' }, { duration: 62, effort: 'facile' }])];
  assert.deepEqual(loadAdvice(sessions, 'plank', timeTarget), { kind: 'up-time', value: 5, text: 'Prova 5 s in più' });
});

test('time sotto il massimo o con una serie dura: nessun suggerimento', () => {
  const short = [sessionWith('plank', [{ duration: 30, effort: 'giusta' }, { duration: 30, effort: 'giusta' }])];
  assert.equal(loadAdvice(short, 'plank', timeTarget), null);
  const hard = [sessionWith('plank', [{ duration: 60, effort: 'dura' }, { duration: 60, effort: 'giusta' }])];
  assert.equal(loadAdvice(hard, 'plank', timeTarget), null);
});

test('time non forza: nessun suggerimento', () => {
  const sessions = [sessionWith('plank', [{ duration: 60, effort: 'fatto' }])];
  assert.equal(loadAdvice(sessions, 'plank', { ...timeTarget, category: 'mobilita' }), null);
});

test('il valore suggerito è arrotondato al mezzo chilo', () => {
  const sessions = [sessionWith('panca', weightSets(60.3, [10, 10, 10]))];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget).value, 63);
});

test('adviceBySession: un suggerimento (o null) per ogni esercizio della sessione', () => {
  const sessions = [sessionWith('panca', weightSets(60, [10, 10, 10]))];
  const active = { targets: { panca: weightTarget, plank: timeTarget } };
  const result = adviceBySession(sessions, active);
  assert.deepEqual(Object.keys(result), ['panca', 'plank']);
  assert.equal(result.panca.value, 62.5);
  assert.equal(result.plank, null);
});

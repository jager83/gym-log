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

test('weight: tutte le serie oltre il massimo del range -> sali di 2,5 kg', () => {
  const sessions = [sessionWith('panca', weightSets(60, [11, 11, 12]))];
  assert.deepEqual(loadAdvice(sessions, 'panca', weightTarget), {
    kind: 'up',
    value: 62.5,
    text: "Prova 62,5 kg · l'ultima volta oltre 10 rip su tutte le serie",
  });
});

test('weight: il passo parte dal peso massimo dell\'ultima volta', () => {
  const sessions = [sessionWith('panca', [
    { weight: 57.5, reps: 12, effort: 'facile' },
    { weight: 60, reps: 11, effort: 'giusta' },
    { weight: 60, reps: 11, effort: 'giusta' },
  ])];
  assert.deepEqual(loadAdvice(sessions, 'panca', weightTarget), {
    kind: 'up',
    value: 62.5,
    text: "Prova 62,5 kg · l'ultima volta oltre 10 rip su tutte le serie",
  });
});

test('weight: la fatica non conta, anche una serie dura sale', () => {
  const sessions = [sessionWith('panca', [
    { weight: 60, reps: 11, effort: 'giusta' },
    { weight: 60, reps: 11, effort: 'giusta' },
    { weight: 60, reps: 11, effort: 'dura' },
  ])];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget).kind, 'up');
});

test('weight: arrivare al massimo del range non basta, serve superarlo su tutte le serie', () => {
  assert.equal(loadAdvice([sessionWith('panca', weightSets(60, [10, 10, 10]))], 'panca', weightTarget), null);
  assert.equal(loadAdvice([sessionWith('panca', weightSets(60, [11, 11, 10]))], 'panca', weightTarget), null);
});

test('sotto il minimo: mai un suggerimento di discesa', () => {
  assert.equal(loadAdvice([sessionWith('panca', weightSets(60, [6, 6, 6]))], 'panca', weightTarget), null);
  assert.equal(loadAdvice([sessionWith('trazioni', weightSets(5, [3, 3, 3]))], 'trazioni', bodyweightTarget), null);
});

test('le serie saltate non contano', () => {
  const sessions = [sessionWith('panca', [
    { weight: 60, reps: 11, effort: 'giusta' },
    { weight: 60, reps: 11, effort: 'giusta' },
    { weight: 60, reps: 5, effort: null },
  ])];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget).kind, 'up');
});

test('usa l\'ultima sessione in cui l\'esercizio è stato fatto', () => {
  const sessions = [
    sessionWith('panca', weightSets(55, [11, 11, 11])),
    sessionWith('panca', weightSets(60, [11, 11, 11])),
    sessionWith('panca', [{ weight: 65, reps: 5, effort: null }]),
  ];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget).value, 62.5);
});

test('sessioni vecchie senza category: vale forza', () => {
  const oldTarget = { name: 'Panca piana', type: 'weight', sets: 3, reps: { min: 8, max: 10 } };
  const sessions = [sessionWith('panca', weightSets(60, [11, 11, 11]), { panca: oldTarget })];
  assert.equal(loadAdvice(sessions, 'panca', oldTarget).kind, 'up');
});

test('bodyweight con zavorra: sali di 1 kg', () => {
  const sessions = [sessionWith('trazioni', weightSets(5, [9, 10, 9]))];
  assert.deepEqual(loadAdvice(sessions, 'trazioni', bodyweightTarget), {
    kind: 'up',
    value: 6,
    text: "Prova con 6 kg di zavorra · l'ultima volta oltre 8 rip su tutte le serie",
  });
});

test('bodyweight senza zavorra oltre il massimo: prova con 2,5 kg', () => {
  const sessions = [sessionWith('trazioni', weightSets(0, [9, 9, 9]))];
  assert.deepEqual(loadAdvice(sessions, 'trazioni', bodyweightTarget), {
    kind: 'up',
    value: 2.5,
    text: 'Prova con 2,5 kg di zavorra',
  });
  const noWeight = [sessionWith('trazioni', weightSets(null, [9, 9, 9]))];
  assert.equal(loadAdvice(noWeight, 'trazioni', bodyweightTarget).value, 2.5);
  assert.equal(loadAdvice([sessionWith('trazioni', weightSets(0, [8, 8, 8]))], 'trazioni', bodyweightTarget), null);
});

test('time forza oltre il massimo: prova 5 s in più', () => {
  const sessions = [sessionWith('plank', [{ duration: 61, effort: 'dura' }, { duration: 62, effort: 'facile' }])];
  assert.deepEqual(loadAdvice(sessions, 'plank', timeTarget), { kind: 'up-time', value: 5, text: 'Prova 5 s in più' });
});

test('time al massimo o sotto: nessun suggerimento', () => {
  const short = [sessionWith('plank', [{ duration: 30, effort: 'giusta' }, { duration: 30, effort: 'giusta' }])];
  assert.equal(loadAdvice(short, 'plank', timeTarget), null);
  const atMax = [sessionWith('plank', [{ duration: 60, effort: 'giusta' }, { duration: 61, effort: 'giusta' }])];
  assert.equal(loadAdvice(atMax, 'plank', timeTarget), null);
});

test('time non forza: nessun suggerimento', () => {
  const sessions = [sessionWith('plank', [{ duration: 61, effort: 'fatto' }])];
  assert.equal(loadAdvice(sessions, 'plank', { ...timeTarget, category: 'mobilita' }), null);
});

test('esercizi MAX: nessun suggerimento', () => {
  const pushUp = { ...bodyweightTarget, reps: { min: 1, max: null } };
  assert.equal(loadAdvice([sessionWith('piegamenti', weightSets(0, [30, 30, 30]))], 'piegamenti', pushUp), null);
  const plankMax = { ...timeTarget, duration: { min: 1, max: null } };
  assert.equal(loadAdvice([sessionWith('plank', [{ duration: 90, effort: 'giusta' }])], 'plank', plankMax), null);
});

test('il valore suggerito è arrotondato al mezzo chilo', () => {
  const sessions = [sessionWith('panca', weightSets(60.3, [11, 11, 11]))];
  assert.equal(loadAdvice(sessions, 'panca', weightTarget).value, 63);
});

test('adviceBySession: un suggerimento (o null) per ogni esercizio della sessione', () => {
  const sessions = [sessionWith('panca', weightSets(60, [11, 11, 11]))];
  const active = { targets: { panca: weightTarget, plank: timeTarget } };
  const result = adviceBySession(sessions, active);
  assert.deepEqual(Object.keys(result), ['panca', 'plank']);
  assert.equal(result.panca.value, 62.5);
  assert.equal(result.plank, null);
});

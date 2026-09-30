import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adviceHtml,
  focusTargetText,
  formatFieldValue,
  hasExerciseTexts,
  outcomeOf,
  setFields,
  targetText,
  unitsText,
} from '../js/views/controls.js';

const weight = { name: 'Panca', type: 'weight', category: 'forza', sides: 1, sets: 3, reps: { min: 8, max: 10 }, load: 'total' };
const plank = { name: 'Plank', type: 'time', category: 'forza', sides: 2, sets: 2, duration: { min: 30, max: 30 } };
const cardio = { name: 'Corsa', type: 'cardio', category: 'forza', sides: 1, sets: 1, duration: { min: 1200, max: 1800 } };
const cardioFree = { ...cardio, duration: null };

test('targetText: righe della lista per tipo, per lato e cardio senza obiettivo', () => {
  assert.equal(targetText(weight), '3 × 8-10');
  assert.equal(targetText(plank), '2 × 30');
  assert.equal(unitsText(plank), 'secondi per lato');
  assert.equal(targetText(cardio), '1 × 20:00-30:00');
  assert.equal(targetText(cardioFree), '1 serie');
  assert.equal(unitsText(cardio), 's · km · liv · km/h');
  assert.equal(unitsText({ ...weight, load: 'per-dumbbell' }), 'kg a manubrio × rip');
});

test('esercizi MAX: "MAX" nella lista e nel focus', () => {
  const pushUp = { name: 'Piegamenti', type: 'bodyweight', category: 'forza', sides: 1, sets: 3, reps: { min: 1, max: null } };
  const plankMax = { ...plank, sides: 1, sets: 3, duration: { min: 1, max: null } };
  assert.equal(targetText(pushUp), '3 × MAX');
  assert.equal(focusTargetText(pushUp, 0), 'Serie 1 di 3 · MAX rip');
  assert.equal(focusTargetText(plankMax, 1), 'Serie 2 di 3 · MAX s');
  assert.equal(outcomeOf({ weight: 0, reps: 0, effort: 'dura' }, pushUp), null);
  assert.equal(outcomeOf({ weight: 0, reps: 40, effort: 'facile' }, pushUp), null);
});

test('focusTargetText: "Serie n di m" con obiettivo, unità e per lato', () => {
  assert.equal(focusTargetText(weight, 1), 'Serie 2 di 3 · 8-10 rip');
  assert.equal(focusTargetText(plank, 0), 'Serie 1 di 2 · 30 s per lato');
  assert.equal(focusTargetText({ ...cardio, duration: { min: 1500, max: 1500 } }, 0), 'Serie 1 di 1 · 25:00');
  assert.equal(focusTargetText(cardioFree, 0), 'Serie 1 di 1');
});

test('hasExerciseTexts: vero con almeno un testo non vuoto', () => {
  assert.equal(hasExerciseTexts(weight), false);
  assert.equal(hasExerciseTexts({ ...weight, description: 'Schiena appoggiata' }), true);
  assert.equal(hasExerciseTexts({ ...weight, steps: ['Scendi'] }), true);
  assert.equal(hasExerciseTexts({ ...weight, tips: [] }), false);
  assert.equal(hasExerciseTexts({ ...weight, description: '' }), false);
});

test('setFields: campi per tipo, nell\'ordine mostrato', () => {
  assert.deepEqual(setFields(weight).map(([field]) => field), ['weight', 'reps']);
  assert.deepEqual(setFields({ ...weight, load: 'per-dumbbell' })[0], ['weight', 'peso a manubrio']);
  assert.deepEqual(setFields(plank).map(([field]) => field), ['duration']);
  assert.deepEqual(setFields(cardio).map(([field]) => field), ['duration', 'distance', 'level', 'speed']);
});

test('outcomeOf: cardio senza esito anche senza obiettivo; gli altri come setOutcome', () => {
  assert.equal(outcomeOf({ duration: 900, effort: 'giusta' }, cardioFree), null);
  assert.equal(outcomeOf({ weight: 50, reps: 6, effort: 'dura' }, weight), 'fallita');
});

test('formatFieldValue: distanza a 2 decimali, gli altri campi a 1', () => {
  assert.equal(formatFieldValue('distance', 5.25), '5,25');
  assert.equal(formatFieldValue('speed', 12.5), '12,5');
  assert.equal(formatFieldValue('weight', 62.5), '62,5');
  assert.equal(formatFieldValue('reps', 8), '8');
  assert.equal(formatFieldValue('distance', null), '');
});

test('setFields e unitsText: niente zavorra per bodyweight di stretching/mobilità', () => {
  const pushUp = { name: 'Piegamenti', type: 'bodyweight', category: 'forza', sides: 1, sets: 3, reps: { min: 8, max: 12 } };
  const catCow = { ...pushUp, name: 'Gatto-mucca', category: 'mobilita', reps: { min: 10, max: 10 } };
  assert.deepEqual(setFields(pushUp).map(([field]) => field), ['weight', 'reps']);
  assert.equal(unitsText(pushUp), 'zavorra kg × rip');
  assert.deepEqual(setFields(catCow).map(([field]) => field), ['reps']);
  assert.deepEqual(setFields({ ...catCow, category: 'stretching', sides: 2 }).map(([field]) => field), ['reps']);
  assert.equal(unitsText(catCow), 'rip');
  assert.equal(unitsText({ ...catCow, sides: 2 }), 'rip per lato');
  const { category, ...oldPushUp } = pushUp;
  assert.deepEqual(setFields(oldPushUp).map(([field]) => field), ['weight', 'reps']);
});

test('adviceHtml: riga con "Usa" per up, solo testo per up-time', () => {
  const up = { kind: 'up', value: 62.5, text: "Prova 62,5 kg · l'ultima volta oltre 10 rip su tutte le serie" };
  const html = adviceHtml(up, 'panca', { weight: 60, reps: 10, effort: null });
  assert.match(html, /Prova 62,5 kg · l&#39;ultima volta oltre 10 rip su tutte le serie/);
  assert.match(html, /data-action="use-advice" data-exercise="panca"/);
  assert.match(html, /data-value="62.5"/);
  assert.match(html, /aria-label="Usa il peso suggerito 62,5 kg"/);
  const time = adviceHtml({ kind: 'up-time', value: 5, text: 'Prova 5 s in più' }, 'plank', { duration: 30, effort: null });
  assert.match(time, /Prova 5 s in più/);
  assert.doesNotMatch(time, /use-advice/);
});

test('adviceHtml: niente riga senza suggerimento, con la serie 1 fatta o col peso già impostato', () => {
  const up = { kind: 'up', value: 62.5, text: 'Prova 62,5 kg' };
  assert.equal(adviceHtml(null, 'panca', { weight: 60, reps: 10, effort: null }), '');
  assert.equal(adviceHtml(up, 'panca', { weight: 60, reps: 10, effort: 'giusta' }), '');
  assert.equal(adviceHtml(up, 'panca', { weight: 62.5, reps: 10, effort: null }), '');
});

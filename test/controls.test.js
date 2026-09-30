import test from 'node:test';
import assert from 'node:assert/strict';
import { focusTargetText, hasExerciseTexts, outcomeOf, setFields, targetText, unitsText } from '../js/views/controls.js';

const weight = { name: 'Panca', type: 'weight', category: 'forza', sides: 1, sets: 3, reps: { min: 8, max: 10 }, load: 'total' };
const plank = { name: 'Plank', type: 'time', category: 'forza', sides: 2, sets: 2, duration: { min: 30, max: 30 } };
const cardio = { name: 'Corsa', type: 'cardio', category: 'forza', sides: 1, sets: 1, duration: { min: 1200, max: 1800 } };
const cardioFree = { ...cardio, duration: null };

test('targetText: righe della lista per tipo, per lato e cardio senza obiettivo', () => {
  assert.equal(targetText(weight), '3 × 8-10');
  assert.equal(targetText(plank), '2 × 30 · per lato');
  assert.equal(targetText(cardio), '1 × 20:00-30:00');
  assert.equal(targetText(cardioFree), '1 serie');
  assert.equal(unitsText(cardio), 's · km · liv · km/h');
  assert.equal(unitsText({ ...weight, load: 'per-dumbbell' }), 'kg a manubrio × rip');
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

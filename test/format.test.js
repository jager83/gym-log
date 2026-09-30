import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  formatDuration,
  formatElapsed,
  formatNumber,
  formatRange,
  formatSet,
  parseNumberInput,
} from '../js/format.js';

test('parseNumberInput accetta virgola e punto', () => {
  assert.equal(parseNumberInput('62,5'), 62.5);
  assert.equal(parseNumberInput('62.5'), 62.5);
  assert.equal(parseNumberInput(' 10 '), 10);
  assert.equal(parseNumberInput('62,'), 62);
});

test('parseNumberInput restituisce null per vuoto o non numerico', () => {
  assert.equal(parseNumberInput(''), null);
  assert.equal(parseNumberInput('   '), null);
  assert.equal(parseNumberInput('abc'), null);
});

test('formatNumber usa la virgola e niente separatore migliaia', () => {
  assert.equal(formatNumber(62.5), '62,5');
  assert.equal(formatNumber(60), '60');
  assert.equal(formatNumber(1000), '1000');
  assert.equal(formatNumber(null), '');
  assert.equal(formatNumber(undefined), '');
});

test('formatDuration', () => {
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(600), '10:00');
});

test('formatRange', () => {
  assert.equal(formatRange({ min: 8, max: 10 }), '8-10');
  assert.equal(formatRange({ min: 8, max: 8 }), '8');
});

test('formatSet per tipo', () => {
  assert.equal(formatSet({ weight: 60, reps: 10 }, 'weight'), '60×10');
  assert.equal(formatSet({ weight: 62.5, reps: 9 }, 'weight'), '62,5×9');
  assert.equal(formatSet({ weight: null, reps: 10 }, 'weight'), '–×10');
  assert.equal(formatSet({ weight: 0, reps: 8 }, 'bodyweight'), '8');
  assert.equal(formatSet({ weight: 5, reps: 8 }, 'bodyweight'), '+5×8');
  assert.equal(formatSet({ duration: 45 }, 'time'), '0:45');
  assert.equal(
    formatSet({ duration: 1500, distance: 5.2, level: 8, speed: 12 }, 'cardio'),
    '25:00 · 5,2 km · liv 8 · 12 km/h',
  );
  assert.equal(formatSet({ duration: 1500 }, 'cardio'), '25:00');
});

test('escapeHtml', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(5), '5');
});

test('formatElapsed: minuti interi, ore oltre i 60 minuti', () => {
  assert.equal(formatElapsed(0), '0 min');
  assert.equal(formatElapsed(59), '0 min');
  assert.equal(formatElapsed(52 * 60 + 30), '52 min');
  assert.equal(formatElapsed(3600), '1 h 00 min');
  assert.equal(formatElapsed(3600 + 5 * 60), '1 h 05 min');
  assert.equal(formatElapsed(-10), '0 min');
});

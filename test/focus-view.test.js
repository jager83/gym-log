import test from 'node:test';
import assert from 'node:assert/strict';
import { focusSelector, ringFraction } from '../js/views/focus.js';

test('ringFraction: rimanente sul totale, fra 0 e 1', () => {
  assert.equal(ringFraction(45000, 90000), 0.5);
  assert.equal(ringFraction(90000, 90000), 1);
  assert.equal(ringFraction(0, 90000), 0);
});

test('ringFraction: oltre il totale (+15 s) resta piena; negativo a 0; totale non valido piena', () => {
  assert.equal(ringFraction(105000, 90000), 1);
  assert.equal(ringFraction(-500, 90000), 0);
  assert.equal(ringFraction(1000, 0), 1);
  assert.equal(ringFraction(1000, Number.NaN), 1);
});

test('focusSelector: il pulsante macchina si ritrova per data-machine dopo il ridisegno', () => {
  globalThis.CSS ??= { escape: (value) => value };
  const row = { dataset: { exercise: 'corsa', set: '0' } };
  const button = { dataset: { action: 'machine', machine: 'cyclette' }, closest: () => row };
  assert.equal(focusSelector(button), '[data-exercise="corsa"][data-set="0"] [data-action="machine"][data-machine="cyclette"]');
});

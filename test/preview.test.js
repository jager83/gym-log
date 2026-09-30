import test from 'node:test';
import assert from 'node:assert/strict';
import { previewSessionOf } from '../js/views/preview.js';
import { at, program } from './fixtures.js';
import { emptyState, playSession } from './helpers.js';

test('previewSessionOf costruisce la stessa sessione di startSession senza salvarla', () => {
  const session = previewSessionOf(program(), emptyState(), 'A');
  assert.equal(session.workoutId, 'A');
  assert.equal(session.workoutName, 'Allenamento A');
  assert.equal(session.blocks.length, 2);
  assert.deepEqual(Object.keys(session.entries).sort(), ['curl', 'panca', 'trazioni']);
});

test('previewSessionOf funziona anche con una sessione attiva di un altro allenamento, senza toccarla', () => {
  const finished = playSession(program(), emptyState(), 'B', {}, '2024-01-01T10:00:00.000Z', '2024-01-01T10:30:00.000Z');
  const withActive = { ...finished, activeSession: { id: 's_active', workoutId: 'C', workoutName: 'Allenamento C' } };

  const session = previewSessionOf(program(), withActive, 'A', at('2024-01-02T09:00:00.000Z'));

  assert.equal(session.workoutId, 'A');
  assert.deepEqual(withActive.activeSession, { id: 's_active', workoutId: 'C', workoutName: 'Allenamento C' });
});

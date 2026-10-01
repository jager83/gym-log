import test from 'node:test';
import assert from 'node:assert/strict';
import { dayDetailHtml, daysListHtml, exerciseCountOf } from '../js/views/days.js';

const session = (overrides = {}) => ({
  id: 's1',
  workoutId: 'A',
  workoutName: 'Allenamento A',
  startedAt: '2026-09-27T18:00:00.000Z',
  endedAt: '2026-09-27T18:52:30.000Z',
  blocks: [
    { rest: 90, phase: null, exerciseIds: ['panca'] },
    { rest: 90, phase: null, exerciseIds: ['curl'] },
  ],
  targets: {
    panca: { name: 'Panca piana', type: 'weight', category: 'forza', sets: 3, reps: { min: 8, max: 10 } },
    curl: { name: 'Curl', type: 'weight', category: 'forza', sets: 2, reps: { min: 10, max: 12 }, load: 'per-dumbbell' },
  },
  entries: {
    panca: [
      { weight: 60, reps: 8, effort: 'giusta' },
      { weight: 60, reps: 8, effort: 'dura' },
      { weight: 60, reps: null, effort: null },
    ],
    curl: [{ weight: 10, reps: null, effort: null }],
  },
  bodyWeight: null,
  ...overrides,
});

test('exerciseCountOf conta solo gli esercizi con almeno una serie fatta', () => {
  assert.equal(exerciseCountOf(session()), 1);
  const bothDone = session({ entries: { panca: [{ weight: 60, reps: 8, effort: 'giusta' }], curl: [{ weight: 10, reps: 10, effort: 'giusta' }] } });
  assert.equal(exerciseCountOf(bothDone), 2);
});

test('daysListHtml: vuoto', () => {
  assert.match(daysListHtml([]), /Nessuna giornata registrata\./);
});

test('daysListHtml: più recenti prima, conteggio singolare/plurale', () => {
  const older = session({ id: 'old', endedAt: '2026-09-20T18:00:00.000Z' });
  const newer = session({ id: 'new', endedAt: '2026-09-27T18:52:30.000Z' });
  const html = daysListHtml([older, newer]);
  assert.ok(html.indexOf('days/new') < html.indexOf('days/old'), 'la più recente va per prima');
  assert.match(html, /1 esercizio/);

  const twoExercises = session({
    id: 'two',
    entries: {
      panca: [{ weight: 60, reps: 8, effort: 'giusta' }],
      curl: [{ weight: 10, reps: 10, effort: 'giusta' }],
    },
  });
  assert.match(daysListHtml([twoExercises]), /2 esercizi(?!o)/);
});

test('daysListHtml: pulsante di eliminazione per riga, fuori dal link', () => {
  const html = daysListHtml([session()]);
  assert.match(html, /data-action="delete" data-session="s1"/);
  assert.match(html, /aria-label="Elimina giornata del/);
});

test('dayDetailHtml: id sconosciuto', () => {
  assert.match(dayDetailHtml(null), /Giornata non trovata\./);
  assert.match(dayDetailHtml(null), /href="#\/days"/);
});

test('dayDetailHtml: solo gli esercizi/serie fatte, in ordine di blocco, con durata e nota manubrio', () => {
  const html = dayDetailHtml(session());
  assert.match(html, /Panca piana/);
  assert.doesNotMatch(html, /Curl/);
  assert.equal((html.match(/class="log__set(?=["\s])/g) ?? []).length, 2);
  assert.match(html, /52 min/);
  assert.doesNotMatch(html, /peso a manubrio/);
});

test('dayDetailHtml: nota "peso a manubrio" quando l\'esercizio fatto è per-dumbbell', () => {
  const curlDone = session({
    entries: {
      panca: [{ weight: 60, reps: null, effort: null }, { weight: 60, reps: null, effort: null }, { weight: 60, reps: null, effort: null }],
      curl: [{ weight: 10, reps: 10, effort: 'giusta' }],
    },
  });
  const html = dayDetailHtml(curlDone);
  assert.doesNotMatch(html, /Panca piana/);
  assert.match(html, /Curl/);
  assert.match(html, /peso a manubrio/);
});

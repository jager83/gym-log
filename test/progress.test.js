import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProgram } from '../js/program.js';
import { exerciseRows, progressHtml } from '../js/views/progress.js';

const program = normalizeProgram({
  workouts: [
    {
      id: 'A',
      name: 'Giorno 1',
      blocks: [
        { exercises: [{ id: 'panca', name: 'Panca', type: 'weight', sets: 2, reps: { min: 8, max: 10 } }] },
        { exercises: [{ id: 'trazioni', name: 'Trazioni', type: 'weight', assisted: true, sets: 2, reps: { min: 8, max: 10 } }] },
        { exercises: [{ id: 'plank', name: 'Plank', type: 'time', sets: 1, duration: 'max' }] },
      ],
    },
  ],
});

const NOW = new Date(2026, 9, 1, 12);

const session = (id, date, entries) => ({
  id,
  workoutId: 'A',
  workoutName: 'Giorno 1',
  startedAt: date.toISOString(),
  endedAt: date.toISOString(),
  bodyWeight: null,
  blocks: [],
  targets: {
    panca: { name: 'Panca', type: 'weight', category: 'forza', sides: 1, sets: 2, reps: { min: 8, max: 10 }, load: 'total' },
    trazioni: { name: 'Trazioni', type: 'weight', category: 'forza', sides: 1, sets: 2, reps: { min: 8, max: 10 }, load: 'total', assisted: true },
    plank: { name: 'Plank', type: 'time', category: 'forza', sides: 1, sets: 1, duration: { min: 1, max: null } },
  },
  entries: {
    panca: entries.panca ?? [{ weight: null, reps: null, effort: null }, { weight: null, reps: null, effort: null }],
    trazioni: entries.trazioni ?? [{ weight: null, reps: null, effort: null }, { weight: null, reps: null, effort: null }],
    plank: entries.plank ?? [{ duration: null, effort: null }],
  },
});

const lifts = (weight, a, b) => [{ weight, reps: a, effort: 'giusta' }, { weight, reps: b, effort: 'giusta' }];

const sessions = [
  session('s1', new Date(2026, 7, 3, 19), { panca: lifts(50, 10, 10) }),
  session('s2', new Date(2026, 8, 15, 19), { panca: lifts(60, 9, 9), trazioni: lifts(30, 9, 9) }),
  session('s3', new Date(2026, 8, 29, 19), { panca: lifts(62.5, 9, 9), trazioni: lifts(25, 9, 9) }),
];

test('progressHtml: nessuna sessione', () => {
  const html = progressHtml(program, [], NOW);
  assert.match(html, /Progressi/);
  assert.match(html, /Nessuna sessione registrata\./);
  assert.doesNotMatch(html, /segmented/);
});

test('progressHtml: selettore periodo con il default premuto', () => {
  const html = progressHtml(program, sessions, NOW);
  assert.match(html, /data-action="period" data-value="4" aria-pressed="true">4 sett/);
  assert.match(html, /data-value="12" aria-pressed="false">12 sett/);
  assert.match(html, /data-value="all" aria-pressed="false">Tutto/);
  assert.match(progressHtml(program, sessions, NOW, 'all'), /data-value="all" aria-pressed="true"/);
  assert.match(progressHtml(program, sessions, NOW, 'boh'), /data-value="4" aria-pressed="true"/);
});

test('progressHtml: riepilogo e grafici del periodo', () => {
  const four = progressHtml(program, sessions, NOW, '4');
  assert.match(four, /<dt>Sessioni<\/dt><dd>2<\/dd>/);
  assert.match(four, /<dt>A settimana<\/dt><dd>0,5<\/dd>/);
  assert.match(four, /<dt>Tonnellaggio<\/dt><dd>2,2 t<\/dd>/);
  assert.equal((four.match(/<rect /g) ?? []).length, 12);
  assert.equal((four.match(/chart-bar--partial/g) ?? []).length, 3);
  const all = progressHtml(program, sessions, NOW, 'all');
  assert.match(all, /<dt>Sessioni<\/dt><dd>3<\/dd>/);
});

test('progressHtml: suggerimenti con link al dettaglio, oppure il messaggio dei dati insufficienti', () => {
  const ready = [...sessions, session('s4', new Date(2026, 8, 30, 19), { panca: lifts(62.5, 11, 12) })];
  const html = progressHtml(program, ready, NOW);
  assert.match(html, /class="insight insight--positive"/);
  assert.match(html, /href="#\/history\/panca"><strong>Panca<\/strong> Prova 65 kg/);
  const sparse = progressHtml(program, [sessions[0]], NOW);
  assert.match(sparse, /Servono più sessioni per i suggerimenti/);
});

test('exerciseRows: ultimo valore, variazione nel periodo, assistenza in kg', () => {
  const rows = exerciseRows(program, sessions, NOW, 4);
  assert.deepEqual(rows, [
    { exerciseId: 'panca', name: 'Panca', value: 81.3, unit: 'kg', change: '+4%' },
    { exerciseId: 'trazioni', name: 'Trazioni', value: 25, unit: 'kg', change: '−5 kg' },
  ]);
  const all = exerciseRows(program, sessions, NOW, null);
  assert.equal(all[0].change, '+22%');
  const one = exerciseRows(program, sessions.slice(2), NOW, 4);
  assert.equal(one[0].change, null);
});

test('progressHtml: elenco esercizi con link e dettaglio', () => {
  const html = progressHtml(program, sessions, NOW);
  assert.match(html, /href="#\/history\/panca">\s*<span>Panca<\/span>\s*<span class="muted">81,3 kg · \+4%<\/span>/);
  assert.doesNotMatch(html, /history\/plank/);
});

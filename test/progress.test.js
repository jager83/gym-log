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
  assert.equal((four.match(/<rect class="chart-bar/g) ?? []).length, 12);
  assert.match(four, /icon--calendar[\s\S]*<dt>Sessioni/);
  assert.match(four, /icon--repeat[\s\S]*<dt>A settimana/);
  assert.match(four, /icon--kettlebell[\s\S]*<dt>Tonnellaggio/);
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
    { exerciseId: 'panca', name: 'Panca', type: 'weight', value: 81.3, unit: 'kg', change: '+4%', trend: 'better' },
    { exerciseId: 'trazioni', name: 'Trazioni', type: 'weight', value: 25, unit: 'kg', change: '−5 kg', trend: 'better' },
  ]);
  const all = exerciseRows(program, sessions, NOW, null);
  assert.equal(all[0].change, '+22%');
  const one = exerciseRows(program, sessions.slice(2), NOW, 4);
  assert.equal(one[0].change, null);
  assert.equal(one[0].trend, null);
  const worse = [session('w1', new Date(2026, 8, 22, 19), { panca: lifts(60, 9, 9) }), session('w2', new Date(2026, 8, 29, 19), { panca: lifts(55, 9, 9) })];
  assert.equal(exerciseRows(program, worse, NOW, 4)[0].trend, 'worse');
  const flat = [session('f1', new Date(2026, 8, 22, 19), { panca: lifts(60, 9, 9) }), session('f2', new Date(2026, 8, 29, 19), { panca: lifts(60, 9, 9) })];
  const [flatRow] = exerciseRows(program, flat, NOW, 4);
  assert.deepEqual([flatRow.change, flatRow.trend], ['+0%', 'flat']);
  const moreAssist = [session('a1', new Date(2026, 8, 22, 19), { trazioni: lifts(25, 9, 9) }), session('a2', new Date(2026, 8, 29, 19), { trazioni: lifts(30, 9, 9) })];
  assert.equal(exerciseRows(program, moreAssist, NOW, 4)[0].trend, 'worse');
});

test('progressHtml: elenco esercizi con link e dettaglio', () => {
  const html = progressHtml(program, sessions, NOW);
  assert.match(html, /href="#\/history\/panca">\s*<span class="history__name"><svg class="icon icon--row icon--dumbbell"[^]*?<\/svg><span>Panca<\/span><\/span>\s*<span class="muted">81,3 kg <span class="chip chip--ok">\+4%<\/span><\/span>/);
  assert.match(html, /<span class="muted">25 kg <span class="chip chip--ok">−5 kg<\/span><\/span>/);
  assert.doesNotMatch(html, /history\/plank/);
});

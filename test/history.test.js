import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProgram } from '../js/program.js';
import { chartViews, detailHtml, historyMetricLabel, insightsHtml, logSetHtml } from '../js/views/history.js';

const item = (fields) => ({ type: 'weight', category: 'forza', target: { min: 8, max: 10 }, ...fields });

test('logSetHtml: cardio senza obiettivo di durata non va in errore e non mostra esito', () => {
  const cardioFree = item({ type: 'cardio', target: null });
  const html = logSetHtml({ duration: 600, distance: 2.5, effort: 'giusta' }, cardioFree);
  assert.match(html, /10:00 · 2,5 km/);
  assert.doesNotMatch(html, /is-fallita|is-carico-basso/);
});

test('logSetHtml: cardio sotto l\'obiettivo non è mai rosso, come nella sessione', () => {
  const cardio = item({ type: 'cardio', target: { min: 1200, max: 1800 } });
  const html = logSetHtml({ duration: 600, effort: 'dura' }, cardio);
  assert.doesNotMatch(html, /is-fallita/);
});

test('logSetHtml: forza con pallino di fatica ed esito', () => {
  const html = logSetHtml({ weight: 60, reps: 6, effort: 'dura' }, item());
  assert.match(html, /class="log__set is-fallita"/);
  assert.match(html, /dot dot--dura/);
  assert.match(html, /aria-label="Dura"/i);
});

test('logSetHtml: stretching/mobilità con l\'icona "Fatto" al posto del pallino', () => {
  const stretching = item({ type: 'time', category: 'stretching', target: { min: 30, max: 30 } });
  const html = logSetHtml({ duration: 30, effort: 'fatto' }, stretching);
  assert.match(html, /icon--check/);
  assert.match(html, /aria-label="Fatto"/);
  assert.doesNotMatch(html, /dot--|undefined/);
  assert.match(html, /0:30/);
  const mobility = item({ type: 'bodyweight', category: 'mobilita', target: { min: 10, max: 10 } });
  assert.match(logSetHtml({ reps: 10, weight: 0, effort: 'fatto' }, mobility), /icon--check[\s\S]*10/);
});

test('historyMetricLabel: etichetta della serie, del tipo per forza, nessuna per stretching/mobilità e cardio senza serie', () => {
  const series = { label: 'Distanza (km)', points: [] };
  assert.equal(historyMetricLabel([item({ type: 'cardio', target: null })], series), 'Distanza (km)');
  assert.equal(historyMetricLabel([item({ type: 'cardio', target: null })], null), null);
  assert.equal(historyMetricLabel([item({ type: 'time', category: 'stretching' })], null), null);
  assert.equal(historyMetricLabel([item({ type: 'bodyweight', category: 'mobilita' })], null), null);
  assert.equal(historyMetricLabel([item()], null), '1RM stimato (kg)');
});

const detailProgram = normalizeProgram({
  workouts: [
    {
      id: 'A',
      name: 'Giorno 1',
      blocks: [
        { exercises: [{ id: 'panca', name: 'Panca', type: 'weight', sets: 2, reps: { min: 8, max: 10 } }] },
        { exercises: [{ id: 'plank', name: 'Plank', type: 'time', sets: 1, duration: 'max' }] },
        { exercises: [{ id: 'bike', name: 'Bike', type: 'cardio', sets: 1, duration: 300 }] },
      ],
    },
  ],
});

const detailSession = (id, iso, entries) => ({
  id,
  workoutId: 'A',
  workoutName: 'Giorno 1',
  startedAt: iso,
  endedAt: iso,
  bodyWeight: null,
  blocks: [],
  targets: {
    panca: { name: 'Panca', type: 'weight', category: 'forza', sides: 1, sets: 2, reps: { min: 8, max: 10 }, load: 'total' },
    plank: { name: 'Plank', type: 'time', category: 'forza', sides: 1, sets: 1, duration: { min: 1, max: null } },
    bike: { name: 'Bike', type: 'cardio', category: 'forza', sides: 1, sets: 1, duration: { min: 300, max: 300 } },
  },
  entries: {
    panca: entries.panca ?? [{ weight: null, reps: null, effort: null }, { weight: null, reps: null, effort: null }],
    plank: entries.plank ?? [{ duration: null, effort: null }],
    bike: entries.bike ?? [{ duration: null, effort: null }],
  },
});

const detailSessions = [
  detailSession('s1', '2026-09-22T17:00:00.000Z', { panca: [{ weight: 60, reps: 10, effort: 'giusta' }, { weight: 60, reps: 10, effort: 'giusta' }], plank: [{ duration: 40, effort: 'giusta' }], bike: [{ duration: 300, effort: 'giusta' }] }),
  detailSession('s2', '2026-09-24T17:00:00.000Z', { panca: [{ weight: 60, reps: 11, effort: 'giusta' }, { weight: 60, reps: 12, effort: 'giusta' }], plank: [{ duration: 50, effort: 'giusta' }] }),
];

const NOW = new Date('2026-09-25T10:00:00.000Z');

test('chartViews: principale, volume e tonnellaggio; nessuna senza serie', () => {
  assert.deepEqual(chartViews(null, []), []);
  const series = { label: '1RM stimato (kg)', metric: '1rm', points: [{ date: 'd1', value: 80 }] };
  const stats = [{ date: 'd1', value: 80, metric: '1rm', volume: 20, volumeUnit: 'rip', tonnage: 1200 }];
  assert.deepEqual(chartViews(series, stats).map(({ value, label, title }) => [value, label, title]), [
    ['main', '1RM', null],
    ['volume', 'Volume', 'Volume (rip)'],
    ['tonnage', 'Tonnellaggio', 'Tonnellaggio (kg)'],
  ]);
  const noTonnage = [{ ...stats[0], volumeUnit: 's', tonnage: null }];
  assert.deepEqual(chartViews(series, noTonnage).map(({ value, title }) => [value, title]), [['main', null], ['volume', 'Volume (s)']]);
});

test('detailHtml: selettore metrica, default principale, scelta del tonnellaggio', () => {
  const html = detailHtml(detailProgram, detailSessions, 'panca', 'main', NOW);
  assert.match(html, /data-action="metric" data-value="main" aria-pressed="true">1RM/);
  assert.match(html, /data-value="tonnage" aria-pressed="false">Tonnellaggio/);
  assert.match(html, /<p class="history__metric">1RM stimato \(kg\)<\/p>/);
  const tonnage = detailHtml(detailProgram, detailSessions, 'panca', 'tonnage', NOW);
  assert.match(tonnage, /<p class="history__metric">Tonnellaggio \(kg\)<\/p>/);
  assert.match(tonnage, /1380/);
  const unknown = detailHtml(detailProgram, detailSessions, 'panca', 'boh', NOW);
  assert.match(unknown, /data-value="main" aria-pressed="true"/);
});

test('detailHtml: time senza tonnellaggio ha solo principale e volume; cardio nessun selettore', () => {
  const plank = detailHtml(detailProgram, detailSessions, 'plank', 'main', NOW);
  assert.match(plank, /data-value="volume"/);
  assert.doesNotMatch(plank, /data-value="tonnage"/);
  const bike = detailHtml(detailProgram, detailSessions, 'bike', 'main', NOW);
  assert.doesNotMatch(bike, /segmented/);
  assert.doesNotMatch(bike, /class="insights"/);
});

test('detailHtml: suggerimenti dell\'esercizio senza link', () => {
  const html = detailHtml(detailProgram, detailSessions, 'panca', 'main', NOW);
  assert.match(html, /<li class="insight insight--positive"><span class="insight__dot" aria-hidden="true"><\/span><span>Prova 62,5 kg/);
  assert.doesNotMatch(html, /insight__link/);
});

test('insightsHtml: escape del testo e del nome, link solo con linked ed exerciseId', () => {
  const html = insightsHtml([
    { kind: 'progress', tone: 'positive', text: '<x>', exerciseId: 'a b', name: '<n>' },
    { kind: 'workout-gap', tone: 'neutral', text: 'Giorno 3 non ancora fatto' },
  ], { linked: true });
  assert.match(html, /href="#\/history\/a%20b"><strong>&lt;n&gt;<\/strong> &lt;x&gt;<\/a>/);
  assert.match(html, /insight--neutral"><span class="insight__dot" aria-hidden="true"><\/span><span>Giorno 3 non ancora fatto<\/span>/);
});

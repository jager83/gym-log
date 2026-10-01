import test from 'node:test';
import assert from 'node:assert/strict';
import { historyMetricLabel, logSetHtml } from '../js/views/history.js';

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

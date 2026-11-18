import test from 'node:test';
import assert from 'node:assert/strict';
import { loadArchiveIndex, loadArchivedProgram } from '../js/archive.js';
import { rawProgram } from './fixtures.js';

const entry = { version: 1, name: 'Scheda settembre 2026', from: '2026-09-27', to: '2026-11-17', file: 'program-v1.json' };
const fetchText = (text, ok = true) => async () => ({ ok, status: ok ? 200 : 404, text: async () => text, json: async () => JSON.parse(text) });

test('loadArchiveIndex restituisce le voci dell\'indice', async () => {
  assert.deepEqual(await loadArchiveIndex(fetchText(JSON.stringify([entry]))), [entry]);
});

test('loadArchiveIndex lancia con JSON non valido, voci malformate o file assente', async () => {
  await assert.rejects(loadArchiveIndex(fetchText('{')), { message: 'Archivio schede non disponibile' });
  await assert.rejects(loadArchiveIndex(fetchText(JSON.stringify([{ version: 1 }]))), { message: 'Archivio schede non disponibile' });
  await assert.rejects(loadArchiveIndex(fetchText('', false)), { message: 'Archivio schede non disponibile' });
});

test('loadArchivedProgram carica il file della voce dall\'archivio', async () => {
  let requested = null;
  const fetchFn = async (url) => {
    requested = url;
    return { ok: true, status: 200, text: async () => JSON.stringify(rawProgram()) };
  };
  const archived = await loadArchivedProgram(entry, fetchFn);
  assert.equal(requested, 'data/archive/program-v1.json');
  assert.equal(archived.workouts.length, 3);
});

import { archiveErrorHtml, archiveListHtml, archivedProgramHtml } from '../js/views/archive.js';
import { program } from './fixtures.js';

test('archiveListHtml elenca nome e periodo con il link alla versione', () => {
  const html = archiveListHtml([entry]);
  assert.match(html, /href="#\/archive\/1"/);
  assert.match(html, /Scheda settembre 2026/);
  assert.match(html, /27\/09\/2026 – 17\/11\/2026/);
  assert.match(html, /href="#\/history"/);
});

test('archivedProgramHtml mostra tutti gli allenamenti con recuperi, in sola lettura', () => {
  const html = archivedProgramHtml(entry, program());
  ['Allenamento A', 'Allenamento B', 'Allenamento C', 'Panca piana', 'Curl', 'Plank'].forEach((text) => assert.match(html, new RegExp(text)));
  assert.match(html, /Recupero 120 s/);
  assert.match(html, /Superset/);
  assert.doesNotMatch(html, /Inizia|data-action="begin"|#\/focus/);
  assert.match(html, /href="#\/archive"/);
});

test('archiveErrorHtml: "Scheda non disponibile" con ritorno all\'elenco', () => {
  const html = archiveErrorHtml();
  assert.match(html, /Scheda non disponibile/);
  assert.match(html, /href="#\/history"/);
});

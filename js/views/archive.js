// Schede precedenti (archivio): elenco delle versioni e una scheda in sola lettura, con gli stessi
// blocchi dell'anteprima ma senza "Inizia". I file arrivano da data/archive/ (js/archive.js).
import { loadArchiveIndex, loadArchivedProgram } from '../archive.js';
import { escapeHtml } from '../format.js';
import { createEmptyState } from '../store.js';
import { headerHtml } from './history.js';
import { openExerciseInfo } from './info.js';
import { previewSessionOf } from './preview.js';
import { blockTagsHtml, exerciseHeaderHtml } from './session.js';

// "2026-09-27" → "27/09/2026", senza passare da Date (nessun fuso orario).
const dayOf = (isoDay) => isoDay.split('-').reverse().join('/');

export const archiveListHtml = (index) => `
  <section class="history">
    ${headerHtml('Schede precedenti', '#/history', 'Torna allo storico')}
    <ul class="history__list">
      ${index
        .map(
          (entry) => `
        <li>
          <a class="history__item" href="#/archive/${entry.version}">
            <span class="history__name">${escapeHtml(entry.name)}</span>
            <span class="muted">${dayOf(entry.from)} – ${dayOf(entry.to)}</span>
          </a>
        </li>`,
        )
        .join('')}
    </ul>
  </section>`;

const blockHtml = (session, blockIndex) => {
  const block = session.blocks[blockIndex];
  const rest = block.rest > 0 ? `<p class="block__target">Recupero ${block.rest} s</p>` : '';
  return `
    <article class="block">
      ${blockTagsHtml(block, block.exerciseIds.length > 1)}
      ${exerciseHeaderHtml(session, blockIndex, {}, false)}
      ${rest}
    </article>`;
};

const sessionsOf = (program) =>
  program.workouts.map((workout) => previewSessionOf(program, createEmptyState(), workout.id));

export const archivedProgramHtml = (entry, program) => `
  <section class="session">
    ${headerHtml(entry.name, '#/archive', 'Torna alle schede precedenti')}
    ${sessionsOf(program)
      .map(
        (session) => `
      <h2 class="history__group">${escapeHtml(session.workoutName)}</h2>
      <div class="blocks">${session.blocks.map((_, index) => blockHtml(session, index)).join('')}</div>`,
      )
      .join('')}
  </section>`;

export const archiveErrorHtml = (backHash = '#/history') => `
  <section class="history">
    ${headerHtml('Schede precedenti', backHash, 'Indietro')}
    <p class="muted">Scheda non disponibile</p>
  </section>`;

export const renderArchive = (root, ctx, version) => {
  let targets = {};
  let active = true;
  let closeInfo = null;
  root.innerHTML = `<section class="history">${headerHtml('Schede precedenti', '#/history', 'Torna allo storico')}</section>`;

  const load = async () => {
    try {
      const index = await loadArchiveIndex();
      if (version === null) return archiveListHtml(index);
      const entry = index.find((item) => item.version === version);
      if (!entry) return archiveErrorHtml('#/archive');
      const program = await loadArchivedProgram(entry);
      targets = Object.assign({}, ...sessionsOf(program).map((session) => session.targets));
      return archivedProgramHtml(entry, program);
    } catch {
      return archiveErrorHtml(version === null ? '#/history' : '#/archive');
    }
  };
  load().then((html) => {
    if (active) root.innerHTML = html;
  });

  const onClick = (event) => {
    const button = event.target.closest('[data-action="info"]');
    if (!button || !targets[button.dataset.exercise]) return;
    closeInfo?.();
    closeInfo = openExerciseInfo(targets[button.dataset.exercise]);
  };
  root.addEventListener('click', onClick);
  return () => {
    active = false;
    closeInfo?.();
    root.removeEventListener('click', onClick);
  };
};

// Giornate: lista delle sessioni terminate (indipendente dallo storico per esercizio) e dettaglio
// di una singola giornata, con l'eliminazione (singola o di tutto lo storico, quest'ultima da
// history.js). Non tocca mai activeSession.
import { countKey } from '../program.js';
import { isDone } from '../metrics.js';
import { deleteSession } from '../session.js';
import { escapeHtml, formatDate, formatElapsed } from '../format.js';
import { logSetHtml } from './history.js';
import { trashSvg } from './icons.js';
import { confirmDialog } from './modal.js';

const headerHtml = (title, backHash, backLabel) => `
  <header class="page-header">
    <a class="back" href="${backHash}" aria-label="${backLabel}">‹</a>
    <h1>${escapeHtml(title)}</h1>
  </header>`;

// Numero di esercizi della giornata con almeno una serie fatta, al singolare/plurale nel testo.
export const exerciseCountOf = (session) =>
  Object.values(session.entries).filter((sets) => sets.some(isDone)).length;

const exerciseCountLabel = (count) => (count === 1 ? '1 esercizio' : `${count} esercizi`);

const rowHtml = (session) => {
  const date = formatDate(session.endedAt);
  return `
    <li class="days__row">
      <a class="history__item" href="#/days/${encodeURIComponent(session.id)}">
        <span>${escapeHtml(session.workoutName)} · ${date}</span>
        <span class="muted">${exerciseCountLabel(exerciseCountOf(session))}</span>
      </a>
      <button type="button" class="days__trash" data-action="delete" data-session="${escapeHtml(session.id)}"
        aria-label="Elimina giornata del ${date}">${trashSvg()}</button>
    </li>`;
};

export const daysListHtml = (sessions) => {
  const header = headerHtml('Giornate', '#/history', 'Torna allo storico');
  if (!sessions.length) return `<section class="history">${header}<p class="muted">Nessuna giornata registrata.</p></section>`;
  const ordered = [...sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  return `<section class="history">${header}<ul class="history__list days__list">${ordered.map(rowHtml).join('')}</ul></section>`;
};

// Riga di log di un esercizio della giornata: solo se ha almeno una serie fatta. `item` ricalca
// quello costruito da exerciseHistory (metrics.js) perché logSetHtml valuti lo stesso esito.
const exerciseLogItem = (session, exerciseId) => {
  const target = session.targets[exerciseId];
  const doneSets = session.entries[exerciseId].filter(isDone);
  if (!doneSets.length) return '';
  const item = { type: target.type, category: target.category ?? 'forza', target: target[countKey(target.type)] };
  const loadNote = target.load === 'per-dumbbell' ? '<p class="history__load">peso a manubrio</p>' : '';
  return `
    <li class="log__item">
      <p class="log__date">${escapeHtml(target.name)}</p>
      ${loadNote}
      <span class="log__sets">${doneSets.map((set) => logSetHtml(set, item)).join('')}</span>
    </li>`;
};

const durationSeconds = (session) => Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000);

export const dayDetailHtml = (session) => {
  const header = headerHtml(session ? session.workoutName : 'Giornata', '#/days', 'Torna alle giornate');
  if (!session) return `<section class="history">${header}<p class="muted">Giornata non trovata.</p></section>`;

  const exerciseIds = session.blocks.flatMap((block) => block.exerciseIds);
  const log = exerciseIds.map((exerciseId) => exerciseLogItem(session, exerciseId)).join('');

  return `
    <section class="history">
      ${header}
      <p class="days__meta muted">${formatDate(session.endedAt)} · ${formatElapsed(durationSeconds(session))}</p>
      <ul class="log">${log}</ul>
      <div class="days__actions">
        <button type="button" class="button button--danger" data-action="delete" data-session="${escapeHtml(session.id)}">Elimina giornata</button>
      </div>
    </section>`;
};

export const renderDays = (root, ctx, sessionId) => {
  const draw = () => {
    const { sessions } = ctx.getState();
    if (sessionId) {
      root.innerHTML = dayDetailHtml(sessions.find((session) => session.id === sessionId) ?? null);
    } else {
      root.innerHTML = daysListHtml(sessions);
    }
  };

  const confirmDelete = async (id) => {
    const session = ctx.getState().sessions.find((item) => item.id === id);
    if (!session) return;
    const confirmed = await confirmDialog({
      title: 'Eliminare la giornata?',
      message: `${session.workoutName} del ${formatDate(session.endedAt)}. L'operazione non si può annullare.`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!confirmed) return;
    ctx.commit(deleteSession(ctx.getState(), id));
    if (sessionId) ctx.navigate('#/days');
    else draw();
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action="delete"]');
    if (!target) return;
    confirmDelete(target.dataset.session);
  };

  draw();
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
};

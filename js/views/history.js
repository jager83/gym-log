import { countKey, findExercise } from '../program.js';
import { METRIC_LABELS, chartSeries, exerciseHistory, retiredExercises } from '../metrics.js';
import { EFFORT_LABELS, deleteAllSessions } from '../session.js';
import { lineChartSvg } from '../chart.js';
import { outcomeClass, outcomeOf } from './controls.js';
import { escapeHtml, formatDate, formatDay, formatSet } from '../format.js';
import { confirmDialog } from './modal.js';

const headerHtml = (title, backHash, backLabel) => `
  <header class="page-header">
    <a class="back" href="${backHash}" aria-label="${backLabel}">‹</a>
    <h1>${escapeHtml(title)}</h1>
  </header>`;

const listHtml = (program, sessions) => {
  const itemHtml = ({ id, name }) => {
    const last = exerciseHistory(sessions, id).at(-1);
    return `
      <li>
        <a class="history__item" href="#/history/${encodeURIComponent(id)}">
          <span>${escapeHtml(name)}</span>
          <span class="muted">${last ? formatDay(last.date) : '—'}</span>
        </a>
      </li>`;
  };
  const groupHtml = (title, exercises) => `
    <h2 class="history__group">${escapeHtml(title)}</h2>
    <ul class="history__list">${exercises.map(itemHtml).join('')}</ul>`;

  const groups = program.workouts.map((workout) =>
    groupHtml(workout.name, workout.blocks.flatMap((block) => block.exercises)),
  );
  const retired = retiredExercises(program, sessions);
  if (retired.length) groups.push(groupHtml('Non più in scheda', retired));

  const daysLink = `
    <ul class="history__list history__days">
      <li><a class="history__item" href="#/days"><span>Giornate</span></a></li>
    </ul>`;
  const deleteAll = sessions.length
    ? `<div class="days__actions"><button type="button" class="button button--danger" data-action="delete-all">Elimina tutto lo storico</button></div>`
    : '';

  return `<section class="history">${headerHtml('Storico', '#/', 'Torna alla home')}${daysLink}${groups.join('')}${deleteAll}</section>`;
};

const deleteAllMessage = (count) =>
  `${count === 1 ? '1 giornata verrà eliminata' : `${count} giornate verranno eliminate`}. L'operazione non si può annullare.`;

// Forza e cardio: pallino della fatica; stretching/mobilità: ✓ "Fatto" (nessuna faccina).
const setMarkerHtml = (set, category) =>
  category === 'forza'
    ? `<span class="dot dot--${set.effort}" role="img" aria-label="${EFFORT_LABELS[set.effort]}"></span>`
    : '<span class="log__check" role="img" aria-label="Fatto">✓</span>';

// `item` è una voce di exerciseHistory: l'esito segue le regole della sessione (outcomeOf),
// quindi nessun esito per cardio, con o senza obiettivo di durata.
export const logSetHtml = (set, item) => {
  const outcome = outcomeOf(set, { type: item.type, [countKey(item.type)]: item.target });
  const className = outcomeClass(outcome);
  return `
    <span class="log__set${className ? ` ${className}` : ''}">
      ${setMarkerHtml(set, item.category)}${escapeHtml(formatSet(set, item.type))}
    </span>`;
};

// Etichetta della metrica sopra il grafico: quella della serie se c'è; senza serie solo per la
// forza non cardio. Nessuna per stretching/mobilità (niente grafico) né per cardio senza valori.
export const historyMetricLabel = (history, series) => {
  if (series) return series.label;
  const { type, category } = history.at(-1);
  if (category !== 'forza' || type === 'cardio') return null;
  return METRIC_LABELS[type];
};

// Load dell'esercizio: dalla scheda attuale se ancora presente, altrimenti dall'ultimo target salvato.
const exerciseLoad = (program, sessions, exerciseId) => {
  const fromProgram = findExercise(program, exerciseId)?.load;
  if (fromProgram) return fromProgram;
  const lastSession = [...sessions].reverse().find((session) => session.targets[exerciseId]);
  return lastSession?.targets[exerciseId]?.load;
};

const detailHtml = (program, sessions, exerciseId) => {
  const history = exerciseHistory(sessions, exerciseId);
  const name = findExercise(program, exerciseId)?.name ?? history.at(-1)?.name ?? exerciseId;
  const header = headerHtml(name, '#/history', 'Torna allo storico');
  const loadNote = exerciseLoad(program, sessions, exerciseId) === 'per-dumbbell' ? '<p class="history__load">peso a manubrio</p>' : '';
  if (!history.length) return `<section class="history">${header}${loadNote}<p class="muted">Nessuna sessione registrata.</p></section>`;

  const series = chartSeries(history);
  const metricLabel = historyMetricLabel(history, series);
  const chart = series
    ? lineChartSvg(series.points.map((point) => ({ label: formatDay(point.date), value: point.value })), { title: metricLabel })
    : '';
  const log = [...history]
    .reverse()
    .map(
      (item) => `
      <li class="log__item">
        <span class="log__date">${formatDate(item.date)}</span>
        <span class="log__sets">${item.sets.map((set) => logSetHtml(set, item)).join('')}</span>
      </li>`,
    )
    .join('');

  return `
    <section class="history">
      ${header}
      ${loadNote}
      ${metricLabel ? `<p class="history__metric">${metricLabel}</p>` : ''}
      ${chart ? `<div class="chart-card">${chart}</div>` : ''}
      <ul class="log">${log}</ul>
    </section>`;
};

export const renderHistory = (root, ctx, exerciseId) => {
  const draw = () => {
    const { sessions } = ctx.getState();
    root.innerHTML = exerciseId ? detailHtml(ctx.program, sessions, exerciseId) : listHtml(ctx.program, sessions);
  };

  const confirmDeleteAll = async () => {
    const { sessions } = ctx.getState();
    const confirmed = await confirmDialog({
      title: 'Eliminare tutto lo storico?',
      message: deleteAllMessage(sessions.length),
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!confirmed) return;
    ctx.commit(deleteAllSessions(ctx.getState()));
    draw();
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action="delete-all"]');
    if (!target) return;
    confirmDeleteAll();
  };

  draw();
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
};

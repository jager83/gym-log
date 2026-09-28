import { findExercise } from '../program.js';
import { METRIC_LABELS, chartSeries, exerciseHistory, retiredExercises, setOutcome } from '../metrics.js';
import { EFFORT_LABELS } from '../session.js';
import { lineChartSvg } from '../chart.js';
import { escapeHtml, formatDate, formatDay, formatSet } from '../format.js';

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

  return `<section class="history">${headerHtml('Storico', '#/', 'Torna alla home')}${groups.join('')}</section>`;
};

const logSetHtml = (set, item) => {
  const outcome = setOutcome(set, item.type, item.target);
  const className = outcome === 'fallita' || outcome === 'carico-basso' ? ` is-${outcome}` : '';
  return `
    <span class="log__set${className}">
      <span class="dot dot--${set.effort}" role="img" aria-label="${EFFORT_LABELS[set.effort]}"></span>${escapeHtml(formatSet(set, item.type))}
    </span>`;
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
  const loadNote = exerciseLoad(program, sessions, exerciseId) === 'per-dumbbell' ? '<p class="muted">peso a manubrio</p>' : '';
  if (!history.length) return `<section class="history">${header}${loadNote}<p class="muted">Nessuna sessione registrata.</p></section>`;

  const { type } = history.at(-1);
  const series = chartSeries(history);
  const metricLabel = series ? series.label : METRIC_LABELS[type];
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
      <p class="history__metric">${metricLabel}</p>
      ${chart}
      <ul class="log">${log}</ul>
    </section>`;
};

export const renderHistory = (root, ctx, exerciseId) => {
  const { sessions } = ctx.getState();
  root.innerHTML = exerciseId ? detailHtml(ctx.program, sessions, exerciseId) : listHtml(ctx.program, sessions);
  return () => {};
};

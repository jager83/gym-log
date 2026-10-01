// Progressi: riepilogo per periodo, suggerimenti (insights.js), grafici settimanali e variazione di
// ogni esercizio della scheda. Il periodo scelto vive nella vista (non salvato); i suggerimenti
// usano finestre fisse e non dipendono dal periodo.
import { chartSeries, exerciseHistory } from '../metrics.js';
import { weekStart, weeklyTotals } from '../report.js';
import { programLoadExercises, progressInsights } from '../insights.js';
import { barChartSvg } from '../chart.js';
import { escapeHtml, formatDay, formatNumber } from '../format.js';
import { headerHtml, insightsHtml, segmentedHtml } from './history.js';

export const PERIODS = [
  { value: '4', label: '4 sett', weeks: 4 },
  { value: '12', label: '12 sett', weeks: 12 },
  { value: 'all', label: 'Tutto', weeks: null },
];

export const DEFAULT_PERIOD = '4';

const METRIC_UNITS = { '1rm': 'kg', reps: 'rip', duration: 's', assistance: 'kg' };

const MINUS = '−';

const signed = (value, digits = 0) => `${value >= 0 ? '+' : MINUS}${formatNumber(Math.abs(value), digits)}`;

const weeksOf = (period) => (PERIODS.find((item) => item.value === period) ?? PERIODS[0]).weeks;

// Inizio del periodo: lunedì della prima settimana mostrata; null = tutto lo storico.
const periodStart = (now, weeks) => {
  if (weeks === null) return null;
  const start = weekStart(now);
  start.setDate(start.getDate() - (weeks - 1) * 7);
  return start;
};

// Una riga per esercizio della scheda con almeno un punto: ultimo valore e variazione nel periodo
// (percentuale; per l'assistenza in kg). change null con meno di 2 punti nel periodo.
export const exerciseRows = (program, sessions, now, weeks) => {
  const start = periodStart(now, weeks);
  return programLoadExercises(program)
    .map((exercise) => {
      const series = chartSeries(exerciseHistory(sessions, exercise.id));
      if (!series) return null;
      const inPeriod = start ? series.points.filter((point) => Date.parse(point.date) >= start.getTime()) : series.points;
      const last = series.points.at(-1).value;
      let change = null;
      if (inPeriod.length >= 2) {
        const first = inPeriod[0].value;
        const end = inPeriod.at(-1).value;
        if (series.metric === 'assistance') change = `${signed(end - first, 1)} kg`;
        else if (first > 0) change = `${signed(((end - first) / first) * 100)}%`;
      }
      return { exerciseId: exercise.id, name: exercise.name, value: last, unit: METRIC_UNITS[series.metric], change };
    })
    .filter(Boolean);
};

// Tonnellaggio del periodo in tonnellate: in kg supera facilmente le 6 cifre e va a capo.
const summaryHtml = (weeks) => {
  const total = weeks.reduce((sum, week) => sum + week.sessions, 0);
  const tonnage = weeks.reduce((sum, week) => sum + week.tonnage, 0);
  const stat = (label, value) => `<div class="progress__stat"><dt>${label}</dt><dd>${value}</dd></div>`;
  return `
    <dl class="progress__summary">
      ${stat('Sessioni', total)}
      ${stat('A settimana', formatNumber(weeks.length ? total / weeks.length : 0))}
      ${stat('Tonnellaggio', `${formatNumber(tonnage / 1000)} t`)}
    </dl>`;
};

const weeklyChartHtml = (weeks, title, field) => `
  <p class="history__metric">${title}</p>
  <div class="chart-card">${barChartSvg(
    weeks.map((week) => ({ label: formatDay(week.weekStart), value: week[field], partial: week.partial })),
    { title },
  )}</div>`;

const rowsHtml = (rows) => {
  if (!rows.length) return '';
  const rowHtml = (row) => {
    const detail = [`${formatNumber(row.value)} ${row.unit}`, row.change].filter(Boolean).join(' · ');
    return `
      <li>
        <a class="history__item" href="#/history/${encodeURIComponent(row.exerciseId)}">
          <span>${escapeHtml(row.name)}</span>
          <span class="muted">${escapeHtml(detail)}</span>
        </a>
      </li>`;
  };
  return `<h2 class="history__group">Esercizi</h2><ul class="history__list">${rows.map(rowHtml).join('')}</ul>`;
};

export const progressHtml = (program, sessions, now, period = DEFAULT_PERIOD) => {
  const header = headerHtml('Progressi', '#/', 'Torna alla home');
  if (!sessions.length) return `<section class="history progress">${header}<p class="muted">Nessuna sessione registrata.</p></section>`;

  const weeks = weeksOf(period);
  const totals = weeklyTotals(sessions, now, weeks);
  const { global, exercises } = progressInsights(program, sessions, now);
  const insights = [...global, ...exercises.map((item) => item.top)];
  const insightsBlock = insights.length
    ? insightsHtml(insights, { linked: true })
    : '<p class="muted">Servono più sessioni per i suggerimenti</p>';

  return `
    <section class="history progress">
      ${header}
      ${segmentedHtml(PERIODS, PERIODS.some((item) => item.value === period) ? period : DEFAULT_PERIOD, 'period', 'Periodo')}
      ${summaryHtml(totals)}
      <h2 class="history__group">Suggerimenti</h2>
      ${insightsBlock}
      ${weeklyChartHtml(totals, 'Sessioni a settimana', 'sessions')}
      ${weeklyChartHtml(totals, 'Tonnellaggio a settimana (kg)', 'tonnage')}
      ${weeklyChartHtml(totals, 'Volume a settimana (rip)', 'volume')}
      ${rowsHtml(exerciseRows(program, sessions, now, weeks))}
    </section>`;
};

export const renderProgress = (root, ctx) => {
  let period = DEFAULT_PERIOD;
  const draw = () => {
    root.innerHTML = progressHtml(ctx.program, ctx.getState().sessions, new Date(), period);
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action="period"]');
    if (!target) return;
    period = target.dataset.value;
    draw();
  };

  draw();
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
};

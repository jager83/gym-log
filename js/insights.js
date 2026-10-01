// Lettura automatica dei report: suggerimenti sul trend, coerenti con le regole del trainer.
// Nessun suggerimento prescrive di scendere di carico: i casi di attenzione constatano il dato e
// rimandano al trainer; l'unico suggerimento di aumento è la delega a loadAdvice (advice.js).
import { countKey, isMaxRange } from './program.js';
import { chartSeries, exerciseHistory, setOutcome } from './metrics.js';
import { loadAdvice } from './advice.js';
import { isLoadExercise, weeklyTotals } from './report.js';
import { formatNumber } from './format.js';

export const TREND_WINDOW_DAYS = 28;
export const TREND_MIN_SESSIONS = 3;
export const PROGRESS_MIN_PCT = 2;
export const DECLINE_PCT = 5;
export const STALL_SESSIONS = 4;
export const STALL_MIN_HISTORY = 5;
export const BELOW_MIN_STREAK = 2;
export const MIN_BASELINE_WEEKS = 3;
export const MAX_BASELINE_WEEKS = 8;
export const FREQUENCY_DROP = 1;
export const VOLUME_PCT = 15;
export const WORKOUT_GAP_DAYS = 10;

// Unici tipi ammessi, ognuno con il suo tono fisso.
export const INSIGHT_KINDS = Object.freeze({
  'ready-up': 'positive',
  'below-min': 'attention',
  progress: 'positive',
  decline: 'attention',
  stall: 'attention',
  'frequency-drop': 'attention',
  'workout-gap': 'neutral',
  'volume-up': 'positive',
  'volume-down': 'neutral',
});

export const TRAINER_SUFFIX = ': parlane col trainer';

// Priorità per il suggerimento principale di un esercizio nella pagina Progressi. progress non
// c'è: la variazione è già nell'elenco esercizi della pagina, resta solo nel dettaglio.
const EXERCISE_PRIORITY = ['below-min', 'decline', 'stall', 'ready-up'];

export const METRIC_NAMES = { '1rm': '1RM', reps: 'Ripetizioni', duration: 'Durata', assistance: 'Assistenza' };

const DAY_MS = 24 * 60 * 60 * 1000;

const MINUS = '−';

// Unico costruttore: il tono viene da INSIGHT_KINDS e i toni di attenzione chiudono col trainer.
const insight = (kind, text, exercise = null) => ({
  kind,
  tone: INSIGHT_KINDS[kind],
  text: INSIGHT_KINDS[kind] === 'attention' ? `${text}${TRAINER_SUFFIX}` : text,
  ...(exercise ? { exerciseId: exercise.id, name: exercise.name } : {}),
});

const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

const signedPercent = (change) => `${change >= 0 ? '+' : MINUS}${Math.round(Math.abs(change))}%`;

const windowLabel = () => `in ${TREND_WINDOW_DAYS / 7} settimane`;

// Esercizi della scheda attuale che entrano nei suggerimenti: una volta per id, ordine della scheda.
export const programLoadExercises = (program) => {
  const byId = new Map();
  program.workouts.forEach((workout) =>
    workout.blocks.forEach((block) =>
      block.exercises.forEach((exercise) => {
        if (!byId.has(exercise.id) && isLoadExercise(exercise)) byId.set(exercise.id, exercise);
      }),
    ),
  );
  return [...byId.values()];
};

// Almeno una serie sotto il minimo in ciascuna delle ultime BELOW_MIN_STREAK sessioni, ognuna col
// range della propria sessione. Range MAX: nessun minimo significativo.
const belowMinInsight = (history, exercise) => {
  if (isMaxRange(exercise[countKey(exercise.type)])) return null;
  const recent = history.slice(-BELOW_MIN_STREAK);
  if (recent.length < BELOW_MIN_STREAK) return null;
  const failedEverywhere = recent.every(
    (item) => item.target && item.sets.some((set) => setOutcome(set, item.type, item.target) === 'fallita'),
  );
  if (!failedEverywhere) return null;
  const unit = exercise.type === 'time' ? 's' : 'rip';
  return insight('below-min', `Sotto ${recent.at(-1).target.min} ${unit} nelle ultime ${BELOW_MIN_STREAK} sessioni`, exercise);
};

// Variazione nella finestra, positiva quando migliora (per l'assistenza meno è meglio); null con
// meno di TREND_MIN_SESSIONS punti o primo valore non positivo.
const windowChange = (points, lowerIsBetter, now) => {
  const since = now.getTime() - TREND_WINDOW_DAYS * DAY_MS;
  const inWindow = points.filter((point) => Date.parse(point.date) >= since);
  if (inWindow.length < TREND_MIN_SESSIONS) return null;
  const first = inWindow[0].value;
  const last = inWindow.at(-1).value;
  if (!(first > 0)) return null;
  return { first, last, change: ((lowerIsBetter ? first - last : last - first) / first) * 100 };
};

// Nessun nuovo massimo (per l'assistenza: minimo) negli ultimi STALL_SESSIONS punti rispetto ai
// precedenti; la parità non è un nuovo massimo.
const isStalled = (points, lowerIsBetter) => {
  if (points.length < STALL_MIN_HISTORY) return false;
  const values = points.map((point) => point.value);
  const before = values.slice(0, -STALL_SESSIONS);
  const recent = values.slice(-STALL_SESSIONS);
  if (lowerIsBetter) return recent.every((value) => value >= Math.min(...before));
  return recent.every((value) => value <= Math.max(...before));
};

const trendText = (metric, { first, last, change }) => {
  if (metric === 'assistance') return `Assistenza da ${formatNumber(first)} a ${formatNumber(last)} kg ${windowLabel()}`;
  return `${METRIC_NAMES[metric]} ${signedPercent(change)} ${windowLabel()}`;
};

// Al massimo un trend: decline > stall > progress. Lo stallo non si segnala quando è già pronto
// l'aumento (ready-up): il rimedio è la regola del trainer, non una domanda al trainer.
const trendInsight = (series, exercise, now, hasReadyUp) => {
  if (!series) return null;
  const lowerIsBetter = series.metric === 'assistance';
  const window = windowChange(series.points, lowerIsBetter, now);
  if (window && window.change <= -DECLINE_PCT) return insight('decline', trendText(series.metric, window), exercise);
  if (!hasReadyUp && isStalled(series.points, lowerIsBetter)) {
    return insight('stall', `Nessun nuovo massimo in ${STALL_SESSIONS} sessioni`, exercise);
  }
  if (window && window.change >= PROGRESS_MIN_PCT) return insight('progress', trendText(series.metric, window), exercise);
  return null;
};

// Suggerimenti di un esercizio della scheda: below-min, trend, ready-up (assenti omessi).
export const exerciseInsights = (sessions, exercise, now) => {
  if (!isLoadExercise(exercise)) return [];
  const history = exerciseHistory(sessions, exercise.id);
  if (!history.length) return [];
  const advice = loadAdvice(sessions, exercise.id, exercise);
  const readyUp = advice && (advice.kind === 'up' || advice.kind === 'up-time') ? insight('ready-up', advice.text, exercise) : null;
  return [belowMinInsight(history, exercise), trendInsight(chartSeries(history), exercise, now, readyUp !== null), readyUp].filter(Boolean);
};

const sessionsLabel = (count) => (count === 1 ? '1 sessione' : `${count} sessioni`);

// Frequenza e tonnellaggio dell'ultima settimana completa contro la media delle precedenti.
const weeklyInsights = (sessions, now) => {
  const complete = weeklyTotals(sessions, now, null).filter((week) => !week.partial);
  if (complete.length < MIN_BASELINE_WEEKS + 1) return { frequency: [], volume: [] };
  const recent = complete.at(-1);
  const baseline = complete.slice(-1 - MAX_BASELINE_WEEKS, -1);

  const usualSessions = mean(baseline.map((week) => week.sessions));
  const frequency = recent.sessions <= usualSessions - FREQUENCY_DROP
    ? [insight('frequency-drop', `Settimana scorsa ${sessionsLabel(recent.sessions)}, di solito ${formatNumber(usualSessions)}`)]
    : [];

  // Settimana senza sessioni: è un tema di frequenza, non di volume (niente "−100%").
  const usualTonnage = mean(baseline.map((week) => week.tonnage));
  if (recent.sessions === 0 || !(usualTonnage > 0)) return { frequency, volume: [] };
  const change = ((recent.tonnage - usualTonnage) / usualTonnage) * 100;
  let volume = [];
  if (change >= VOLUME_PCT) volume = [insight('volume-up', `Tonnellaggio ${signedPercent(change)} sulla media`)];
  // Calo dovuto a meno sessioni: già detto da frequency-drop.
  else if (change <= -VOLUME_PCT && !frequency.length) volume = [insight('volume-down', `Tonnellaggio ${signedPercent(change)} sulla media`)];
  return { frequency, volume };
};

// Giorni della scheda trascurati mentre gli altri si fanno. Mai fatti per primi, poi per giorni.
const workoutGapInsights = (program, sessions, now) => {
  if (!sessions.length) return [];
  const nowMs = now.getTime();
  const gapMs = WORKOUT_GAP_DAYS * DAY_MS;
  const endedMs = (session) => Date.parse(session.endedAt);
  const firstMs = Math.min(...sessions.map(endedMs));
  const otherIsRecent = (workoutId) =>
    sessions.some((session) => session.workoutId !== workoutId && nowMs - endedMs(session) < gapMs);

  const gaps = program.workouts
    .map((workout) => {
      const done = sessions.filter((session) => session.workoutId === workout.id);
      if (!otherIsRecent(workout.id)) return null;
      if (!done.length) return nowMs - firstMs >= gapMs ? { workout, days: Infinity } : null;
      const days = Math.floor((nowMs - Math.max(...done.map(endedMs))) / DAY_MS);
      return days >= WORKOUT_GAP_DAYS ? { workout, days } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.days - a.days);

  return gaps.map(({ workout, days }) =>
    insight('workout-gap', days === Infinity ? `${workout.name} non ancora fatto` : `${workout.name} non fatto da ${days} giorni`),
  );
};

export const globalInsights = (program, sessions, now) => {
  const { frequency, volume } = weeklyInsights(sessions, now);
  return [...frequency, ...workoutGapInsights(program, sessions, now), ...volume];
};

const topInsight = (list) =>
  list
    .filter((item) => EXERCISE_PRIORITY.includes(item.kind))
    .sort((a, b) => EXERCISE_PRIORITY.indexOf(a.kind) - EXERCISE_PRIORITY.indexOf(b.kind))[0] ?? null;

// Per la pagina Progressi: suggerimenti globali e il principale di ogni esercizio della scheda.
export const progressInsights = (program, sessions, now) => ({
  global: globalInsights(program, sessions, now),
  exercises: programLoadExercises(program)
    .map((exercise) => {
      const top = topInsight(exerciseInsights(sessions, exercise, now));
      return top ? { exerciseId: exercise.id, name: exercise.name, top } : null;
    })
    .filter(Boolean),
});

import { countKey, isMaxRange } from './program.js';

export const METRIC_LABELS = {
  weight: '1RM stimato (kg)',
  bodyweight: 'Ripetizioni massime',
  bodyweightLoad: '1RM stimato peso corporeo + zavorra (kg)',
  time: 'Durata massima (s)',
  cardioDistance: 'Distanza (km)',
  cardioDuration: 'Durata (min)',
};

export const isDone = (set) => set.effort !== null && set.effort !== undefined;

export const round1 = (value) => Math.round(value * 10) / 10;

export const epley = (weight, reps) => round1(weight * (1 + reps / 30));

// Range MAX: nessun tetto né minimo significativo, quindi nessun esito.
export const setOutcome = (set, type, target) => {
  if (!isDone(set) || isMaxRange(target)) return null;
  const count = set[countKey(type)];
  if (typeof count !== 'number') return null;
  if (count < target.min) return 'fallita';
  if (count > target.max) return 'carico-basso';
  return 'ok';
};

const usesBodyWeightLoad = (type, bodyWeight) => type === 'bodyweight' && typeof bodyWeight === 'number' && bodyWeight > 0;

const setMetric = (set, type, bodyWeight) => {
  if (type === 'weight') {
    return typeof set.weight === 'number' && set.weight > 0 && typeof set.reps === 'number'
      ? epley(set.weight, set.reps)
      : null;
  }
  if (usesBodyWeightLoad(type, bodyWeight)) {
    return typeof set.reps === 'number' ? epley(bodyWeight + (set.weight ?? 0), set.reps) : null;
  }
  const value = set[countKey(type)];
  return typeof value === 'number' ? value : null;
};

export const sessionMetric = (sets, type, bodyWeight = null) => {
  const values = sets
    .filter(isDone)
    .map((set) => setMetric(set, type, bodyWeight))
    .filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
};

// Metrica che ha prodotto `value`: '1rm' per weight, o per bodyweight quando bodyWeight è impostato;
// 'reps' per bodyweight senza bodyWeight; 'duration' per time.
const metricKind = (type, bodyWeight) => {
  if (type === 'time') return 'duration';
  if (type === 'weight' || usesBodyWeightLoad(type, bodyWeight)) return '1rm';
  return 'reps';
};

// Metrica di una sessione per un esercizio cardio: distanza massima delle serie fatte se almeno
// una ne ha una; altrimenti durata massima, convertita in minuti (round1).
const cardioMetric = (sets) => {
  const doneSets = sets.filter(isDone);
  const distances = doneSets.map((set) => set.distance).filter((value) => typeof value === 'number');
  if (distances.length) return { metric: 'distance', value: Math.max(...distances) };
  const durations = doneSets.map((set) => set.duration).filter((value) => typeof value === 'number');
  return { metric: 'duration', value: durations.length ? round1(Math.max(...durations) / 60) : null };
};

export const exerciseHistory = (sessions, exerciseId) =>
  sessions
    .filter((session) => session.entries[exerciseId]?.some(isDone))
    .map((session) => {
      const target = session.targets[exerciseId];
      const sets = session.entries[exerciseId];
      const bodyWeight = session.bodyWeight ?? null;
      const category = target.category ?? 'forza';
      if (target.type === 'cardio') {
        const { metric, value } = cardioMetric(sets);
        return {
          sessionId: session.id,
          date: session.endedAt,
          name: target.name,
          type: target.type,
          category,
          target: target.duration,
          sets: sets.filter(isDone),
          value,
          metric,
        };
      }
      return {
        sessionId: session.id,
        date: session.endedAt,
        name: target.name,
        type: target.type,
        category,
        target: target[countKey(target.type)],
        sets: sets.filter(isDone),
        value: sessionMetric(sets, target.type, bodyWeight),
        metric: metricKind(target.type, bodyWeight),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

// Serie del grafico storico: per bodyweight, se lo storico contiene almeno una voce con 1RM
// (peso corporeo + zavorra), usa solo quelle con la relativa etichetta; altrimenti le ripetizioni.
// Per cardio, se almeno una voce ha la distanza usa solo quelle con la distanza; altrimenti la
// durata (minuti). Per gli esercizi con category diversa da forza (stretching/mobilita) nessun
// grafico. Per gli altri tipi, l'etichetta corrente. Solo punti con value non null; null se
// nessuno resta.
export const chartSeries = (history) => {
  if (!history.length) return null;
  const { type, category } = history[0];
  if ((category ?? 'forza') !== 'forza') return null;
  let label = METRIC_LABELS[type];
  let entries = history;
  if (type === 'bodyweight') {
    const hasLoad = history.some((item) => item.metric === '1rm');
    label = hasLoad ? METRIC_LABELS.bodyweightLoad : METRIC_LABELS.bodyweight;
    entries = history.filter((item) => item.metric === (hasLoad ? '1rm' : 'reps'));
  }
  if (type === 'cardio') {
    const hasDistance = history.some((item) => item.metric === 'distance');
    label = hasDistance ? METRIC_LABELS.cardioDistance : METRIC_LABELS.cardioDuration;
    entries = history.filter((item) => item.metric === (hasDistance ? 'distance' : 'duration'));
  }
  const points = entries.filter((item) => item.value !== null).map((item) => ({ date: item.date, value: item.value }));
  return points.length ? { label, points } : null;
};

export const retiredExercises = (program, sessions) => {
  const inProgram = new Set(
    program.workouts.flatMap((workout) => workout.blocks.flatMap((block) => block.exercises.map((exercise) => exercise.id))),
  );
  const retired = new Map();
  sessions.forEach((session) => {
    Object.entries(session.entries).forEach(([exerciseId, sets]) => {
      if (!inProgram.has(exerciseId) && sets.some(isDone)) retired.set(exerciseId, session.targets[exerciseId].name);
    });
  });
  return [...retired].map(([id, name]) => ({ id, name }));
};

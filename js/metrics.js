import { countKey, isMaxRange } from './program.js';

export const METRIC_LABELS = {
  weight: '1RM stimato (kg)',
  bodyweight: 'Ripetizioni massime',
  bodyweightLoad: '1RM stimato peso corporeo + zavorra (kg)',
  assistedLoad: '1RM stimato peso corporeo − assistenza (kg)',
  assistance: 'Assistenza (kg)',
  time: 'Durata massima (s)',
  cardioDistance: 'Distanza (km)',
  cardioDuration: 'Durata (min)',
  cardioPower: 'Potenza (W)',
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

const usesBodyWeightLoad = (type, bodyWeight) => type === 'bodyweight' && hasBodyWeight(bodyWeight);

const hasBodyWeight = (bodyWeight) => typeof bodyWeight === 'number' && bodyWeight > 0;

// Assistito: il peso registrato sono i kg di assistenza. Con il peso corporeo il carico effettivo
// è peso corporeo − assistenza; senza, la metrica è l'assistenza stessa (più bassa è meglio).
const assistedMetric = (set, bodyWeight) => {
  if (!hasBodyWeight(bodyWeight)) return typeof set.weight === 'number' ? set.weight : null;
  return typeof set.reps === 'number' ? epley(Math.max(0, bodyWeight - (set.weight ?? 0)), set.reps) : null;
};

const setMetric = (set, type, bodyWeight, assisted) => {
  if (type === 'weight' && assisted) return assistedMetric(set, bodyWeight);
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

export const sessionMetric = (sets, type, bodyWeight = null, assisted = false) => {
  const values = sets
    .filter(isDone)
    .map((set) => setMetric(set, type, bodyWeight, assisted))
    .filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
};

// Metrica che ha prodotto `value`: '1rm' per weight, o per bodyweight quando bodyWeight è impostato;
// 'reps' per bodyweight senza bodyWeight; 'assistance' per weight assistito senza bodyWeight;
// 'duration' per time.
const metricKind = (type, bodyWeight, assisted) => {
  if (type === 'time') return 'duration';
  if (type === 'weight' && assisted && !hasBodyWeight(bodyWeight)) return 'assistance';
  if (type === 'weight' || usesBodyWeightLoad(type, bodyWeight)) return '1rm';
  return 'reps';
};

// Metrica di una sessione per un esercizio cardio, secondo la macchina della prima serie fatta
// (null per le serie salvate prima della scelta macchina): potenza massima per la cyclette,
// distanza massima per camminata e serie vecchie; altrimenti durata massima in minuti (round1).
// shortcut: una sola macchina per sessione (la prima serie fatta); serie miste camminata+cyclette
// nella stessa sessione ignorano l'altra macchina. Oggi il cardio ha 1 serie; rivedere se ne avrà di più.
const cardioMetric = (sets) => {
  const doneSets = sets.filter(isDone);
  const machine = doneSets[0]?.machine ?? null;
  const primary = machine === 'cyclette' ? 'power' : 'distance';
  const values = doneSets.map((set) => set[primary]).filter((value) => typeof value === 'number');
  if (values.length) return { machine, metric: primary, value: Math.max(...values) };
  const durations = doneSets.map((set) => set.duration).filter((value) => typeof value === 'number');
  return { machine, metric: 'duration', value: durations.length ? round1(Math.max(...durations) / 60) : null };
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
        const { machine, metric, value } = cardioMetric(sets);
        return {
          machine,
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
        ...(target.assisted === true ? { assisted: true } : {}),
        value: sessionMetric(sets, target.type, bodyWeight, target.assisted === true),
        metric: metricKind(target.type, bodyWeight, target.assisted === true),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

// Serie del grafico storico: per bodyweight, se lo storico contiene almeno una voce con 1RM
// (peso corporeo + zavorra), usa solo quelle con la relativa etichetta; altrimenti le ripetizioni.
// Per cardio vedi il blocco dedicato (macchina dell'ultima voce). Per weight assistito, 1RM sul carico effettivo (peso corporeo − assistenza) se
// almeno una voce ce l'ha, altrimenti l'assistenza. Per gli esercizi con category diversa da forza (stretching/mobilita) nessun
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
  // Assistito: 1RM sul carico effettivo se almeno una voce ce l'ha, altrimenti l'assistenza.
  if (type === 'weight' && history.some((item) => item.assisted)) {
    const hasLoad = history.some((item) => item.metric === '1rm');
    label = hasLoad ? METRIC_LABELS.assistedLoad : METRIC_LABELS.assistance;
    entries = history.filter((item) => item.metric === (hasLoad ? '1rm' : 'assistance'));
  }
  // Cardio: solo le voci della macchina dell'ultima voce; potenza (cyclette) o distanza se almeno
  // una voce ce l'ha, altrimenti la durata.
  if (type === 'cardio') {
    const machine = history.at(-1).machine ?? null;
    const sameMachine = history.filter((item) => (item.machine ?? null) === machine);
    const primary = machine === 'cyclette' ? 'power' : 'distance';
    const hasPrimary = sameMachine.some((item) => item.metric === primary);
    label = hasPrimary ? METRIC_LABELS[primary === 'power' ? 'cardioPower' : 'cardioDistance'] : METRIC_LABELS.cardioDuration;
    entries = sameMachine.filter((item) => item.metric === (hasPrimary ? primary : 'duration'));
  }
  const valued = entries.filter((item) => item.value !== null);
  const points = valued.map((item) => ({ date: item.date, value: item.value }));
  return points.length ? { label, metric: valued[0].metric, points } : null;
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

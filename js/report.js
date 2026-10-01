// Report progressi: metriche per serie (volume, carico effettivo, tonnellaggio), per sessione ed
// esercizio, e aggregati per settimana. Tutto calcolato dalle sessioni terminate, niente salvato.
import { countKey } from './program.js';
import { exerciseHistory, isDone, round1 } from './metrics.js';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const hasBodyWeight = (bodyWeight) => isNumber(bodyWeight) && bodyWeight > 0;

const sidesOf = (target) => target.sides ?? 1;

// Esercizi che entrano nelle metriche di carico: forza (default), non cardio.
export const isLoadExercise = (target) => (target.category ?? 'forza') === 'forza' && target.type !== 'cardio';

// Ripetizioni (weight, bodyweight) o secondi (time) per il numero di lati; null se non registrati.
export const setVolume = (set, target) => {
  const count = set[countKey(target.type)];
  return isNumber(count) ? count * sidesOf(target) : null;
};

// Carico realmente spostato da una serie. Per manubrio: due manubri. Assistito: peso corporeo meno
// assistenza. Corpo libero: peso corporeo più zavorra. Senza peso corporeo (o per time): null.
export const effectiveLoad = (set, target, bodyWeight) => {
  if (target.type === 'bodyweight') {
    return hasBodyWeight(bodyWeight) ? bodyWeight + (isNumber(set.weight) ? set.weight : 0) : null;
  }
  if (target.type !== 'weight' || !isNumber(set.weight)) return null;
  if (target.assisted) return hasBodyWeight(bodyWeight) ? Math.max(0, bodyWeight - set.weight) : null;
  return target.load === 'per-dumbbell' ? set.weight * 2 : set.weight;
};

export const setTonnage = (set, target, bodyWeight) => {
  const load = effectiveLoad(set, target, bodyWeight);
  if (load === null || !isNumber(set.reps)) return null;
  return load * set.reps * sidesOf(target);
};

const sum = (values) => values.reduce((total, value) => total + value, 0);

const nonNull = (values) => values.filter((value) => value !== null);

// Somma dei valori non null, arrotondata a 0,1; null se sono tutti null.
const sumOrNull = (values) => {
  const numbers = nonNull(values);
  return numbers.length ? round1(sum(numbers)) : null;
};

// Una voce per sessione con almeno una serie fatta dell'esercizio (solo forza, non cardio), in
// ordine di data. value/metric sono quelli di exerciseHistory (la metrica del grafico storico).
export const exerciseSessionStats = (sessions, exerciseId) => {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  return exerciseHistory(sessions, exerciseId)
    .filter(isLoadExercise)
    .map((item) => {
      const session = byId.get(item.sessionId);
      const target = session.targets[exerciseId];
      const bodyWeight = session.bodyWeight ?? null;
      return {
        sessionId: item.sessionId,
        date: item.date,
        value: item.value,
        metric: item.metric,
        volume: round1(sum(nonNull(item.sets.map((set) => setVolume(set, target))))),
        volumeUnit: target.type === 'time' ? 's' : 'rip',
        tonnage: sumOrNull(item.sets.map((set) => setTonnage(set, target, bodyWeight))),
      };
    });
};

// Lunedì 00:00 (ora locale) della settimana che contiene `date`.
export const weekStart = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};

// setDate e non +7 giorni in millisecondi: con il cambio dell'ora la settimana non dura 168 ore.
const addWeeks = (date, count) => {
  const next = new Date(date);
  next.setDate(next.getDate() + count * 7);
  return next;
};

// Tonnellaggio e volume in ripetizioni di una sessione (i secondi di time non si sommano alle rip).
const sessionLoad = (session) => {
  const bodyWeight = session.bodyWeight ?? null;
  let tonnage = 0;
  let volume = 0;
  Object.entries(session.entries).forEach(([exerciseId, sets]) => {
    const target = session.targets[exerciseId];
    if (!target || !isLoadExercise(target)) return;
    sets.filter(isDone).forEach((set) => {
      tonnage += setTonnage(set, target, bodyWeight) ?? 0;
      if (target.type !== 'time') volume += setVolume(set, target) ?? 0;
    });
  });
  return { tonnage, volume };
};

// Settimane consecutive fino a quella di `now` inclusa (partial). `weeks`: quante (4, 12) o null
// per partire dalla settimana della prima sessione. Settimane senza sessioni a 0.
export const weeklyTotals = (sessions, now, weeks = null) => {
  if (!sessions.length) return [];
  const current = weekStart(now);
  const first = weeks === null
    ? weekStart(new Date(Math.min(...sessions.map((session) => Date.parse(session.endedAt)))))
    : addWeeks(current, -(weeks - 1));

  const buckets = new Map();
  sessions.forEach((session) => {
    const key = weekStart(new Date(session.endedAt)).getTime();
    const bucket = buckets.get(key) ?? { sessions: 0, tonnage: 0, volume: 0 };
    const { tonnage, volume } = sessionLoad(session);
    buckets.set(key, { sessions: bucket.sessions + 1, tonnage: bucket.tonnage + tonnage, volume: bucket.volume + volume });
  });

  const result = [];
  for (let start = first; start.getTime() <= current.getTime(); start = addWeeks(start, 1)) {
    const bucket = buckets.get(start.getTime()) ?? { sessions: 0, tonnage: 0, volume: 0 };
    result.push({
      weekStart: start.toISOString(),
      sessions: bucket.sessions,
      tonnage: round1(bucket.tonnage),
      volume: round1(bucket.volume),
      partial: start.getTime() === current.getTime(),
    });
  }
  return result;
};

// Suggerimento di carico per la prossima serie 1 (forza), dall'ultima sessione in cui l'esercizio
// è stato fatto. Regola del trainer: si aumenta quando si supera il numero di ripetizioni indicato
// (tutte le serie fatte oltre il massimo del range, la fatica non conta); dopo l'aumento non si
// scende. null quando non c'è nulla da suggerire.
import { countKey } from './program.js';
import { isDone } from './metrics.js';
import { clampValue, lastDoneSets } from './session.js';
import { formatNumber } from './format.js';

const WEIGHT_STEP = 2.5;
const LOAD_STEP = 1;
const FIRST_LOAD = 2.5;
const TIME_STEP = 5;

const countOf = (set, key) => (typeof set[key] === 'number' ? set[key] : null);

const maxWeightOf = (sets) => Math.max(0, ...sets.map((set) => (typeof set.weight === 'number' ? set.weight : 0)));

const beyondTop = (sets, key, range) => sets.every((set) => countOf(set, key) !== null && countOf(set, key) > range.max);

const kg = (value) => `${formatNumber(value)} kg`;

export const loadAdvice = (sessions, exerciseId, target) => {
  if ((target.category ?? 'forza') !== 'forza' || target.type === 'cardio') return null;
  const key = countKey(target.type);
  const range = target[key];
  if (!range) return null;
  const done = (lastDoneSets(sessions, exerciseId) ?? []).filter(isDone);
  if (done.length === 0) return null;

  if (!beyondTop(done, key, range)) return null;
  if (target.type === 'time') return { kind: 'up-time', value: TIME_STEP, text: `Prova ${TIME_STEP} s in più` };

  const last = maxWeightOf(done);
  const isLoad = target.type === 'bodyweight';
  if (isLoad && last === 0) return { kind: 'up', value: FIRST_LOAD, text: `Prova con ${kg(FIRST_LOAD)} di zavorra` };

  // "Prova 62,5 kg", "Prova con 6 kg di zavorra".
  const value = clampValue('weight', last + (isLoad ? LOAD_STEP : WEIGHT_STEP));
  const lead = isLoad ? `Prova con ${kg(value)} di zavorra` : `Prova ${kg(value)}`;
  return { kind: 'up', value, text: `${lead} · l'ultima volta oltre ${range.max} rip su tutte le serie` };
};

// Suggerimento (o null) per ogni esercizio della sessione aperta, dalle sessioni finite.
export const adviceBySession = (sessions, session) =>
  Object.fromEntries(Object.entries(session.targets).map(([exerciseId, target]) => [exerciseId, loadAdvice(sessions, exerciseId, target)]));

// Suggerimento di carico per la prossima serie 1 (forza), dall'ultima sessione in cui l'esercizio
// è stato fatto: sali se tutte le serie fatte hanno raggiunto il massimo del range senza "dura",
// scendi se almeno metà sono rimaste sotto il minimo. null quando non c'è nulla da suggerire.
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

const reachedTop = (sets, key, range) =>
  sets.every((set) => countOf(set, key) !== null && countOf(set, key) >= range.max) && !sets.some((set) => set.effort === 'dura');

const fellShort = (sets, key, range) =>
  sets.filter((set) => countOf(set, key) !== null && countOf(set, key) < range.min).length * 2 >= sets.length;

const kg = (value) => `${formatNumber(value)} kg`;

// "Prova 62,5 kg", "Prova con 6 kg di zavorra", "Scendi a 57,5 kg", "Scendi a 5 kg di zavorra".
const loadLead = (kind, value, isLoad) => {
  if (kind === 'down') return `Scendi a ${kg(value)}${isLoad ? ' di zavorra' : ''}`;
  return isLoad ? `Prova con ${kg(value)} di zavorra` : `Prova ${kg(value)}`;
};

export const loadAdvice = (sessions, exerciseId, target) => {
  if ((target.category ?? 'forza') !== 'forza' || target.type === 'cardio') return null;
  const key = countKey(target.type);
  const range = target[key];
  if (!range) return null;
  const done = (lastDoneSets(sessions, exerciseId) ?? []).filter(isDone);
  if (done.length === 0) return null;

  const top = reachedTop(done, key, range);
  if (target.type === 'time') return top ? { kind: 'up-time', value: TIME_STEP, text: `Prova ${TIME_STEP} s in più` } : null;

  const low = !top && fellShort(done, key, range);
  if (!top && !low) return null;

  const last = maxWeightOf(done);
  const isLoad = target.type === 'bodyweight';
  const topDetail = `${Math.min(...done.map((set) => set[key]))} rip su tutte le serie`;
  const lowDetail = `sotto le ${range.min} rip`;

  if (isLoad && last === 0) {
    return top ? { kind: 'up', value: FIRST_LOAD, text: `Prova con ${kg(FIRST_LOAD)} di zavorra` } : null;
  }
  if (!isLoad && low && last === 0) return null;

  const kind = top ? 'up' : 'down';
  const step = isLoad ? LOAD_STEP : WEIGHT_STEP;
  const value = clampValue('weight', top ? last + step : Math.max(0, last - step));
  return { kind, value, text: `${loadLead(kind, value, isLoad)} · l'ultima volta ${top ? topDetail : lowDetail}` };
};

// Suggerimento (o null) per ogni esercizio della sessione aperta, dalle sessioni finite.
export const adviceBySession = (sessions, session) =>
  Object.fromEntries(Object.entries(session.targets).map(([exerciseId, target]) => [exerciseId, loadAdvice(sessions, exerciseId, target)]));

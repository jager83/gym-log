import { CATEGORIES, EXERCISE_TYPES, LOAD_VALUES, PHASES, countKey, isTextArray } from './program.js';
import { DONE_EFFORT, EFFORTS } from './session.js';

export const STORAGE_KEY = 'gym-log';
export const SCHEMA_VERSION = 1;
export const BACKUP_REMINDER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// Migrazioni: MIGRATIONS[n] trasforma uno stato con schemaVersion n in n + 1.
const MIGRATIONS = {};

export class StoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoreError';
  }
}

export const createEmptyState = () => ({
  schemaVersion: SCHEMA_VERSION,
  settings: { sound: true, bodyWeight: null },
  lastExportAt: null,
  activeSession: null,
  sessions: [],
});

export const migrate = (raw) => {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.schemaVersion)) {
    throw new StoreError('Formato dati non riconosciuto');
  }
  let state = raw;
  while (state.schemaVersion !== SCHEMA_VERSION) {
    const step = MIGRATIONS[state.schemaVersion];
    if (!step) throw new StoreError(`schemaVersion ${state.schemaVersion} non supportata`);
    state = step(state);
  }
  return state;
};

const isObject = (value) => Boolean(value) && typeof value === 'object';

const isBlock = (block) =>
  isObject(block) &&
  Array.isArray(block.exerciseIds) &&
  block.exerciseIds.length > 0 &&
  block.exerciseIds.every((id) => typeof id === 'string') &&
  isCount(block.rest) &&
  (block.phase === undefined || block.phase === null || PHASES.includes(block.phase));

const isCount = (value) => Number.isInteger(value) && value >= 0;

const isRange = (range) => isObject(range) && isCount(range.min) && isCount(range.max) && range.min <= range.max;

// Per cardio l'obiettivo è facoltativo: null è ammesso oltre al range.
const isTargetRange = (target) => {
  if (target.type === 'cardio') return target.duration === null || isRange(target.duration);
  return isRange(target[countKey(target.type)]);
};

// Campi copiati dalla scheda (spec §3): facoltativi, assenti nei backup precedenti.
const isOptionalTargetCopy = (target) =>
  (target.category === undefined || CATEGORIES.includes(target.category)) &&
  (target.sides === undefined || target.sides === 1 || target.sides === 2) &&
  (target.description === undefined || typeof target.description === 'string') &&
  (target.steps === undefined || isTextArray(target.steps)) &&
  (target.tips === undefined || isTextArray(target.tips));

const isTarget = (target) =>
  isObject(target) &&
  typeof target.name === 'string' &&
  EXERCISE_TYPES.includes(target.type) &&
  Number.isInteger(target.sets) &&
  target.sets > 0 &&
  isTargetRange(target) &&
  (target.load === undefined || LOAD_VALUES.includes(target.load)) &&
  isOptionalTargetCopy(target);

const isOptionalNumber = (value) => value === null || value === undefined || typeof value === 'number';

const isOptionalPositiveNumber = (value) =>
  value === null || value === undefined || (typeof value === 'number' && value > 0);

const isOptionalNonNegativeInt = (value) => value === null || value === undefined || isCount(value);

const isOptionalBoolean = (value) => value === undefined || typeof value === 'boolean';

const isValidEffort = (value) => value === null || EFFORTS.includes(value) || value === DONE_EFFORT;

const isSet = (set) =>
  isObject(set) &&
  isValidEffort(set.effort) &&
  ['weight', 'reps', 'duration', 'distance', 'speed'].every((field) => isOptionalNumber(set[field])) &&
  isOptionalNonNegativeInt(set.level);

const isSetList = (setList, target) =>
  Array.isArray(setList) &&
  setList.length === target.sets &&
  setList.every(isSet);

const TIMER_MODES = ['countdown', 'stopwatch'];

// Forma di activeSession.timer (spec §3): null oppure l'oggetto con gli istanti assoluti del
// timer in corso. Facoltativo: assente per compatibilità con i dati salvati prima di questo task.
// L'esercizio e la serie devono esistere nella sessione (targets validati prima).
const isTimerSetOf = (timer, session) =>
  Object.hasOwn(session.targets, timer.exerciseId) &&
  Object.hasOwn(session.entries, timer.exerciseId) &&
  timer.setIndex < session.targets[timer.exerciseId].sets;

const isTimer = (timer, session) =>
  timer === null ||
  (isObject(timer) &&
    typeof timer.exerciseId === 'string' &&
    isCount(timer.setIndex) &&
    TIMER_MODES.includes(timer.mode) &&
    (timer.side === 1 || timer.side === 2) &&
    (timer.runningSince === null || typeof timer.runningSince === 'string') &&
    typeof timer.elapsedMs === 'number' &&
    (timer.targetSeconds === null || typeof timer.targetSeconds === 'number') &&
    (timer.switchEndsAt === null || typeof timer.switchEndsAt === 'string') &&
    isTimerSetOf(timer, session));

const isSession = (session) => {
  if (
    !isObject(session) ||
    typeof session.id !== 'string' ||
    typeof session.workoutId !== 'string' ||
    typeof session.startedAt !== 'string' ||
    !isOptionalPositiveNumber(session.bodyWeight) ||
    !isOptionalNonNegativeInt(session.restBlockIndex) ||
    !Array.isArray(session.blocks) ||
    !isObject(session.targets) ||
    !isObject(session.entries)
  ) {
    return false;
  }

  // Validate blocks structure
  if (!session.blocks.every(isBlock)) return false;

  // Validate every target value
  if (!Object.values(session.targets).every(isTarget)) return false;

  // Validate that every entries key has a matching target and one set per target set
  const entriesMatchTargets = Object.entries(session.entries).every(
    ([id, setList]) => Object.hasOwn(session.targets, id) && isSetList(setList, session.targets[id]),
  );
  if (!entriesMatchTargets) return false;

  if (!(session.timer === undefined || isTimer(session.timer, session))) return false;

  // Validate that all exerciseIds in blocks have corresponding targets and entries
  const blockExerciseIds = new Set();
  session.blocks.forEach((block) => {
    block.exerciseIds.forEach((id) => blockExerciseIds.add(id));
  });
  for (const id of blockExerciseIds) {
    if (!isTarget(session.targets[id])) return false;
    if (!isSetList(session.entries[id], session.targets[id])) return false;
  }

  return true;
};

export const validateState = (state) => {
  if (!Array.isArray(state.sessions) || !state.sessions.every((s) => isSession(s) && typeof s.endedAt === 'string')) {
    throw new StoreError('sessions non valide');
  }
  if (state.activeSession !== null && !isSession(state.activeSession)) throw new StoreError('activeSession non valida');
  if (!isObject(state.settings) || typeof state.settings.sound !== 'boolean') throw new StoreError('settings non validi');
  if (!isOptionalPositiveNumber(state.settings.bodyWeight)) throw new StoreError('settings non validi');
  if (!isOptionalBoolean(state.settings.sidesAuto)) throw new StoreError('settings non validi');
  if (state.lastExportAt !== null && typeof state.lastExportAt !== 'string') throw new StoreError('lastExportAt non valido');
  return state;
};

export const parseState = (text) => {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new StoreError('Dati non validi: JSON illeggibile');
  }
  return validateState(migrate(raw));
};

export const loadState = (storage) => {
  let text;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    throw new StoreError('Salvataggio non disponibile');
  }
  if (text === null) return createEmptyState();
  return parseState(text);
};

export const saveState = (storage, state) => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new StoreError('Salvataggio non riuscito, esporta il backup');
  }
};

const pad2 = (value) => String(value).padStart(2, '0');

export const toDateStamp = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const exportState = (state, now) => {
  const exported = { ...state, lastExportAt: now.toISOString() };
  return {
    filename: `gym-log-${toDateStamp(now)}.json`,
    json: JSON.stringify(exported, null, 2),
    state: exported,
  };
};

export const importState = (text) => parseState(text);

// Il testo grezzo di localStorage[STORAGE_KEY], invariato, per farlo scaricare all'utente quando è corrotto.
export const rawBackup = (text, now) => ({
  filename: `gym-log-grezzo-${toDateStamp(now)}.json`,
  json: text,
});

// Un'altra scheda dello stesso origin ha scritto localStorage[STORAGE_KEY]: ricostruisce lo stato da adottare.
export const stateFromStorageEvent = (key, newValue) => {
  if (key !== STORAGE_KEY) return null;
  if (newValue === null) return createEmptyState();
  return parseState(newValue);
};

export const isBackupDue = (state, now) => {
  if (state.sessions.length === 0) return false;
  if (!state.lastExportAt) return true;
  return now.getTime() - Date.parse(state.lastExportAt) > BACKUP_REMINDER_DAYS * DAY_MS;
};

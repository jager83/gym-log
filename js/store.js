import { EXERCISE_TYPES, LOAD_VALUES, countKey } from './program.js';
import { EFFORTS } from './session.js';

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
  block.exerciseIds.every((id) => typeof id === 'string') &&
  Number.isInteger(block.rest) &&
  block.rest > 0;

const isCount = (value) => Number.isInteger(value) && value >= 0;

const isRange = (range) => isObject(range) && isCount(range.min) && isCount(range.max) && range.min <= range.max;

const isTarget = (target) =>
  isObject(target) &&
  typeof target.name === 'string' &&
  EXERCISE_TYPES.includes(target.type) &&
  Number.isInteger(target.sets) &&
  target.sets > 0 &&
  isRange(target[countKey(target.type)]) &&
  (target.load === undefined || LOAD_VALUES.includes(target.load));

const isOptionalNumber = (value) => value === null || value === undefined || typeof value === 'number';

const isOptionalPositiveNumber = (value) =>
  value === null || value === undefined || (typeof value === 'number' && value > 0);

const isOptionalNonNegativeInt = (value) => value === null || value === undefined || isCount(value);

const isSet = (set) =>
  isObject(set) &&
  (set.effort === null || EFFORTS.includes(set.effort)) &&
  ['weight', 'reps', 'duration'].every((field) => isOptionalNumber(set[field]));

const isSetList = (setList, target) =>
  Array.isArray(setList) &&
  setList.length === target.sets &&
  setList.every(isSet);

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

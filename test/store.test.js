import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  StoreError,
  createEmptyState,
  exportState,
  importState,
  isBackupDue,
  loadState,
  rawBackup,
  saveState,
  stateFromStorageEvent,
  toDateStamp,
} from '../js/store.js';
import { startSession, updateSet } from '../js/session.js';
import { normalizeProgram } from '../js/program.js';
import { at, program } from './fixtures.js';
import { emptyState, playSession } from './helpers.js';

// Programma minimale con un esercizio cardio, per i test store sui campi cardio della serie.
// Non tocca la fixture condivisa program() (usata per le rotazioni di nextWorkoutId altrove).
const cardioProgram = (duration) => normalizeProgram({
  version: 1,
  defaultSets: 1,
  defaultRest: 60,
  workouts: [
    {
      id: 'D',
      name: 'Cardio',
      blocks: [{ exercises: [{ id: 'corsa', name: 'Corsa', type: 'cardio', sets: 1, ...(duration !== undefined ? { duration } : {}) }] }],
    },
  ],
});

const withCardioActive = (patchSession, duration) => {
  const state = startSession(cardioProgram(duration), createEmptyState(), 'D', at('2026-09-27T18:00:00.000Z'));
  return JSON.stringify({ ...state, activeSession: patchSession(state.activeSession) });
};

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
};

const throwing = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

const isStoreError = (message) => (error) => error instanceof StoreError && error.message === message;

test('loadState senza dati restituisce lo stato vuoto', () => {
  assert.deepEqual(loadState(memoryStorage()), createEmptyState());
  assert.deepEqual(createEmptyState(), emptyState());
});

test('createEmptyState include bodyWeight a null', () => {
  assert.equal(createEmptyState().settings.bodyWeight, null);
});

test('validateState accetta settings.bodyWeight numero > 0, null o assente', () => {
  const withBodyWeight = (bodyWeight) => ({ ...createEmptyState(), settings: { sound: true, bodyWeight } });
  assert.doesNotThrow(() => importState(JSON.stringify(withBodyWeight(78.5))));
  assert.doesNotThrow(() => importState(JSON.stringify(withBodyWeight(null))));
  const { bodyWeight, ...settingsWithoutBodyWeight } = withBodyWeight(null).settings;
  assert.doesNotThrow(() => importState(JSON.stringify({ ...createEmptyState(), settings: settingsWithoutBodyWeight })));
});

test('validateState accetta activeSession.bodyWeight numero > 0, null o assente', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const withBodyWeight = (bodyWeight) => ({ ...state, activeSession: { ...state.activeSession, bodyWeight } });
  assert.doesNotThrow(() => importState(JSON.stringify(withBodyWeight(78.5))));
  assert.doesNotThrow(() => importState(JSON.stringify(withBodyWeight(null))));
  const { bodyWeight, ...sessionWithoutBodyWeight } = state.activeSession;
  assert.doesNotThrow(() => importState(JSON.stringify({ ...state, activeSession: sessionWithoutBodyWeight })));
});

test('validateState accetta activeSession.restBlockIndex intero >= 0, null o assente', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const withRestBlockIndex = (restBlockIndex) => ({ ...state, activeSession: { ...state.activeSession, restBlockIndex } });
  assert.doesNotThrow(() => importState(JSON.stringify(withRestBlockIndex(0))));
  assert.doesNotThrow(() => importState(JSON.stringify(withRestBlockIndex(1))));
  assert.doesNotThrow(() => importState(JSON.stringify(withRestBlockIndex(null))));
  const { restBlockIndex, ...sessionWithoutRestBlockIndex } = state.activeSession;
  assert.doesNotThrow(() => importState(JSON.stringify({ ...state, activeSession: sessionWithoutRestBlockIndex })));
});

test('validateState rifiuta activeSession.restBlockIndex non valido', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const withRestBlockIndex = (restBlockIndex) =>
    JSON.stringify({ ...state, activeSession: { ...state.activeSession, restBlockIndex } });
  assert.throws(() => importState(withRestBlockIndex(-1)), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withRestBlockIndex(1.5)), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withRestBlockIndex('0')), isStoreError('activeSession non valida'));
});

test('validateState rifiuta activeSession.bodyWeight non valido', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const withBodyWeight = (bodyWeight) =>
    JSON.stringify({ ...state, activeSession: { ...state.activeSession, bodyWeight } });
  assert.throws(() => importState(withBodyWeight(0)), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withBodyWeight(-5)), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withBodyWeight('78')), isStoreError('activeSession non valida'));
});

test('validateState rifiuta settings.bodyWeight non valido', () => {
  const withBodyWeight = (bodyWeight) => JSON.stringify({ ...createEmptyState(), settings: { sound: true, bodyWeight } });
  assert.throws(() => importState(withBodyWeight(0)), isStoreError('settings non validi'));
  assert.throws(() => importState(withBodyWeight(-5)), isStoreError('settings non validi'));
  assert.throws(() => importState(withBodyWeight('78')), isStoreError('settings non validi'));
});

test('save e load conservano una sessione aperta', () => {
  const storage = memoryStorage();
  let state = startSession(program(), createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  state = updateSet(state, 'panca', 0, { weight: 60, effort: 'giusta' }, at('2026-09-27T18:05:00.000Z'));
  saveState(storage, state);
  assert.deepEqual(loadState(storage), state);
});

test('errori di storage diventano StoreError', () => {
  assert.throws(() => saveState(throwing, createEmptyState()), isStoreError('Salvataggio non riuscito, esporta il backup'));
  assert.throws(() => loadState(throwing), isStoreError('Salvataggio non disponibile'));
});

test('dati corrotti o di versione sconosciuta vengono rifiutati', () => {
  assert.throws(() => loadState(memoryStorage({ [STORAGE_KEY]: '{' })), isStoreError('Dati non validi: JSON illeggibile'));
  assert.throws(() => importState('{"a":1}'), isStoreError('Formato dati non riconosciuto'));
  assert.throws(
    () => importState(JSON.stringify({ ...createEmptyState(), schemaVersion: 99 })),
    isStoreError('schemaVersion 99 non supportata'),
  );
  assert.throws(
    () => importState(JSON.stringify({ ...createEmptyState(), sessions: [{ id: 'x' }] })),
    isStoreError('sessions non valide'),
  );
  assert.throws(
    () => importState(JSON.stringify({ ...createEmptyState(), activeSession: { id: 'x' } })),
    isStoreError('activeSession non valida'),
  );
  assert.throws(
    () => importState(JSON.stringify({ ...createEmptyState(), settings: {} })),
    isStoreError('settings non validi'),
  );
});

test('toDateStamp usa la data locale', () => {
  assert.equal(toDateStamp(new Date(2026, 8, 7, 23, 30)), '2026-09-07');
});

test('exportState aggiorna lastExportAt e produce il nome file', () => {
  const now = new Date(2026, 8, 27, 10, 0);
  const { filename, json, state } = exportState(createEmptyState(), now);
  assert.equal(filename, 'gym-log-2026-09-27.json');
  assert.equal(state.lastExportAt, now.toISOString());
  assert.equal(JSON.parse(json).lastExportAt, now.toISOString());
});

test('export e import con sessione aperta restituiscono lo stesso stato', () => {
  const p = program();
  let state = playSession(p, createEmptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] },
    '2026-09-20T18:00:00.000Z', '2026-09-20T19:00:00.000Z');
  state = startSession(p, state, 'B', at('2026-09-27T18:00:00.000Z'));
  state = updateSet(state, 'panca', 0, { effort: 'dura' }, at('2026-09-27T18:05:00.000Z'));
  const exported = exportState(state, at('2026-09-27T18:10:00.000Z'));
  assert.deepEqual(importState(exported.json), exported.state);
  assert.equal(importState(exported.json).activeSession.workoutId, 'B');
});

test('isBackupDue', () => {
  const now = at('2026-09-27T10:00:00.000Z');
  const withSessions = { ...createEmptyState(), sessions: [{}] };
  assert.equal(isBackupDue(createEmptyState(), now), false);
  assert.equal(isBackupDue(withSessions, now), true);
  assert.equal(isBackupDue({ ...withSessions, lastExportAt: '2026-09-17T10:00:00.000Z' }, now), false);
  assert.equal(isBackupDue({ ...withSessions, lastExportAt: '2026-08-27T09:00:00.000Z' }, now), true);
});

test('importState rifiuta entries non array', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const corrupted = { ...state, activeSession: { ...state.activeSession, entries: { panca: 'x' } } };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('activeSession non valida'),
  );
});

test('importState rifiuta blocks senza exerciseIds array', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const corrupted = { ...state, activeSession: { ...state.activeSession, blocks: [{ rest: 120 }] } };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('activeSession non valida'),
  );
});

test('importState rifiuta activeSession con exerciseId in blocks ma non in entries', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const corrupted = {
    ...state,
    activeSession: {
      ...state.activeSession,
      blocks: [{ rest: 120, exerciseIds: ['panca', 'missing'] }],
    },
  };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('activeSession non valida'),
  );
});

test('importState rifiuta finished session con entries non array', () => {
  const p = program();
  let state = playSession(p, createEmptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] },
    '2026-09-20T18:00:00.000Z', '2026-09-20T19:00:00.000Z');
  const corrupted = {
    ...state,
    sessions: [{ ...state.sessions[0], entries: { panca: 'x' } }],
  };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('sessions non valide'),
  );
});

test('importState rifiuta finished session con entries extra non array', () => {
  const p = program();
  let state = playSession(p, createEmptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] },
    '2026-09-20T18:00:00.000Z', '2026-09-20T19:00:00.000Z');
  const corrupted = {
    ...state,
    sessions: [{ ...state.sessions[0], entries: { ...state.sessions[0].entries, garbage: 'not-an-array' } }],
  };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('sessions non valide'),
  );
});

test('importState rifiuta finished session con entries extra senza targets', () => {
  const p = program();
  let state = playSession(p, createEmptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] },
    '2026-09-20T18:00:00.000Z', '2026-09-20T19:00:00.000Z');
  const corrupted = {
    ...state,
    sessions: [{ ...state.sessions[0], entries: { ...state.sessions[0].entries, garbage: [] } }],
  };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('sessions non valide'),
  );
});

test('importState rifiuta finished session con targets extra non object', () => {
  const p = program();
  let state = playSession(p, createEmptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] },
    '2026-09-20T18:00:00.000Z', '2026-09-20T19:00:00.000Z');
  const corrupted = {
    ...state,
    sessions: [{ ...state.sessions[0], targets: { ...state.sessions[0].targets, garbage: 'not-an-object' } }],
  };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('sessions non valide'),
  );
});

test('importState rifiuta activeSession con entries extra non array', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const corrupted = {
    ...state,
    activeSession: { ...state.activeSession, entries: { ...state.activeSession.entries, garbage: 'not-an-array' } },
  };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('activeSession non valida'),
  );
});

test('importState rifiuta activeSession con entries extra senza targets', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const corrupted = {
    ...state,
    activeSession: { ...state.activeSession, entries: { ...state.activeSession.entries, garbage: [] } },
  };
  assert.throws(
    () => importState(JSON.stringify(corrupted)),
    isStoreError('activeSession non valida'),
  );
});

const withActive = (patchSession) => {
  const state = startSession(program(), createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  return JSON.stringify({ ...state, activeSession: patchSession(state.activeSession) });
};

const withPanca = (patchTarget, patchSets = (sets) => sets) =>
  withActive((session) => ({
    ...session,
    targets: { ...session.targets, panca: patchTarget(session.targets.panca) },
    entries: { ...session.entries, panca: patchSets(session.entries.panca) },
  }));

test('importState rifiuta target senza reps', () => {
  const text = withPanca(({ reps, ...target }) => target);
  assert.throws(() => importState(text), isStoreError('activeSession non valida'));
});

test('importState rifiuta target con type sconosciuto', () => {
  const text = withPanca((target) => ({ ...target, type: 'cardio' }));
  assert.throws(() => importState(text), isStoreError('activeSession non valida'));
});

test('importState rifiuta target con range non valido', () => {
  const inverted = withPanca((target) => ({ ...target, reps: { min: 10, max: 8 } }));
  const decimal = withPanca((target) => ({ ...target, reps: { min: 8.5, max: 10 } }));
  assert.throws(() => importState(inverted), isStoreError('activeSession non valida'));
  assert.throws(() => importState(decimal), isStoreError('activeSession non valida'));
});

test('importState rifiuta sets non intero', () => {
  const text = withPanca((target) => ({ ...target, sets: '<img src=x onerror=alert(1)>' }));
  assert.throws(() => importState(text), isStoreError('activeSession non valida'));
});

test('importState rifiuta entries più corte di sets', () => {
  const text = withPanca((target) => target, (sets) => sets.slice(0, 1));
  assert.throws(() => importState(text), isStoreError('activeSession non valida'));
});

test('importState rifiuta effort sconosciuto', () => {
  const text = withPanca((target) => target, (sets) => sets.map((set) => ({ ...set, effort: 'boh' })));
  assert.throws(() => importState(text), isStoreError('activeSession non valida'));
});

test('importState accetta target senza load, "total" o "per-dumbbell"', () => {
  assert.doesNotThrow(() => importState(withPanca((target) => { const { load, ...rest } = target; return rest; })));
  assert.doesNotThrow(() => importState(withPanca((target) => ({ ...target, load: 'total' }))));
  assert.doesNotThrow(() => importState(withPanca((target) => ({ ...target, load: 'per-dumbbell' }))));
});

test('importState rifiuta target con load sconosciuto', () => {
  const text = withPanca((target) => ({ ...target, load: 'per-arm' }));
  assert.throws(() => importState(text), isStoreError('activeSession non valida'));
});

test('importState rifiuta weight non numerico', () => {
  const text = withPanca((target) => target, (sets) => sets.map((set) => ({ ...set, weight: 'x' })));
  assert.throws(() => importState(text), isStoreError('activeSession non valida'));
});

test('importState rifiuta una sessione terminata con set non valido', () => {
  const state = playSession(program(), createEmptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] },
    '2026-09-20T18:00:00.000Z', '2026-09-20T19:00:00.000Z');
  const [session] = state.sessions;
  const corrupted = {
    ...state,
    sessions: [{ ...session, entries: { ...session.entries, panca: session.entries.panca.map((set) => ({ ...set, effort: 'boh' })) } }],
  };
  assert.throws(() => importState(JSON.stringify(corrupted)), isStoreError('sessions non valide'));
});

test('stateFromStorageEvent: chiave diversa, cancellazione, dati validi e non validi', () => {
  assert.equal(stateFromStorageEvent('altra-chiave', '{}'), null);
  assert.deepEqual(stateFromStorageEvent(STORAGE_KEY, null), createEmptyState());
  const state = createEmptyState();
  assert.deepEqual(stateFromStorageEvent(STORAGE_KEY, JSON.stringify(state)), state);
  assert.throws(() => stateFromStorageEvent(STORAGE_KEY, '{'), isStoreError('Dati non validi: JSON illeggibile'));
});

test('rawBackup produce il nome file grezzo e lascia il testo invariato', () => {
  const now = new Date(2026, 8, 27, 10, 0);
  const text = '{ rotto';
  const { filename, json } = rawBackup(text, now);
  assert.equal(filename, 'gym-log-grezzo-2026-09-27.json');
  assert.equal(json, text);
});

test('importState accetta e valida i campi cardio della serie (distance, level, speed)', () => {
  const valid = withCardioActive((session) => ({
    ...session,
    entries: { ...session.entries, corsa: [{ duration: 1200, distance: 5.2, level: 8, speed: 12, effort: 'fatto' }] },
  }), { min: 600, max: 1500 });
  assert.doesNotThrow(() => importState(valid));

  const badLevel = withCardioActive((session) => ({
    ...session,
    entries: { ...session.entries, corsa: [{ duration: 1200, distance: 5.2, level: -1, speed: 12, effort: 'fatto' }] },
  }), { min: 600, max: 1500 });
  assert.throws(() => importState(badLevel), isStoreError('activeSession non valida'));

  const badLevelDecimal = withCardioActive((session) => ({
    ...session,
    entries: { ...session.entries, corsa: [{ duration: 1200, distance: 5.2, level: 8.5, speed: 12, effort: 'fatto' }] },
  }), { min: 600, max: 1500 });
  assert.throws(() => importState(badLevelDecimal), isStoreError('activeSession non valida'));

  const badDistance = withCardioActive((session) => ({
    ...session,
    entries: { ...session.entries, corsa: [{ duration: 1200, distance: 'x', level: 8, speed: 12, effort: 'fatto' }] },
  }), { min: 600, max: 1500 });
  assert.throws(() => importState(badDistance), isStoreError('activeSession non valida'));

  const badSpeed = withCardioActive((session) => ({
    ...session,
    entries: { ...session.entries, corsa: [{ duration: 1200, distance: 5.2, level: 8, speed: 'x', effort: 'fatto' }] },
  }), { min: 600, max: 1500 });
  assert.throws(() => importState(badSpeed), isStoreError('activeSession non valida'));
});

test('importState accetta un target cardio con duration null (nessun obiettivo in scheda)', () => {
  const state = startSession(cardioProgram(), createEmptyState(), 'D', at('2026-09-27T18:00:00.000Z'));
  assert.equal(state.activeSession.targets.corsa.duration, null);
  assert.doesNotThrow(() => importState(JSON.stringify(state)));
});

test('importState accetta effort "fatto" in una serie', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const withFatto = {
    ...state,
    activeSession: {
      ...state.activeSession,
      entries: {
        ...state.activeSession.entries,
        panca: state.activeSession.entries.panca.map((set, index) => (index === 0 ? { ...set, effort: 'fatto' } : set)),
      },
    },
  };
  assert.doesNotThrow(() => importState(JSON.stringify(withFatto)));
});

test('validateState accetta settings.sidesAuto booleano o assente, rifiuta altri valori', () => {
  const withSidesAuto = (sidesAuto) => JSON.stringify({ ...createEmptyState(), settings: { sound: true, bodyWeight: null, sidesAuto } });
  assert.doesNotThrow(() => importState(withSidesAuto(true)));
  assert.doesNotThrow(() => importState(withSidesAuto(false)));
  assert.doesNotThrow(() => importState(JSON.stringify({ ...createEmptyState(), settings: { sound: true, bodyWeight: null } })));
  assert.throws(() => importState(withSidesAuto('true')), isStoreError('settings non validi'));
  assert.throws(() => importState(withSidesAuto(1)), isStoreError('settings non validi'));
});

test('validateState accetta activeSession.timer nella forma spec, null o assente; rifiuta forme non valide', () => {
  const p = program();
  const state = startSession(p, createEmptyState(), 'A', at('2026-09-27T18:00:00.000Z'));
  const validTimer = {
    exerciseId: 'panca',
    setIndex: 0,
    mode: 'countdown',
    side: 1,
    runningSince: '2026-09-27T18:00:00.000Z',
    elapsedMs: 0,
    targetSeconds: 60,
    switchEndsAt: null,
  };
  const withTimer = (timer) => JSON.stringify({ ...state, activeSession: { ...state.activeSession, timer } });

  assert.doesNotThrow(() => importState(withTimer(validTimer)));
  assert.doesNotThrow(() => importState(withTimer(null)));
  assert.doesNotThrow(() => importState(JSON.stringify(state)));

  assert.throws(() => importState(withTimer({ ...validTimer, mode: 'boh' })), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withTimer({ ...validTimer, side: 3 })), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withTimer({ ...validTimer, elapsedMs: '0' })), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withTimer({ ...validTimer, exerciseId: 5 })), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withTimer({ ...validTimer, runningSince: 5 })), isStoreError('activeSession non valida'));
});

test('backward compat: uno stato salvato prima di questo task (senza i campi nuovi) resta valido', () => {
  const p = program();
  const state = playSession(p, createEmptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] },
    '2026-09-27T18:00:00.000Z', '2026-09-27T19:00:00.000Z');
  assert.doesNotThrow(() => importState(JSON.stringify(state)));
});

test('importState rifiuta lastExportAt non stringa', () => {
  const text = JSON.stringify({ ...createEmptyState(), lastExportAt: 5 });
  assert.throws(() => importState(text), isStoreError('lastExportAt non valido'));
});

test('validateState accetta block.phase nota, null o assente; rifiuta valori sconosciuti', () => {
  const withPhase = (phase) =>
    withActive((session) => ({ ...session, blocks: session.blocks.map((block) => ({ ...block, phase })) }));
  const withoutPhase = withActive((session) => ({
    ...session,
    blocks: session.blocks.map(({ phase, ...block }) => block),
  }));
  assert.doesNotThrow(() => importState(withPhase('riscaldamento')));
  assert.doesNotThrow(() => importState(withPhase('defaticamento')));
  assert.doesNotThrow(() => importState(withPhase(null)));
  assert.doesNotThrow(() => importState(withoutPhase));
  assert.throws(() => importState(withPhase('meta')), isStoreError('activeSession non valida'));
});

test('importState valida category, sides e testi copiati nei targets; tutti facoltativi', () => {
  const strip = ({ category, sides, description, steps, tips, ...target }) => target;
  assert.doesNotThrow(() => importState(withPanca(strip)));
  assert.doesNotThrow(() => importState(withPanca((target) => ({ ...target, category: 'stretching', sides: 2 }))));
  assert.doesNotThrow(() =>
    importState(withPanca((target) => ({ ...target, description: 'Testo', steps: ['Uno', 'Due'], tips: [] }))),
  );
  const invalid = [
    { category: 'yoga' },
    { category: null },
    { sides: 3 },
    { sides: '2' },
    { description: 5 },
    { steps: 'uno' },
    { steps: ['uno', 3] },
    { tips: [null] },
  ];
  invalid.forEach((patch) => {
    assert.throws(() => importState(withPanca((target) => ({ ...target, ...patch }))), isStoreError('activeSession non valida'));
  });
});

test('importState accetta un blocco con rest 0 e rifiuta rest negativo', () => {
  const withRest = (rest) => withActive((session) => ({ ...session, blocks: session.blocks.map((block) => ({ ...block, rest })) }));
  assert.doesNotThrow(() => importState(withRest(0)));
  assert.throws(() => importState(withRest(-1)), isStoreError('activeSession non valida'));
});

test('importState accetta un target MAX (max null) e rifiuta min null', () => {
  assert.doesNotThrow(() => importState(withPanca((target) => ({ ...target, reps: { min: 1, max: null } }))));
  assert.throws(
    () => importState(withPanca((target) => ({ ...target, reps: { min: null, max: null } }))),
    isStoreError('activeSession non valida'),
  );
});

test('importState rifiuta un blocco senza esercizi', () => {
  const text = withActive((session) => ({ ...session, blocks: [...session.blocks, { rest: 60, phase: null, exerciseIds: [] }] }));
  assert.throws(() => importState(text), isStoreError('activeSession non valida'));
});

test('importState rifiuta un timer su un esercizio o una serie inesistente nella sessione', () => {
  const timer = {
    exerciseId: 'panca',
    setIndex: 0,
    mode: 'stopwatch',
    side: 1,
    runningSince: null,
    elapsedMs: 0,
    targetSeconds: null,
    switchEndsAt: null,
  };
  const withTimer = (patch) => withActive((session) => ({ ...session, timer: { ...timer, ...patch } }));
  assert.doesNotThrow(() => importState(withTimer({})));
  assert.throws(() => importState(withTimer({ exerciseId: 'fantasma' })), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withTimer({ exerciseId: 'toString' })), isStoreError('activeSession non valida'));
  assert.throws(() => importState(withTimer({ setIndex: 99 })), isStoreError('activeSession non valida'));
});

test('backward compat: backup vecchio senza category, sides, testi, phase e timer resta valido', () => {
  const p = program();
  const played = playSession(p, createEmptyState(), 'A', { panca: [{ weight: 60, effort: 'giusta' }] },
    '2026-09-27T18:00:00.000Z', '2026-09-27T19:00:00.000Z');
  const oldTarget = ({ category, sides, description, steps, tips, ...target }) => target;
  const oldSession = ({ timer, ...session }) => ({
    ...session,
    blocks: session.blocks.map(({ phase, ...block }) => block),
    targets: Object.fromEntries(Object.entries(session.targets).map(([id, target]) => [id, oldTarget(target)])),
  });
  const started = startSession(p, played, 'A', at('2026-09-28T18:00:00.000Z'));
  const { sidesAuto, ...oldSettings } = started.settings;
  const old = { ...started, settings: oldSettings, sessions: started.sessions.map(oldSession), activeSession: oldSession(started.activeSession) };
  assert.equal('category' in old.sessions[0].targets.panca, false);
  assert.equal('timer' in old.activeSession, false);
  assert.doesNotThrow(() => importState(JSON.stringify(old)));
});

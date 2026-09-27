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
  saveState,
  toDateStamp,
} from '../js/store.js';
import { startSession, updateSet } from '../js/session.js';
import { at, program } from './fixtures.js';
import { emptyState, playSession } from './helpers.js';

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

test('importState rifiuta lastExportAt non stringa', () => {
  const text = JSON.stringify({ ...createEmptyState(), lastExportAt: 5 });
  assert.throws(() => importState(text), isStoreError('lastExportAt non valido'));
});

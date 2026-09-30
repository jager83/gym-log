import test from 'node:test';
import assert from 'node:assert/strict';
import { blockPosition, focusPosition, nextPreview } from '../js/focus.js';
import { startSession, updateSet } from '../js/session.js';
import { at, program } from './fixtures.js';

const T0 = '2026-09-27T18:00:00.000Z';

// Allenamento A: blocco 0 = panca (3 serie, blocco singolo); blocco 1 = superset
// curl (3 serie) + trazioni (4 serie).
const freshA = () => startSession(program(), { schemaVersion: 1, settings: { sound: true, bodyWeight: null }, lastExportAt: null, activeSession: null, sessions: [] }, 'A', at(T0)).activeSession;

const mark = (session, exerciseId, setIndex, effort = 'giusta') =>
  updateSet({ activeSession: session }, exerciseId, setIndex, { effort }, at(T0)).activeSession;

test('focusPosition: blocco singolo appena iniziato, prima serie del primo blocco', () => {
  const session = freshA();
  assert.deepEqual(focusPosition(session), {
    blockIndex: 0,
    round: 0,
    items: [{ exerciseId: 'panca', setIndex: 0 }],
    complete: false,
  });
});

test('focusPosition: superset con serie diverse, il giro alterna gli esercizi e prosegue con quello più lungo', () => {
  let session = freshA();
  // finisce il blocco 0 (panca)
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  assert.deepEqual(focusPosition(session), {
    blockIndex: 1,
    round: 0,
    items: [
      { exerciseId: 'curl', setIndex: 0 },
      { exerciseId: 'trazioni', setIndex: 0 },
    ],
    complete: false,
  });

  session = mark(session, 'curl', 0);
  session = mark(session, 'trazioni', 0);
  assert.deepEqual(focusPosition(session).round, 1);

  // curl ha solo 3 serie: oltre la sua fine il giro derivato resta con solo trazioni.
  session = mark(session, 'curl', 1);
  session = mark(session, 'trazioni', 1);
  session = mark(session, 'curl', 2);
  session = mark(session, 'trazioni', 2);
  assert.deepEqual(focusPosition(session), {
    blockIndex: 1,
    round: 3,
    items: [{ exerciseId: 'trazioni', setIndex: 3 }],
    complete: false,
  });
});

test('focusPosition: sessione completa', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'curl', setIndex);
  });
  [0, 1, 2, 3].forEach((setIndex) => {
    session = mark(session, 'trazioni', setIndex);
  });
  assert.deepEqual(focusPosition(session), { complete: true });
});

test('review focus: una serie successiva segnata fuori ordine non fa saltare avanti il giro derivato', () => {
  let session = freshA();
  // segna la terza serie di panca (indice 2) senza toccare le prime due: modifica manuale
  // dalla lista, fuori ordine.
  session = mark(session, 'panca', 2);
  assert.deepEqual(focusPosition(session), {
    blockIndex: 0,
    round: 0,
    items: [{ exerciseId: 'panca', setIndex: 0 }],
    complete: false,
  });
  // stesso comportamento passando esplicitamente il blocco (navigazione con le frecce)
  assert.equal(blockPosition(session, 0).round, 0);
  assert.equal(blockPosition(session, 0).blockComplete, false);
});

test('review focus: completare il blocco corrente fuori ordine sposta subito la posizione al blocco successivo', () => {
  let session = freshA();
  // segna le serie di panca in ordine sparso: 1, poi 0, poi 2 (l'ultima a chiudere il blocco).
  session = mark(session, 'panca', 1);
  session = mark(session, 'panca', 0);
  session = mark(session, 'panca', 2);
  assert.deepEqual(focusPosition(session), {
    blockIndex: 1,
    round: 0,
    items: [
      { exerciseId: 'curl', setIndex: 0 },
      { exerciseId: 'trazioni', setIndex: 0 },
    ],
    complete: false,
  });
});

test('blockPosition: blocco scelto già completo restituisce l\'ultimo giro con blockComplete true', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  assert.deepEqual(blockPosition(session, 0), {
    blockIndex: 0,
    round: 2,
    items: [{ exerciseId: 'panca', setIndex: 2 }],
    complete: false,
    blockComplete: true,
  });
  // il blocco successivo, non ancora iniziato, resta col giro corrente e blockComplete false
  assert.deepEqual(blockPosition(session, 1), {
    blockIndex: 1,
    round: 0,
    items: [
      { exerciseId: 'curl', setIndex: 0 },
      { exerciseId: 'trazioni', setIndex: 0 },
    ],
    complete: false,
    blockComplete: false,
  });
});

test('nextPreview: dopo l\'ultimo giro di un blocco mostra il primo esercizio del blocco successivo', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  assert.deepEqual(nextPreview(session), { exerciseId: 'curl', name: 'Curl', setIndex: 0, sets: 3 });
});

test('nextPreview: a metà blocco mostra il giro successivo dello stesso blocco', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  session = mark(session, 'curl', 0);
  session = mark(session, 'trazioni', 0);
  assert.deepEqual(nextPreview(session), { exerciseId: 'curl', name: 'Curl', setIndex: 1, sets: 3 });
});

test('nextPreview: null a sessione completa', () => {
  let session = freshA();
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'panca', setIndex);
  });
  [0, 1, 2].forEach((setIndex) => {
    session = mark(session, 'curl', setIndex);
  });
  [0, 1, 2, 3].forEach((setIndex) => {
    session = mark(session, 'trazioni', setIndex);
  });
  assert.equal(nextPreview(session), null);
});

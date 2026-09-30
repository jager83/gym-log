import { isDone } from './metrics.js';
import { interleaveSets, updateSet } from './session.js';
import { startTimer, stopTimer, timerStatus } from './timer.js';

const itemsOfRound = (order, round) => order.filter((item) => item.setIndex === round);

const isSetDone = (session, exerciseId, setIndex) => isDone(session.entries[exerciseId][setIndex]);

const isBlockDone = (session, block) =>
  block.exerciseIds.every((exerciseId) => session.entries[exerciseId].every(isDone));

// Posizione (giro corrente) di un blocco scelto esplicitamente, indipendentemente dal fatto
// che i blocchi precedenti siano completi: usata per la navigazione manuale con le frecce.
// Se il blocco è già completo, resta sull'ultimo giro (blockComplete: true) invece di restare
// bloccato sull'ultima serie non toccata o di non restituire nulla.
export const blockPosition = (session, blockIndex) => {
  const block = session.blocks[blockIndex];
  const order = interleaveSets(block, session.targets);
  const blockComplete = isBlockDone(session, block);
  const round = blockComplete
    ? order.at(-1).setIndex
    : order.find((item) => !isSetDone(session, item.exerciseId, item.setIndex)).setIndex;
  return { blockIndex, round, items: itemsOfRound(order, round), complete: false, blockComplete };
};

// Posizione derivata dai dati: primo blocco non completato, primo giro con almeno una serie
// non fatta in quel blocco. Non salta mai su blocchi già completati e non resta mai su un
// blocco completato: una volta che l'ultima serie mancante di un blocco viene segnata (anche
// fuori ordine, da una modifica manuale in lista), la posizione avanza subito al blocco
// successivo.
export const focusPosition = (session) => {
  const blockIndex = session.blocks.findIndex((block) => !isBlockDone(session, block));
  if (blockIndex === -1) return { complete: true };
  const { blockComplete, ...position } = blockPosition(session, blockIndex);
  return position;
};

// Anteprima del prossimo giro/blocco, per lo schermo di recupero. Va valutata sullo stato della
// sessione subito dopo aver segnato la serie che chiude il giro corrente: a quel punto
// focusPosition riflette già la posizione successiva (prossimo giro dello stesso blocco, o primo
// giro del blocco dopo). Mostra solo il primo esercizio del giro (per i superset, l'esercizio che
// si affronta per primo in quel giro). Il nome viene da session.targets[exerciseId].name (copiato
// dal programma in startSession); null a sessione completa.
export const nextPreview = (session) => {
  const position = focusPosition(session);
  if (position.complete) return null;
  const { exerciseId, setIndex } = position.items[0];
  const target = session.targets[exerciseId];
  return { exerciseId, name: target.name, setIndex, sets: target.sets };
};

const isTimerOn = (session, exerciseId, setIndex) =>
  session.timer?.exerciseId === exerciseId && session.timer?.setIndex === setIndex;

// Tap su una faccina (o "Fatto"): stessa fatica = la toglie, altrimenti la imposta. Se il timer è
// sulla stessa serie lo ferma prima (secondi effettivi registrati): segnare la fatica chiude la
// serie. Per stretching/mobilita stopTimer la segna già "fatto": il tap non la riapre.
export const toggleEffort = (state, exerciseId, setIndex, effort, now) => {
  const session = state.activeSession;
  if (!session?.entries[exerciseId]?.[setIndex]) return state;
  const timed = isTimerOn(session, exerciseId, setIndex);
  const base = timed ? stopTimer(state, now) : state;
  const current = base.activeSession.entries[exerciseId][setIndex].effort;
  if (timed && current === effort) return base;
  return updateSet(base, exerciseId, setIndex, { effort: current === effort ? null : effort }, now);
};

// Timer fermi che startTimer sostituirebbe perdendo il tempo accumulato: cronometro in pausa,
// lato 1 concluso in attesa del lato 2.
const REPLACEABLE_STATUSES = ['paused', 'side-done-live', 'side-done-stale'];

// Avvia il timer di una serie. Un timer fermo su un'altra serie viene prima chiuso con stopTimer,
// così il suo tempo resta registrato; uno in corso (o in cambio lato) blocca l'avvio: lo state
// torna invariato (stesso riferimento), come per ogni avvio rifiutato da startTimer.
export const startTimerOn = (state, exerciseId, setIndex, now) => {
  const session = state.activeSession;
  if (!session) return state;
  const other = session.timer && !isTimerOn(session, exerciseId, setIndex);
  if (!other) return startTimer(state, exerciseId, setIndex, now);
  if (!REPLACEABLE_STATUSES.includes(timerStatus(session, now))) return state;
  const started = startTimer(stopTimer(state, now), exerciseId, setIndex, now);
  return started.activeSession.timer ? started : state;
};

// Riepilogo di fine sessione: esercizi con almeno una serie fatta, serie fatte, secondi dall'inizio.
export const sessionSummary = (session, now) => {
  const setLists = Object.values(session.entries);
  return {
    exercises: setLists.filter((sets) => sets.some(isDone)).length,
    sets: setLists.reduce((total, sets) => total + sets.filter(isDone).length, 0),
    seconds: Math.max(0, Math.floor((now.getTime() - Date.parse(session.startedAt)) / 1000)),
  };
};

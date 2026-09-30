import { DONE_EFFORT, REST_LIVE_GRACE_MS, updateSet } from './session.js';
import { isDone } from './metrics.js';

// Timer degli esercizi (spec §4): logica pura, istanti assoluti in activeSession.timer, `now`
// sempre iniettato. Le transizioni automatiche (fine lato, cambio lato, fine) le applica
// advanceTimer, chiamata dal watcher di app.js: è l'unico punto che decide l'avviso.

export const SIDE_SWITCH_MS = 5000;
export const TIMER_LIVE_GRACE_MS = REST_LIVE_GRACE_MS;

const MODE_BY_TYPE = { time: 'countdown', cardio: 'stopwatch' };

const toIso = (timeMs) => new Date(timeMs).toISOString();

const withTimer = (state, timer) => ({ ...state, activeSession: { ...state.activeSession, timer } });

const targetMsOf = (timer) => timer.targetSeconds * 1000;

const sidesOf = (session, timer) => session.targets[timer.exerciseId]?.sides ?? 1;

const isCountdown = (timer) => timer.mode === 'countdown';

const isStopped = (timer) => timer.runningSince === null && timer.switchEndsAt === null;

// Lato concluso, lato successivo non ancora avviato: attesa di "Avvia lato 2" o cambio lato.
const isSideComplete = (timer) =>
  isCountdown(timer) && timer.runningSince === null && timer.elapsedMs >= targetMsOf(timer);

// Istante in cui il lato in corso di un conto alla rovescia arriva a zero.
const sideEndMs = (timer) => Date.parse(timer.runningSince) + targetMsOf(timer) - timer.elapsedMs;

export const timerElapsedMs = (timer, now) => {
  if (!timer) return 0;
  const runningMs = timer.runningSince ? now.getTime() - Date.parse(timer.runningSince) : 0;
  return timer.elapsedMs + runningMs;
};

// Solo conto alla rovescia; null per il cronometro o senza timer.
export const timerRemainingMs = (timer, now) => {
  if (!timer || !isCountdown(timer)) return null;
  return Math.max(0, targetMsOf(timer) - timerElapsedMs(timer, now));
};

// '-live' / '-stale' descrivono un conto alla rovescia arrivato a zero ma non ancora avanzato:
// live entro TIMER_LIVE_GRACE_MS dallo zero (merita l'avviso), stale oltre (es. app riaperta).
// Il timer fermo in attesa di "Avvia lato 2" è 'side-done-stale': l'avviso è già stato dato.
export const timerStatus = (session, now) => {
  const timer = session?.timer;
  if (!timer) return 'idle';
  if (timer.switchEndsAt) return 'switching';
  if (!timer.runningSince) {
    return isSideComplete(timer) && timer.side < sidesOf(session, timer) ? 'side-done-stale' : 'paused';
  }
  if (!isCountdown(timer)) return 'running';
  const overdueMs = now.getTime() - sideEndMs(timer);
  if (overdueMs < 0) return 'running';
  const freshness = overdueMs <= TIMER_LIVE_GRACE_MS ? 'live' : 'stale';
  return `${timer.side < sidesOf(session, timer) ? 'side-done' : 'finished'}-${freshness}`;
};

// Registra la durata sulla serie passando da updateSet (così valgono le regole del recupero) e
// chiude il timer. stretching/mobilita: la serie diventa fatta; forza: resta da valutare.
const closeTimer = (state, seconds, now) => {
  const { exerciseId, setIndex } = state.activeSession.timer;
  const category = state.activeSession.targets[exerciseId]?.category ?? 'forza';
  const patch = category === 'forza' ? { duration: seconds } : { duration: seconds, effort: DONE_EFFORT };
  return withTimer(updateSet(state, exerciseId, setIndex, patch, now), null);
};

export const startTimer = (state, exerciseId, setIndex, now) => {
  const session = state.activeSession;
  if (!session) return state;
  const target = session.targets[exerciseId];
  const set = session.entries[exerciseId]?.[setIndex];
  if (!target || !set || isDone(set)) return state;
  const mode = MODE_BY_TYPE[target.type];
  if (!mode) return state;

  const existing = session.timer ?? null;
  const isSameSet = existing?.exerciseId === exerciseId && existing?.setIndex === setIndex;
  if (existing && (isSameSet || !isStopped(existing))) return state;

  const targetSeconds = mode === 'countdown' ? set.duration : null;
  if (mode === 'countdown' && !(targetSeconds > 0)) return state;

  // Avviare un timer chiude un recupero attivo: si sta ripartendo.
  return {
    ...state,
    activeSession: {
      ...session,
      restEndsAt: null,
      restBlockIndex: null,
      timer: {
        exerciseId,
        setIndex,
        mode,
        side: 1,
        runningSince: now.toISOString(),
        elapsedMs: 0,
        targetSeconds,
        switchEndsAt: null,
      },
    },
  };
};

export const pauseTimer = (state, now) => {
  const timer = state.activeSession?.timer;
  if (!timer || isCountdown(timer) || !timer.runningSince) return state;
  return withTimer(state, { ...timer, elapsedMs: timerElapsedMs(timer, now), runningSince: null });
};

export const resumeTimer = (state, now) => {
  const timer = state.activeSession?.timer;
  if (!timer || isCountdown(timer) || timer.runningSince) return state;
  return withTimer(state, { ...timer, runningSince: now.toISOString() });
};

// Countdown: secondi effettivi del lato in corso (mai oltre il target); cronometro: totale.
export const stopTimer = (state, now) => {
  const timer = state.activeSession?.timer;
  if (!timer) return state;
  const elapsedMs = timerElapsedMs(timer, now);
  const recordedMs = isCountdown(timer) ? Math.min(elapsedMs, targetMsOf(timer)) : elapsedMs;
  return closeTimer(state, Math.round(recordedMs / 1000), now);
};

// Avvia il lato 2 a mano: dall'attesa (sidesAuto off) o saltando il cambio lato in corso.
export const startNextSide = (state, now) => {
  const session = state.activeSession;
  const timer = session?.timer;
  if (!timer || !isSideComplete(timer) || timer.side >= sidesOf(session, timer)) return state;
  return withTimer(state, {
    ...timer,
    side: timer.side + 1,
    runningSince: now.toISOString(),
    elapsedMs: 0,
    switchEndsAt: null,
  });
};

// Una transizione automatica, o null se non ce n'è. Gli istanti seguono la linea temporale
// assoluta (fine lato, fine cambio lato), non `now`: un timer ripreso dopo una chiusura
// dell'app si ritrova dove sarebbe arrivato, e l'avviso vale solo se la transizione è live.
const stepTimer = (state, now, sidesAuto) => {
  const session = state.activeSession;
  const timer = session?.timer;
  if (!timer || !isCountdown(timer)) return null;

  if (timer.switchEndsAt) {
    if (now.getTime() < Date.parse(timer.switchEndsAt)) return null;
    const nextSide = { ...timer, side: timer.side + 1, runningSince: timer.switchEndsAt, elapsedMs: 0, switchEndsAt: null };
    return { state: withTimer(state, nextSide), alert: false };
  }

  // Fermo: attesa di "Avvia lato 2" (mai avanzata da sola) o non ancora avviato.
  if (!timer.runningSince) return null;

  const endMs = sideEndMs(timer);
  const overdueMs = now.getTime() - endMs;
  if (overdueMs < 0) return null;
  const alert = overdueMs <= TIMER_LIVE_GRACE_MS;

  if (timer.side < sidesOf(session, timer)) {
    const sideDone = {
      ...timer,
      runningSince: null,
      elapsedMs: targetMsOf(timer),
      switchEndsAt: sidesAuto ? toIso(endMs + SIDE_SWITCH_MS) : null,
    };
    return { state: withTimer(state, sideDone), alert };
  }

  // Ultimo lato: durata piena; l'istante di chiusura (e dell'eventuale recupero) è lo zero.
  return { state: closeTimer(state, timer.targetSeconds, new Date(endMs)), alert };
};

// Applica tutte le transizioni dovute a `now`. `alert` è vero se almeno una è live.
// Restituisce lo stesso state (stesso riferimento) se non cambia nulla.
export const advanceTimer = (state, now, settings) => {
  const sidesAuto = settings?.sidesAuto ?? true;
  let current = state;
  let alert = false;
  let step = stepTimer(current, now, sidesAuto);
  while (step) {
    current = step.state;
    alert = alert || step.alert;
    step = stepTimer(current, now, sidesAuto);
  }
  return { state: current, alert };
};

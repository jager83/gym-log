import { loadProgram } from './program.js';
import { STORAGE_KEY, StoreError, loadState, rawBackup, saveState, stateFromStorageEvent } from './store.js';
import { clearRest, restStatus } from './session.js';
import { advanceTimer } from './timer.js';
import { beep, downloadText, keepScreenOn, unlockAudio, vibrate } from './device.js';
import { renderHome } from './views/home.js';
import { renderSession } from './views/session.js';
import { renderFocus } from './views/focus.js';
import { renderHistory } from './views/history.js';
import { renderDays } from './views/days.js';
import { renderPreview } from './views/preview.js';

const NOTICE_MS = 4000;
const SESSION_WATCH_MS = 250;
const END_VIBRATION = [200, 100, 200];

const createNotifier = (element) => {
  let timeout = null;
  element.addEventListener('click', () => { element.hidden = true; });
  return (message, blocking = false) => {
    clearTimeout(timeout);
    element.textContent = message;
    element.classList.toggle('notice--error', blocking);
    element.hidden = false;
    if (!blocking) timeout = setTimeout(() => { element.hidden = true; }, NOTICE_MS);
  };
};

// `rawText`: contenuto grezzo di localStorage[STORAGE_KEY], se leggibile. Il pulsante di scarico
// compare solo in quel caso; questa funzione non lo modifica né lo cancella, si limita a mostrarlo.
const showFatal = (root, message, rawText) => {
  const hasBackup = typeof rawText === 'string';
  root.innerHTML = `
    <section class="fatal">
      <h1>Errore</h1>
      <p></p>
      ${hasBackup ? '<button type="button" class="button" data-action="download-backup">Scarica dati salvati</button>' : ''}
    </section>`;
  root.querySelector('p').textContent = message;
  if (!hasBackup) return;
  root.querySelector('[data-action="download-backup"]').addEventListener('click', () => {
    const { filename, json } = rawBackup(rawText, new Date());
    downloadText(filename, json);
  });
};

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
};

const requestPersistence = async () => {
  try {
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
};

// Avviso di fine recupero / timer (vibrazione, suono se attivo).
const alertEnd = (state) => {
  vibrate(END_VIBRATION);
  if (state.settings.sound) beep();
};

// Fine recupero a livello app: l'avviso arriva su qualunque vista.
// Un recupero scaduto da più di REST_LIVE_GRACE_MS (es. app riaperta) si chiude senza avviso.
const checkRest = (ctx) => {
  const state = ctx.getState();
  const status = restStatus(state.activeSession, new Date());
  if (status !== 'expired-live' && status !== 'expired-stale') return;
  if (status === 'expired-live') alertEnd(state);
  ctx.commit(clearRest(state));
};

// Transizioni automatiche del timer (fine lato, cambio lato, fine): unico punto che avvisa,
// le viste mostrano solo lo stato. Scadenze ad app chiusa: advanceTimer non chiede l'avviso.
const checkTimer = (ctx) => {
  const state = ctx.getState();
  const { state: nextState, alert } = advanceTimer(state, new Date(), state.settings);
  if (nextState === state) return;
  if (alert) alertEnd(state);
  ctx.commit(nextState);
};

// Un solo intervallo per recupero e timer. Il timer passa per primo: chiudendo una serie di
// stretching può avviare un recupero, che il controllo successivo trova già aggiornato.
const watchSession = (ctx) => {
  const check = () => {
    checkTimer(ctx);
    checkRest(ctx);
  };
  check();
  setInterval(check, SESSION_WATCH_MS);
};

// Restituisce `rerender`, che ridisegna la vista corrente senza cambiare hash: usata quando lo
// stato cambia da fuori (un'altra scheda), per non confondere un ridisegno con una navigazione.
const startRouter = (root, ctx) => {
  let cleanup = null;
  const route = () => {
    cleanup?.();
    const [, view, param] = (window.location.hash || '#/').split('/');
    if ((view === 'session' || view === 'focus') && !ctx.getState().activeSession) {
      ctx.navigate('#/');
      return;
    }
    if (view === 'session') cleanup = renderSession(root, ctx);
    else if (view === 'focus') cleanup = renderFocus(root, ctx, param ? Number(param) : null);
    else if (view === 'workout') cleanup = renderPreview(root, ctx, param ? decodeURIComponent(param) : null);
    else if (view === 'history') cleanup = renderHistory(root, ctx, param ? decodeURIComponent(param) : null);
    else if (view === 'days') cleanup = renderDays(root, ctx, param ? decodeURIComponent(param) : null);
    else cleanup = renderHome(root, ctx);
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', route);
  route();
  return route;
};

// Un'altra scheda/finestra dello stesso origin ha salvato lo stato: lo adottiamo senza risalvare
// (eviterebbe un ping-pong di eventi `storage` tra le schede).
const watchStorage = (ctx, rerender, setState) => {
  window.addEventListener('storage', (event) => {
    let nextState;
    try {
      nextState = stateFromStorageEvent(event.key, event.newValue);
    } catch (error) {
      if (!(error instanceof StoreError)) throw error;
      ctx.notify(error.message, true);
      return;
    }
    if (nextState === null) return;
    setState(nextState);
    rerender();
    ctx.notify('Dati aggiornati da un\'altra finestra');
  });
};

const main = async () => {
  const root = document.getElementById('app');
  const notify = createNotifier(document.getElementById('notice'));

  registerServiceWorker();
  unlockAudio();
  keepScreenOn(() => notify('Schermo: il blocco automatico resta attivo'));

  let program;
  try {
    program = await loadProgram();
  } catch (error) {
    showFatal(root, error.message);
    return;
  }

  let state;
  try {
    state = loadState(window.localStorage);
  } catch (error) {
    let rawText = null;
    try {
      rawText = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      rawText = null;
    }
    showFatal(root, error.message, rawText === null ? undefined : rawText);
    return;
  }

  const ctx = {
    program,
    persistDenied: false,
    getState: () => state,
    commit: (nextState) => {
      state = nextState;
      try {
        saveState(window.localStorage, state);
      } catch (error) {
        notify(error.message, true);
      }
    },
    navigate: (hash) => { window.location.hash = hash; },
    notify,
  };

  requestPersistence().then((granted) => { ctx.persistDenied = !granted; });
  watchSession(ctx);
  const rerender = startRouter(root, ctx);
  watchStorage(ctx, rerender, (nextState) => { state = nextState; });
};

main();

import { loadProgram } from './program.js';
import { loadState, saveState } from './store.js';
import { keepScreenOn, unlockAudio } from './device.js';
import { renderHome } from './views/home.js';
import { renderSession } from './views/session.js';
import { renderHistory } from './views/history.js';

const NOTICE_MS = 4000;

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

const showFatal = (root, message) => {
  root.innerHTML = '<section class="fatal"><h1>Errore</h1><p></p></section>';
  root.querySelector('p').textContent = message;
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

const startRouter = (root, ctx) => {
  let cleanup = null;
  const route = () => {
    cleanup?.();
    const [, view, param] = (window.location.hash || '#/').split('/');
    if (view === 'session' && !ctx.getState().activeSession) {
      ctx.navigate('#/');
      return;
    }
    if (view === 'session') cleanup = renderSession(root, ctx);
    else if (view === 'history') cleanup = renderHistory(root, ctx, param ? decodeURIComponent(param) : null);
    else cleanup = renderHome(root, ctx);
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', route);
  route();
};

const main = async () => {
  const root = document.getElementById('app');
  const notify = createNotifier(document.getElementById('notice'));

  registerServiceWorker();
  unlockAudio();
  keepScreenOn(() => notify('Schermo: il blocco automatico resta attivo'));

  let program;
  let state;
  try {
    program = await loadProgram();
    state = loadState(window.localStorage);
  } catch (error) {
    showFatal(root, error.message);
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
  startRouter(root, ctx);
};

main();

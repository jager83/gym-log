// Modalità focus (spec §5): un blocco (esercizio o giro di superset) alla volta, recupero a schermo
// pieno, riepilogo finale. La vista non avvisa mai (vibrazione/suono): le transizioni automatiche
// di timer e recupero le applica il watcher di app.js; qui si ridisegna quando lo stato cambia.
import { isDone } from '../metrics.js';
import { blockPosition, focusPosition, isTimerOn, nextPreview, sessionSummary, startTimerOn, toggleEffort } from '../focus.js';
import {
  REST_ADJUST_SECONDS,
  clearRest,
  extendRest,
  restRemainingMs,
  restStatus,
  setSidesAuto,
  setSound,
} from '../session.js';
import {
  pauseTimer,
  resumeTimer,
  startNextSide,
  stopTimer,
  timerElapsedMs,
  timerRemainingMs,
  timerStatus,
} from '../timer.js';
import { escapeHtml, formatDuration, formatElapsed } from '../format.js';
import {
  PHASE_LABELS,
  commitInput,
  confirmFinish,
  createStepRepeat,
  effortsHtml,
  fieldsHtml,
  focusTargetText,
  infoButtonHtml,
  normalizeInput,
  setFields,
  setTargetOf,
  stepSet,
} from './controls.js';
import { openExerciseInfo } from './info.js';

const TICK_MS = 250;
const ENDING_MS = 10000;
const CARDIO_CAPTIONS = { distance: 'Distanza km', level: 'Livello', speed: 'Velocità km/h' };

const sidesAutoOf = (settings) => settings.sidesAuto ?? true;

const doneCount = (session) =>
  Object.values(session.entries).reduce((total, sets) => total + sets.filter(isDone).length, 0);

// Stato del timer ridotto a ciò che cambia i pulsanti: i '-live'/'-stale' sono uguali a schermo;
// 'finished-*' dura al più un giro del watcher, che poi chiude il timer.
const timerPhase = (session, now) => {
  const status = timerStatus(session, now);
  if (status.startsWith('side-done')) return 'side-done';
  if (status.startsWith('finished')) return 'running';
  return status;
};

const secondsUp = (ms) => Math.ceil(Math.max(0, ms) / 1000);

const timerText = (session, now) => {
  const { timer } = session;
  if (timer.mode === 'stopwatch') return formatDuration(Math.floor(Math.max(0, timerElapsedMs(timer, now)) / 1000));
  if (timer.switchEndsAt) return formatDuration(secondsUp(Date.parse(timer.switchEndsAt) - now.getTime()));
  return formatDuration(secondsUp(timerRemainingMs(timer, now)));
};

const sideText = (session, target, phase) => {
  if (target.sides !== 2) return '';
  const { side } = session.timer;
  if (phase === 'switching') return `Cambio lato: lato ${side + 1} tra`;
  if (phase === 'side-done') return `Lato ${side} finito`;
  return `Lato ${side} di 2`;
};

const actionButton = (action, label, primary = false) =>
  `<button type="button" class="button${primary ? ' button--primary' : ''}" data-action="${action}">${label}</button>`;

// Pulsanti del timer attivo su questa serie, per modo e stato.
const timerButtonsHtml = (session, phase) => {
  const stop = actionButton('timer-stop', 'Stop');
  if (session.timer.mode === 'stopwatch') {
    return phase === 'paused' ? actionButton('timer-resume', 'Riprendi', true) + stop : actionButton('timer-pause', 'Pausa') + stop;
  }
  if (phase === 'side-done' || phase === 'switching') return actionButton('timer-next', 'Avvia lato 2', true) + stop;
  return stop;
};

const sidesSwitchHtml = (settings) => `
  <button type="button" class="switch" role="switch" aria-checked="${sidesAutoOf(settings)}" data-action="sides-auto">
    <span class="switch__track" aria-hidden="true"></span>Lati di seguito
  </button>`;

const timerPanelHtml = (text, side, live) => `
  <div class="timer" role="timer">
    ${side ? `<span class="timer__side">${side}</span>` : ''}
    <span class="timer__time"${live ? ' data-live="timer"' : ''}>${text}</span>
  </div>`;

// Controlli di una serie per tipo: stepper (forza e simili), conto alla rovescia (time),
// cronometro + distanza/livello/velocità (cardio). `name` già escapato.
const controlsHtml = (session, settings, exerciseId, setIndex, name, now) => {
  const target = session.targets[exerciseId];
  const set = session.entries[exerciseId][setIndex];
  const number = setIndex + 1;
  const timed = isTimerOn(session, exerciseId, setIndex);
  const phase = timed ? timerPhase(session, now) : 'idle';
  const start = !timed && !isDone(set) ? `<div class="focus-card__actions">${actionButton('timer-start', 'Avvia', true)}</div>` : '';
  const switchHtml = target.type === 'time' && target.sides === 2 ? sidesSwitchHtml(settings) : '';

  if (target.type === 'time') {
    if (!timed) return `<div class="focus-card__fields">${fieldsHtml(target, set, name, number)}</div>${start}${switchHtml}`;
    return `${timerPanelHtml(timerText(session, now), sideText(session, target, phase), true)}
      <div class="focus-card__actions">${timerButtonsHtml(session, phase)}</div>${switchHtml}`;
  }

  if (target.type === 'cardio') {
    const extraFields = setFields(target).filter(([field]) => field !== 'duration');
    const panel = timed
      ? timerPanelHtml(timerText(session, now), '', true)
      : timerPanelHtml(formatDuration(set.duration ?? 0), '', false);
    const buttons = timed ? `<div class="focus-card__actions">${timerButtonsHtml(session, phase)}</div>` : start;
    const labeled = extraFields
      .map((field) => `<div class="focus-field"><span class="focus-field__label" aria-hidden="true">${CARDIO_CAPTIONS[field[0]]}</span>${fieldsHtml(target, set, name, number, [field])}</div>`)
      .join('');
    return `${panel}${buttons}<div class="focus-card__fields">${labeled}</div>`;
  }

  return `<div class="focus-card__fields">${fieldsHtml(target, set, name, number)}</div>`;
};

const cardHtml = (session, settings, { exerciseId, setIndex }, now) => {
  const target = session.targets[exerciseId];
  const set = session.entries[exerciseId][setIndex];
  const name = escapeHtml(target.name);
  return `
    <article class="focus-card" data-exercise="${escapeHtml(exerciseId)}" data-set="${setIndex}">
      <div class="focus-card__head">
        <h2 class="focus-card__name">${name}</h2>
        ${infoButtonHtml(exerciseId, target)}
      </div>
      <p class="focus-card__target">${focusTargetText(target, setIndex)}</p>
      ${controlsHtml(session, settings, exerciseId, setIndex, name, now)}
      <div class="focus-card__efforts">${effortsHtml(target, set, name, setIndex + 1)}</div>
    </article>`;
};

const barHtml = (nav) => `
  <header class="focus__bar">
    <a class="button focus__list" href="#/session">Lista</a>
    ${nav}
  </header>`;

const navHtml = ({ slot, maxSlot, total }) => `
  <nav class="focus__nav" aria-label="Blocchi">
    <button type="button" class="focus__arrow" data-action="prev" aria-label="Blocco precedente" ${slot === 0 ? 'disabled' : ''}>‹</button>
    <span class="focus__count">${slot < total ? `${slot + 1} / ${total}` : 'Fine'}</span>
    <button type="button" class="focus__arrow" data-action="next" aria-label="Blocco successivo" ${slot >= maxSlot ? 'disabled' : ''}>›</button>
  </nav>`;

const blockScreenHtml = (session, settings, position, slots, now) => {
  const block = session.blocks[position.blockIndex];
  const tags = [
    block.phase ? `<span class="focus__phase">${PHASE_LABELS[block.phase]}</span>` : '',
    position.items.length > 1 ? '<span class="block__tag">Superset</span>' : '',
    position.blockComplete ? '<span class="block__completed">✓ Completato</span>' : '',
  ].join('');
  return `
    <section class="focus">
      ${barHtml(navHtml(slots))}
      <h1 class="visually-hidden">${escapeHtml(session.workoutName)}</h1>
      ${tags ? `<div class="focus__tags">${tags}</div>` : ''}
      ${position.items.map((item) => cardHtml(session, settings, item, now)).join('')}
    </section>`;
};

const soundButtonHtml = (settings) =>
  `<button type="button" class="focus__sound" data-action="sound" aria-label="Suono" aria-pressed="${settings.sound}">${settings.sound ? '🔔' : '🔕'}</button>`;

const restScreenHtml = (session, settings) => {
  const preview = nextPreview(session);
  return `
    <section class="focus rest-screen" aria-label="Recupero">
      ${barHtml(soundButtonHtml(settings))}
      <p class="focus__phase">Recupero</p>
      <p class="rest-screen__time" role="timer" data-live="rest"></p>
      <div class="rest-screen__actions">
        <button type="button" class="button" data-action="rest-add" aria-label="Aggiungi ${REST_ADJUST_SECONDS} secondi">+${REST_ADJUST_SECONDS}</button>
        <button type="button" class="button button--primary" data-action="rest-skip">Salta</button>
      </div>
      ${preview ? `<p class="rest-screen__next">Poi: ${escapeHtml(preview.name)} · serie ${preview.setIndex + 1} di ${preview.sets}</p>` : ''}
    </section>`;
};

const summaryScreenHtml = (session, slots, now) => {
  const { exercises, sets, seconds } = sessionSummary(session, now);
  return `
    <section class="focus focus-summary">
      ${barHtml(navHtml(slots))}
      <h1 class="focus-summary__title">Allenamento completato</h1>
      <dl class="focus-summary__stats">
        <div><dt>Esercizi</dt><dd>${exercises}</dd></div>
        <div><dt>Serie</dt><dd>${sets}</dd></div>
        <div><dt>Durata</dt><dd>${formatElapsed(seconds)}</dd></div>
      </dl>
      <button type="button" class="button button--primary focus-summary__finish" data-action="finish">Termina</button>
    </section>`;
};

// Descrive l'elemento con il focus per ritrovarlo dopo un ridisegno.
const focusSelector = (element) => {
  const row = element.closest('[data-set]');
  const scope = row ? `[data-exercise="${CSS.escape(row.dataset.exercise)}"][data-set="${row.dataset.set}"] ` : '';
  const { action, field, dir, effort } = element.dataset;
  const attributes = [
    action ? `[data-action="${action}"]` : '',
    field ? `[data-field="${field}"]` : '',
    dir ? `[data-dir="${dir}"]` : '',
    effort ? `[data-effort="${effort}"]` : '',
  ].join('');
  return attributes ? `${scope}${attributes}` : null;
};

// `initialBlock`: blocco scelto dalla lista (titolo toccato), o null per la posizione derivata.
export const renderFocus = (root, ctx, initialBlock) => {
  const getSession = () => ctx.getState().activeSession;
  const getSettings = () => ctx.getState().settings;

  // Override manuale (frecce o titolo dalla lista): indice di blocco, o blocks.length per il
  // riepilogo; null = posizione derivata. Resta finché non si segna una serie.
  let manual = null;
  let lastDone = doneCount(getSession());
  let lastKey = null;
  let lastPlace = null;
  let closeInfo = null;

  const slotsOf = (session) => {
    const derived = focusPosition(session);
    const total = session.blocks.length;
    const derivedSlot = derived.complete ? total : derived.blockIndex;
    return { derived, derivedSlot, total, maxSlot: derived.complete ? total : total - 1, slot: manual ?? derivedSlot };
  };

  const screenOf = (session, now) => {
    const slots = slotsOf(session);
    if (restStatus(session, now) === 'running') return { kind: 'rest', slots };
    if (slots.slot === slots.total) return { kind: 'summary', slots };
    const position = manual === null ? slots.derived : blockPosition(session, manual);
    return { kind: 'block', slots, position };
  };

  // Tutto ciò che cambia la struttura dello schermo; i numeri modificati a mano restano fuori
  // (si aggiornano sul posto), così digitare non ridisegna e non perde il focus.
  const keyOf = (session, screen, now) => {
    const settings = getSettings();
    const { timer } = session;
    const parts = [screen.kind, settings.sound, sidesAutoOf(settings), screen.slots.slot, screen.slots.derivedSlot];
    if (screen.kind === 'summary') parts.push(Math.floor(sessionSummary(session, now).seconds / 60), doneCount(session));
    if (screen.kind === 'block') {
      const { position } = screen;
      parts.push(
        position.blockIndex,
        position.round,
        position.blockComplete ?? false,
        position.items.map(({ exerciseId, setIndex }) => session.entries[exerciseId][setIndex].effort),
        timer ? [timer.exerciseId, timer.setIndex, timer.side, timerPhase(session, now)] : null,
      );
    }
    return JSON.stringify(parts);
  };

  const drawLive = (session, now) => {
    const restTime = root.querySelector('[data-live="rest"]');
    if (restTime) {
      const remaining = restRemainingMs(session, now);
      restTime.textContent = formatDuration(secondsUp(remaining));
      root.querySelector('.rest-screen').classList.toggle('is-ending', remaining <= ENDING_MS);
    }
    const timerTime = root.querySelector('[data-live="timer"]');
    if (timerTime && session.timer) timerTime.textContent = timerText(session, now);
  };

  const draw = (session, screen, now) => {
    repeat.cancel();
    const active = document.activeElement;
    const selector = active && root.contains(active) ? focusSelector(active) : null;
    const settings = getSettings();
    if (screen.kind === 'rest') root.innerHTML = restScreenHtml(session, settings);
    else if (screen.kind === 'summary') root.innerHTML = summaryScreenHtml(session, screen.slots, now);
    else root.innerHTML = blockScreenHtml(session, settings, screen.position, screen.slots, now);

    const place = screen.kind === 'block' ? `${screen.position.blockIndex}:${screen.position.round}` : screen.kind;
    if (place !== lastPlace) window.scrollTo(0, 0);
    lastPlace = place;
    const restored = selector ? root.querySelector(selector) : null;
    restored?.focus({ preventScroll: true });
  };

  const refresh = () => {
    const session = getSession();
    if (!session) return;
    const now = new Date();
    const done = doneCount(session);
    if (done > lastDone) manual = null;
    lastDone = done;
    const screen = screenOf(session, now);
    const key = keyOf(session, screen, now);
    if (key !== lastKey) {
      draw(session, screen, now);
      lastKey = key;
    }
    drawLive(session, now);
  };

  const moveBy = (direction) => {
    const { slot, derivedSlot, maxSlot } = slotsOf(getSession());
    const next = Math.min(maxSlot, Math.max(0, slot + direction));
    manual = next === derivedSlot ? null : next;
  };

  const applyStep = (info) => {
    stepSet(ctx, info);
    refresh();
  };

  const repeat = createStepRepeat({
    stepInfo: (button) => ({ ...setTargetOf(button), field: button.dataset.field, dir: Number(button.dataset.dir) }),
    applyStep,
  });

  const startBlockedMessage = (session, exerciseId, setIndex) => {
    const { timer } = session;
    if (timer && !isTimerOn(session, exerciseId, setIndex)) return `Timer in corso su ${session.targets[timer.exerciseId].name}: fermalo prima`;
    return 'Imposta una durata maggiore di zero';
  };

  const onTimerStart = (element, now) => {
    const { exerciseId, setIndex } = setTargetOf(element);
    const state = ctx.getState();
    const next = startTimerOn(state, exerciseId, setIndex, now);
    if (next === state) {
      ctx.notify(startBlockedMessage(state.activeSession, exerciseId, setIndex));
      return;
    }
    ctx.commit(next);
  };

  // Azioni che trasformano lo state senza altri argomenti.
  const TIMER_ACTIONS = {
    'timer-stop': stopTimer,
    'timer-pause': pauseTimer,
    'timer-resume': resumeTimer,
    'timer-next': startNextSide,
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    const now = new Date();
    const state = ctx.getState();

    if (action === 'step') {
      if (repeat.takeClick(event)) applyStep({ ...setTargetOf(target), field: target.dataset.field, dir: Number(target.dataset.dir) });
      return;
    }
    if (action === 'info') {
      closeInfo?.();
      closeInfo = openExerciseInfo(state.activeSession.targets[target.dataset.exercise]);
      return;
    }
    if (action === 'finish') {
      confirmFinish(ctx, now);
      return;
    }

    if (action === 'effort') {
      const { exerciseId, setIndex } = setTargetOf(target);
      ctx.commit(toggleEffort(state, exerciseId, setIndex, target.dataset.effort, now));
    } else if (action === 'prev' || action === 'next') {
      moveBy(action === 'prev' ? -1 : 1);
    } else if (action === 'timer-start') {
      onTimerStart(target, now);
    } else if (TIMER_ACTIONS[action]) {
      ctx.commit(TIMER_ACTIONS[action](state, now));
    } else if (action === 'sides-auto') {
      ctx.commit(setSidesAuto(state, !sidesAutoOf(state.settings)));
    } else if (action === 'rest-add') {
      ctx.commit(extendRest(state, REST_ADJUST_SECONDS));
    } else if (action === 'rest-skip') {
      ctx.commit(clearRest(state));
    } else if (action === 'sound') {
      ctx.commit(setSound(state, !state.settings.sound));
    } else {
      return;
    }
    refresh();
  };

  const onInput = (event) => {
    const input = event.target.closest('.stepper__input');
    if (!input) return;
    commitInput(ctx, input);
    refresh();
  };

  const onChange = (event) => {
    const input = event.target.closest('.stepper__input');
    if (!input) return;
    normalizeInput(ctx, input);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && event.target.matches('.stepper__input')) event.target.blur();
  };

  // Blocco richiesto dalla lista: override solo se diverso dalla posizione derivata. L'hash torna
  // a #/focus, così una riapertura riparte dalla posizione derivata.
  const initialSession = getSession();
  if (Number.isInteger(initialBlock) && initialBlock >= 0 && initialBlock < initialSession.blocks.length) {
    manual = initialBlock === slotsOf(initialSession).derivedSlot ? null : initialBlock;
  }
  if (window.location.hash !== '#/focus') window.history.replaceState(null, '', '#/focus');

  refresh();
  const interval = setInterval(refresh, TICK_MS);
  const detachRepeat = repeat.attach(root);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', onKeyDown);

  return () => {
    clearInterval(interval);
    detachRepeat();
    closeInfo?.();
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('keydown', onKeyDown);
  };
};

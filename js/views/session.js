import { isDone } from '../metrics.js';
import {
  EFFORTS,
  EFFORT_LABELS,
  REST_ADJUST_SECONDS,
  clearRest,
  currentBlockIndex,
  discardSession,
  extendRest,
  interleaveSets,
  lastDoneSets,
  restRemainingMs,
  restStatus,
  setSound,
  startRest,
} from '../session.js';
import { toggleEffort } from '../focus.js';
import { adviceBySession } from '../advice.js';
import { escapeHtml, formatDuration, formatSet } from '../format.js';
import { faceSvg } from './faces.js';
import { bellSvg, checkSvg, chevronLeftSvg, exerciseTypeSvg } from './icons.js';
import { openExerciseInfo } from './info.js';
import { confirmDialog } from './modal.js';
import {
  PHASE_LABELS,
  adviceHtml,
  applyAdvice,
  commitInput,
  confirmFinish,
  createStepRepeat,
  effortsHtml,
  fieldsHtml,
  infoButtonHtml,
  normalizeInput,
  outcomeSlotHtml,
  setTargetOf,
  stepSet,
  targetText,
  unitsText,
} from './controls.js';

const TICK_MS = 250;
const ENDING_MS = 10000;
const AUTO_COLLAPSE_MS = 1500;

const setHtml = (session, exerciseId, setIndex, previous, showName) => {
  const target = session.targets[exerciseId];
  const set = session.entries[exerciseId][setIndex];
  const prev = previous?.[setIndex] && isDone(previous[setIndex]) ? previous[setIndex] : null;
  const prevText = prev ? formatSet(prev, target.type) : '';
  const number = setIndex + 1;
  const name = escapeHtml(target.name);
  return `
    <div class="set" data-exercise="${escapeHtml(exerciseId)}" data-set="${setIndex}">
      ${showName ? `<p class="set__name">${name}</p>` : ''}
      <div class="set__fields">
        ${fieldsHtml(target, set, name, number)}
      </div>
      <div class="set__meta">
        <span class="set__index">${number}</span>
        <span class="set__prev">${prev && prevText !== formatSet(set, target.type) ? `prec. ${escapeHtml(prevText)}` : ''}</span>
        ${outcomeSlotHtml(set, target)}
        ${effortsHtml(target, set, name, number)}
      </div>
    </div>`;
};

// Un blocco è completo quando tutte le serie di tutti i suoi esercizi sono fatte (fatica segnata).
const isBlockComplete = (session, blockIndex) =>
  session.blocks[blockIndex].exerciseIds.every((exerciseId) => session.entries[exerciseId].every(isDone));

// Il blocco che ha in corso un recupero attivo, o null se nessun recupero è in corso.
const restingBlockIndex = (session) => (session?.restEndsAt ? session.restBlockIndex : null);

// Il titolo porta al focus su quel blocco; "i" apre la scheda esercizio se ci sono testi; sotto il
// target, il suggerimento di carico finché la serie 1 non è fatta.
// `linkable`: false nell'anteprima allenamento (nessuna sessione attiva, niente link al focus).
export const exerciseHeaderHtml = (session, blockIndex, adviceById, linkable = true) =>
  session.blocks[blockIndex].exerciseIds
    .map((exerciseId) => {
      const target = session.targets[exerciseId];
      const name = escapeHtml(target.name);
      const title = linkable ? `<a class="block__link" href="#/focus/${blockIndex}">${name}</a>` : name;
      return `<div class="block__head">
          ${exerciseTypeSvg(target.type)}
          <h2 class="block__title">${title}</h2>
          ${infoButtonHtml(exerciseId, target)}
        </div>
        <p class="block__target">${targetText(target)} · ${unitsText(target)}</p>
        ${adviceHtml(adviceById[exerciseId], exerciseId, session.entries[exerciseId][0])}`;
    })
    .join('');

export const blockTagsHtml = (block, superset) =>
  `${block.phase ? `<p class="block__phase">${PHASE_LABELS[block.phase]}</p>` : ''}${superset ? '<p class="block__tag">Superset</p>' : ''}`;

const setsRowsHtml = (session, block, previousById, superset) => {
  const order = interleaveSets(block, session.targets);
  return order
    .map(({ exerciseId, setIndex }, index) => {
      const roundStart = superset && (index === 0 || order[index - 1].setIndex !== setIndex);
      return `${roundStart ? `<p class="round__label">Serie ${setIndex + 1}</p>` : ''}${setHtml(session, exerciseId, setIndex, previousById[exerciseId], superset)}`;
    })
    .join('');
};

// `manualOpen`: blocchi completati riaperti a mano con "Mostra" (mostrano poi "Chiudi").
// `pendingCollapse`: blocchi appena completati senza un recupero attivo (l'ultimo della sessione),
// in attesa di compattarsi da soli dopo AUTO_COLLAPSE_MS.
const blockHtml = (session, blockIndex, manualOpen, previousById, pendingCollapse, adviceById) => {
  const block = session.blocks[blockIndex];
  const complete = isBlockComplete(session, blockIndex);
  const superset = block.exerciseIds.length > 1;

  if (!complete) {
    return `
      <article class="block" data-block="${blockIndex}">
        ${blockTagsHtml(block, superset)}
        ${exerciseHeaderHtml(session, blockIndex, adviceById)}
        <div class="block__sets">${setsRowsHtml(session, block, previousById, superset)}</div>
      </article>`;
  }

  const names = block.exerciseIds.map((exerciseId) => escapeHtml(session.targets[exerciseId].name)).join(' + ');
  const autoOpen = restingBlockIndex(session) === blockIndex || pendingCollapse.has(blockIndex);

  if (!autoOpen && !manualOpen.has(blockIndex)) {
    return `
      <article class="block block--done" data-block="${blockIndex}">
        <button type="button" class="block__summary" data-action="toggle-block" aria-expanded="false">
          <span><span class="block__check">${checkSvg()}</span> ${names}</span><span class="muted">Mostra</span>
        </button>
      </article>`;
  }

  const header = autoOpen
    ? `<p class="block__completed" aria-live="polite">${checkSvg()} Completato</p>`
    : exerciseHeaderHtml(session, blockIndex, adviceById);

  return `
    <article class="block block--completed" data-block="${blockIndex}">
      ${blockTagsHtml(block, superset)}
      ${header}
      ${autoOpen ? '' : '<button type="button" class="link" data-action="toggle-block" aria-expanded="true">Chiudi</button>'}
      <div class="block__sets">${setsRowsHtml(session, block, previousById, superset)}</div>
    </article>`;
};

const sessionHtml = (session, manualOpen, previousById, pendingCollapse, adviceById) => `
  <section class="session">
    <header class="page-header">
      <a class="back" href="#/" aria-label="Torna alla home">${chevronLeftSvg()}</a>
      <h1>${escapeHtml(session.workoutName)}</h1>
    </header>
    <a class="button button--primary session__start" href="#/focus">Inizia</a>
    <p class="legend">${EFFORTS.map((effort) => `<span>${faceSvg(effort)}${EFFORT_LABELS[effort]}</span>`).join('')}</p>
    <div class="blocks">${session.blocks.map((_, index) => blockHtml(session, index, manualOpen, previousById, pendingCollapse, adviceById)).join('')}</div>
    <div class="session__footer">
      <div class="session__actions">
        <button type="button" class="button" data-action="rest-start">Recupero</button>
        <button type="button" class="button button--primary" data-action="finish">Termina</button>
      </div>
      <button type="button" class="link" data-action="discard">Scarta</button>
    </div>
  </section>
  <div class="rest-bar" role="timer" hidden>
    <span class="rest-bar__time"></span>
    <button type="button" data-action="rest-add" aria-label="Aggiungi ${REST_ADJUST_SECONDS} secondi">+${REST_ADJUST_SECONDS}</button>
    <button type="button" data-action="rest-skip">Salta</button>
    <button type="button" class="rest-bar__sound" data-action="sound" aria-label="Suono"></button>
  </div>`;

export const renderSession = (root, ctx) => {
  const getSession = () => ctx.getState().activeSession;
  const initial = getSession();
  const previousById = Object.fromEntries(
    Object.keys(initial.entries).map((exerciseId) => [exerciseId, lastDoneSets(ctx.getState().sessions, exerciseId)]),
  );
  // Suggerimenti dalle sessioni finite: non cambiano mentre la sessione è aperta.
  const adviceById = adviceBySession(ctx.getState().sessions, initial);
  const manualOpen = new Set();
  const pendingCollapse = new Map(); // blockIndex -> timeoutId, per il blocco completato senza recupero
  let closeInfo = null;

  root.innerHTML = sessionHtml(initial, manualOpen, previousById, pendingCollapse, adviceById);
  const restBar = root.querySelector('.rest-bar');
  const restTime = restBar.querySelector('.rest-bar__time');
  const soundButton = restBar.querySelector('[data-action="sound"]');

  const redrawBlock = (blockIndex) => {
    const element = root.querySelector(`.block[data-block="${blockIndex}"]`);
    if (element) element.outerHTML = blockHtml(getSession(), blockIndex, manualOpen, previousById, pendingCollapse, adviceById);
  };

  const clearPendingCollapse = (blockIndex) => {
    const timeoutId = pendingCollapse.get(blockIndex);
    if (timeoutId === undefined) return;
    clearTimeout(timeoutId);
    pendingCollapse.delete(blockIndex);
  };

  // Il blocco completato è l'ultimo della sessione (nessun recupero): mostra "✓ Completato" e si
  // compatta da solo dopo AUTO_COLLAPSE_MS.
  const schedulePendingCollapse = (blockIndex) => {
    clearPendingCollapse(blockIndex);
    pendingCollapse.set(
      blockIndex,
      setTimeout(() => {
        pendingCollapse.delete(blockIndex);
        redrawBlock(blockIndex);
      }, AUTO_COLLAPSE_MS),
    );
  };
  const blockIndexOf = (element) => Number(element.closest('.block').dataset.block);

  const drawSound = () => {
    const on = ctx.getState().settings.sound;
    soundButton.innerHTML = bellSvg(on);
    soundButton.setAttribute('aria-pressed', String(on));
  };

  const applyStep = (info) => {
    stepSet(ctx, info);
    // Un peso/ripetizioni/durata toccati in un altro blocco possono chiudere un recupero altrove (C3).
    tick();
  };

  // Dopo una ripetizione rapida il blocco si ridisegna (come dopo ogni modifica strutturale).
  const repeat = createStepRepeat({
    stepInfo: (button) => ({ ...setTargetOf(button), blockIndex: blockIndexOf(button), field: button.dataset.field, dir: Number(button.dataset.dir) }),
    applyStep,
    onRepeatEnd: ({ blockIndex }) => redrawBlock(blockIndex),
  });

  // Blocco in recupero all'ultimo tick, per accorgersi in tick() quando smette di esserlo.
  let prevRestingBlock = restingBlockIndex(getSession());
  // Timer all'ultimo tick: quando il watcher lo chiude (durata registrata, stretching "Fatto")
  // si ridisegna il blocco della sua serie.
  let prevTimer = getSession().timer ?? null;

  const tick = () => {
    const session = getSession();
    const now = new Date();

    // Rileva il passaggio da recupero attivo a nessun recupero (scaduto, "Salta", o chiuso da
    // un'altra modifica) e ridisegna il blocco che stava riposando, così la card si compatta.
    const currentRestingBlock = restingBlockIndex(session);
    if (session && prevRestingBlock !== null && prevRestingBlock !== currentRestingBlock) redrawBlock(prevRestingBlock);
    prevRestingBlock = currentRestingBlock;

    const currentTimer = session?.timer ?? null;
    if (session && prevTimer && !currentTimer) {
      const blockIndex = session.blocks.findIndex((block) => block.exerciseIds.includes(prevTimer.exerciseId));
      if (blockIndex !== -1) redrawBlock(blockIndex);
    }
    prevTimer = currentTimer;

    if (!session || restStatus(session, now) !== 'running') {
      restBar.hidden = true;
      return;
    }
    const remaining = restRemainingMs(session, now);
    restTime.textContent = formatDuration(Math.ceil(remaining / 1000));
    restBar.classList.toggle('is-ending', remaining <= ENDING_MS);
    restBar.hidden = false;
  };

  const confirmDiscard = async () => {
    const confirmed = await confirmDialog({
      title: 'Scarta sessione',
      message: 'Scartare la sessione? I dati inseriti andranno persi.',
      confirmLabel: 'Scarta',
      danger: true,
    });
    if (!confirmed || !getSession()) return;
    ctx.commit(discardSession(ctx.getState()));
    ctx.navigate('#/');
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    const now = new Date();

    if (action === 'step') {
      if (repeat.takeClick(event)) applyStep({ ...setTargetOf(target), field: target.dataset.field, dir: Number(target.dataset.dir) });
      return;
    }
    if (action === 'effort') {
      const { exerciseId, setIndex } = setTargetOf(target);
      const blockIndex = blockIndexOf(target);
      const wasComplete = isBlockComplete(getSession(), blockIndex);

      ctx.commit(toggleEffort(ctx.getState(), exerciseId, setIndex, target.dataset.effort, now));

      const session = getSession();
      const isComplete = isBlockComplete(session, blockIndex);
      if (!isComplete) {
        // Una serie di una card completata è tornata "non fatta": card normale, niente stato residuo.
        manualOpen.delete(blockIndex);
        clearPendingCollapse(blockIndex);
      } else if (!wasComplete && restingBlockIndex(session) !== blockIndex) {
        // Il blocco si è appena completato e non ha un recupero attivo (è l'ultimo della sessione).
        schedulePendingCollapse(blockIndex);
      }
      redrawBlock(blockIndex);
      tick();
      return;
    }
    if (action === 'use-advice') {
      applyAdvice(ctx, target);
      tick();
      return;
    }
    if (action === 'info') {
      closeInfo?.();
      closeInfo = openExerciseInfo(getSession().targets[target.dataset.exercise]);
      return;
    }
    if (action === 'toggle-block') {
      const blockIndex = blockIndexOf(target);
      if (manualOpen.has(blockIndex)) manualOpen.delete(blockIndex);
      else manualOpen.add(blockIndex);
      redrawBlock(blockIndex);
      return;
    }
    if (action === 'rest-start') {
      const session = getSession();
      const blockIndex = currentBlockIndex(session);
      ctx.commit(startRest(ctx.getState(), session.blocks[blockIndex].rest, now, blockIndex));
      redrawBlock(blockIndex);
      tick();
      return;
    }
    if (action === 'rest-add') {
      ctx.commit(extendRest(ctx.getState(), REST_ADJUST_SECONDS));
      tick();
      return;
    }
    if (action === 'rest-skip') {
      ctx.commit(clearRest(ctx.getState()));
      tick();
      return;
    }
    if (action === 'sound') {
      ctx.commit(setSound(ctx.getState(), !ctx.getState().settings.sound));
      drawSound();
      return;
    }
    if (action === 'finish') {
      confirmFinish(ctx, now);
      return;
    }
    if (action === 'discard') confirmDiscard();
  };

  const onInput = (event) => {
    const input = event.target.closest('.stepper__input');
    if (!input) return;
    commitInput(ctx, input);
    // Un peso/ripetizioni/durata toccati in un altro blocco possono chiudere un recupero altrove (C3).
    tick();
  };

  // Su blur mostra il valore normalizzato senza ridisegnare il blocco:
  // un redraw qui cancellerebbe il pulsante fatica appena toccato.
  const onChange = (event) => {
    const input = event.target.closest('.stepper__input');
    if (!input) return;
    normalizeInput(ctx, input);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && event.target.matches('.stepper__input')) event.target.blur();
  };

  drawSound();
  tick();
  const timer = setInterval(tick, TICK_MS);
  const detachRepeat = repeat.attach(root);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', onKeyDown);

  return () => {
    clearInterval(timer);
    detachRepeat();
    closeInfo?.();
    pendingCollapse.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingCollapse.clear();
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('keydown', onKeyDown);
  };
};

import { countKey } from '../program.js';
import { isDone, setOutcome } from '../metrics.js';
import {
  EFFORTS,
  EFFORT_LABELS,
  REST_ADJUST_SECONDS,
  clearRest,
  currentBlockIndex,
  discardSession,
  extendRest,
  finishSession,
  hasDoneSets,
  interleaveSets,
  lastDoneSets,
  restRemainingMs,
  restStatus,
  setSound,
  startRest,
  stepValue,
  updateSet,
} from '../session.js';
import { escapeHtml, formatDuration, formatNumber, formatRange, formatSet, parseNumberInput } from '../format.js';
import { faceSvg } from './faces.js';

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 90;
const TICK_MS = 250;
const ENDING_MS = 10000;
const AUTO_COLLAPSE_MS = 1500;

const FIELD_LABELS = { weight: 'peso', reps: 'ripetizioni', duration: 'durata' };
const UNITS = { weight: 'kg × rip', bodyweight: 'zavorra kg × rip', time: 'secondi' };

const outcomeClass = (outcome) => (outcome === 'fallita' || outcome === 'carico-basso' ? `is-${outcome}` : '');

const targetText = (target) => `${target.sets} × ${formatRange(target[countKey(target.type)])}`;

const unitsText = (target) => (target.type === 'weight' && target.load === 'per-dumbbell' ? 'kg a manubrio × rip' : UNITS[target.type]);

const stepperHtml = (field, value, outcome, name, setNumber, fieldLabel = FIELD_LABELS[field]) => {
  const label = `${fieldLabel} ${name} serie ${setNumber}`;
  return `
    <div class="stepper">
      <button type="button" class="stepper__btn" data-action="step" data-field="${field}" data-dir="-1" aria-label="Diminuisci ${label}">−</button>
      <input class="stepper__input ${outcomeClass(outcome)}" type="text" inputmode="${field === 'weight' ? 'decimal' : 'numeric'}"
        autocomplete="off" value="${formatNumber(value)}" data-field="${field}" aria-label="${label}">
      <button type="button" class="stepper__btn" data-action="step" data-field="${field}" data-dir="1" aria-label="Aumenta ${label}">+</button>
    </div>`;
};

const setHtml = (session, exerciseId, setIndex, previous, showName) => {
  const target = session.targets[exerciseId];
  const key = countKey(target.type);
  const set = session.entries[exerciseId][setIndex];
  const outcome = setOutcome(set, target.type, target[key]);
  const prev = previous?.[setIndex] && isDone(previous[setIndex]) ? previous[setIndex] : null;
  const prevText = prev ? formatSet(prev, target.type) : '';
  const number = setIndex + 1;
  const name = escapeHtml(target.name);
  return `
    <div class="set" data-exercise="${escapeHtml(exerciseId)}" data-set="${setIndex}">
      ${showName ? `<p class="set__name">${name}</p>` : ''}
      <div class="set__fields">
        ${target.type === 'time' ? '' : stepperHtml('weight', set.weight, null, name, number, target.load === 'per-dumbbell' ? 'peso a manubrio' : FIELD_LABELS.weight)}
        ${stepperHtml(key, set[key], outcome, name, number)}
      </div>
      <div class="set__meta">
        <span class="set__index">${number}</span>
        <span class="set__prev">${prev && prevText !== formatSet(set, target.type) ? `prec. ${escapeHtml(prevText)}` : ''}</span>
        <div class="efforts" role="group" aria-label="Fatica ${name} serie ${number}">
          ${EFFORTS.map(
            (effort) => `<button type="button" class="effort effort--${effort}" data-action="effort" data-effort="${effort}"
              aria-pressed="${set.effort === effort}" aria-label="${EFFORT_LABELS[effort]}">${faceSvg(effort)}</button>`,
          ).join('')}
        </div>
      </div>
    </div>`;
};

// Un blocco è completo quando tutte le serie di tutti i suoi esercizi sono fatte (fatica segnata).
const isBlockComplete = (session, blockIndex) =>
  session.blocks[blockIndex].exerciseIds.every((exerciseId) => session.entries[exerciseId].every(isDone));

// Il blocco che ha in corso un recupero attivo, o null se nessun recupero è in corso.
const restingBlockIndex = (session) => (session?.restEndsAt ? session.restBlockIndex : null);

const exerciseHeaderHtml = (session, block) =>
  block.exerciseIds
    .map((exerciseId) => {
      const target = session.targets[exerciseId];
      return `<h2 class="block__title">${escapeHtml(target.name)}</h2>
        <p class="block__target">${targetText(target)} · ${unitsText(target)}</p>`;
    })
    .join('');

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
const blockHtml = (session, blockIndex, manualOpen, previousById, pendingCollapse) => {
  const block = session.blocks[blockIndex];
  const complete = isBlockComplete(session, blockIndex);
  const superset = block.exerciseIds.length > 1;

  if (!complete) {
    return `
      <article class="block" data-block="${blockIndex}">
        ${superset ? '<p class="block__tag">Superset</p>' : ''}
        ${exerciseHeaderHtml(session, block)}
        <div class="block__sets">${setsRowsHtml(session, block, previousById, superset)}</div>
      </article>`;
  }

  const names = block.exerciseIds.map((exerciseId) => escapeHtml(session.targets[exerciseId].name)).join(' + ');
  const autoOpen = restingBlockIndex(session) === blockIndex || pendingCollapse.has(blockIndex);

  if (!autoOpen && !manualOpen.has(blockIndex)) {
    return `
      <article class="block block--done" data-block="${blockIndex}">
        <button type="button" class="block__summary" data-action="toggle-block" aria-expanded="false">
          <span><span class="block__check">✓</span> ${names}</span><span class="muted">Mostra</span>
        </button>
      </article>`;
  }

  const header = autoOpen
    ? '<p class="block__completed" aria-live="polite">✓ Completato</p>'
    : exerciseHeaderHtml(session, block);

  return `
    <article class="block block--completed" data-block="${blockIndex}">
      ${superset ? '<p class="block__tag">Superset</p>' : ''}
      ${header}
      ${autoOpen ? '' : '<button type="button" class="link" data-action="toggle-block" aria-expanded="true">Chiudi</button>'}
      <div class="block__sets">${setsRowsHtml(session, block, previousById, superset)}</div>
    </article>`;
};

const sessionHtml = (session, manualOpen, previousById, pendingCollapse) => `
  <section class="session">
    <header class="page-header">
      <a class="back" href="#/" aria-label="Torna alla home">‹</a>
      <h1>${escapeHtml(session.workoutName)}</h1>
    </header>
    <p class="legend">${EFFORTS.map((effort) => `<span>${faceSvg(effort)}${EFFORT_LABELS[effort]}</span>`).join('')}</p>
    <div class="blocks">${session.blocks.map((_, index) => blockHtml(session, index, manualOpen, previousById, pendingCollapse)).join('')}</div>
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
    <button type="button" data-action="sound" aria-label="Suono"></button>
  </div>`;

export const renderSession = (root, ctx) => {
  const getSession = () => ctx.getState().activeSession;
  const initial = getSession();
  const previousById = Object.fromEntries(
    Object.keys(initial.entries).map((exerciseId) => [exerciseId, lastDoneSets(ctx.getState().sessions, exerciseId)]),
  );
  const manualOpen = new Set();
  const pendingCollapse = new Map(); // blockIndex -> timeoutId, per il blocco completato senza recupero
  let repeat = null;
  let suppressClick = false;

  root.innerHTML = sessionHtml(initial, manualOpen, previousById, pendingCollapse);
  const restBar = root.querySelector('.rest-bar');
  const restTime = restBar.querySelector('.rest-bar__time');
  const soundButton = restBar.querySelector('[data-action="sound"]');

  const redrawBlock = (blockIndex) => {
    const element = root.querySelector(`.block[data-block="${blockIndex}"]`);
    if (element) element.outerHTML = blockHtml(getSession(), blockIndex, manualOpen, previousById, pendingCollapse);
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
  const setTargetOf = (element) => {
    const row = element.closest('.set');
    return { row, exerciseId: row.dataset.exercise, setIndex: Number(row.dataset.set) };
  };

  const drawSound = () => {
    const on = ctx.getState().settings.sound;
    soundButton.textContent = on ? '🔔' : '🔕';
    soundButton.setAttribute('aria-pressed', String(on));
  };

  const refreshOutcome = (row, exerciseId, setIndex) => {
    const session = getSession();
    const target = session.targets[exerciseId];
    const key = countKey(target.type);
    const input = row.querySelector(`.stepper__input[data-field="${key}"]`);
    input.classList.remove('is-fallita', 'is-carico-basso');
    const className = outcomeClass(setOutcome(session.entries[exerciseId][setIndex], target.type, target[key]));
    if (className) input.classList.add(className);
  };

  const applyStep = ({ row, exerciseId, setIndex, field, dir }) => {
    const current = getSession().entries[exerciseId][setIndex][field];
    ctx.commit(updateSet(ctx.getState(), exerciseId, setIndex, { [field]: stepValue(field, current, dir) }, new Date()));
    row.querySelector(`.stepper__input[data-field="${field}"]`).value = formatNumber(
      getSession().entries[exerciseId][setIndex][field],
    );
    refreshOutcome(row, exerciseId, setIndex);
    // Un peso/ripetizioni/durata toccati in un altro blocco possono chiudere un recupero altrove (C3).
    tick();
  };

  const stepInfo = (button) => ({ ...setTargetOf(button), field: button.dataset.field, dir: Number(button.dataset.dir) });

  // Blocco in recupero all'ultimo tick, per accorgersi in tick() quando smette di esserlo.
  let prevRestingBlock = restingBlockIndex(getSession());

  // Restituisce il blocco da ridisegnare se la ripetizione rapida è partita, altrimenti null.
  const cancelRepeat = () => {
    if (!repeat) return null;
    clearTimeout(repeat.timeout);
    clearInterval(repeat.interval);
    const { blockIndex, fired } = repeat;
    repeat = null;
    return fired ? blockIndex : null;
  };
  const stopRepeat = () => {
    const blockIndex = cancelRepeat();
    if (blockIndex !== null) redrawBlock(blockIndex);
    return blockIndex !== null;
  };

  const tick = () => {
    const session = getSession();
    const now = new Date();

    // Rileva il passaggio da recupero attivo a nessun recupero (scaduto, "Salta", o chiuso da
    // un'altra modifica) e ridisegna il blocco che stava riposando, così la card si compatta.
    const currentRestingBlock = restingBlockIndex(session);
    if (session && prevRestingBlock !== null && prevRestingBlock !== currentRestingBlock) redrawBlock(prevRestingBlock);
    prevRestingBlock = currentRestingBlock;

    if (!session || restStatus(session, now) !== 'running') {
      restBar.hidden = true;
      return;
    }
    const remaining = restRemainingMs(session, now);
    restTime.textContent = formatDuration(Math.ceil(remaining / 1000));
    restBar.classList.toggle('is-ending', remaining <= ENDING_MS);
    restBar.hidden = false;
  };

  // Il primo passo avviene sul click, così uno scroll che parte da −/+ (pointercancel) non cambia il valore.
  // pointerdown arma solo la pressione prolungata.
  const onPointerDown = (event) => {
    const button = event.target.closest('[data-action="step"]');
    if (!button) return;
    cancelRepeat();
    suppressClick = false;
    const info = stepInfo(button);
    repeat = {
      blockIndex: blockIndexOf(button),
      fired: false,
      interval: null,
      timeout: setTimeout(() => {
        repeat.fired = true;
        applyStep(info);
        repeat.interval = setInterval(() => applyStep(info), REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS),
    };
  };

  // Dopo una pressione prolungata il click che segue il rilascio non deve aggiungere un passo.
  const onPointerUp = () => {
    if (stopRepeat()) suppressClick = true;
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    const now = new Date();

    if (action === 'step') {
      // Il click da tastiera (detail 0) non segue mai una pressione prolungata.
      const suppressed = suppressClick && event.detail !== 0;
      suppressClick = false;
      if (!suppressed) applyStep(stepInfo(target));
      return;
    }
    if (action === 'effort') {
      const { exerciseId, setIndex } = setTargetOf(target);
      const current = getSession().entries[exerciseId][setIndex].effort;
      const effort = current === target.dataset.effort ? null : target.dataset.effort;
      const blockIndex = blockIndexOf(target);
      const wasComplete = isBlockComplete(getSession(), blockIndex);

      ctx.commit(updateSet(ctx.getState(), exerciseId, setIndex, { effort }, now));

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
      const message = hasDoneSets(getSession())
        ? 'Terminare l\'allenamento? Non potrai più modificarlo.'
        : 'Nessuna serie fatta: la sessione verrà scartata. Continuare?';
      if (!window.confirm(message)) return;
      ctx.commit(finishSession(ctx.getState(), now));
      ctx.navigate('#/');
      return;
    }
    if (action === 'discard') {
      if (!window.confirm('Scartare la sessione? I dati inseriti andranno persi.')) return;
      ctx.commit(discardSession(ctx.getState()));
      ctx.navigate('#/');
    }
  };

  const onInput = (event) => {
    const input = event.target.closest('.stepper__input');
    if (!input) return;
    const { row, exerciseId, setIndex } = setTargetOf(input);
    ctx.commit(
      updateSet(ctx.getState(), exerciseId, setIndex, { [input.dataset.field]: parseNumberInput(input.value) }, new Date()),
    );
    refreshOutcome(row, exerciseId, setIndex);
    // Un peso/ripetizioni/durata toccati in un altro blocco possono chiudere un recupero altrove (C3).
    tick();
  };

  // Su blur mostra il valore normalizzato senza ridisegnare il blocco:
  // un redraw qui cancellerebbe il pulsante fatica appena toccato.
  const onChange = (event) => {
    const input = event.target.closest('.stepper__input');
    if (!input) return;
    const { exerciseId, setIndex } = setTargetOf(input);
    input.value = formatNumber(getSession().entries[exerciseId][setIndex][input.dataset.field]);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && event.target.matches('.stepper__input')) event.target.blur();
  };

  drawSound();
  tick();
  const timer = setInterval(tick, TICK_MS);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', stopRepeat);

  return () => {
    clearInterval(timer);
    cancelRepeat();
    pendingCollapse.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingCollapse.clear();
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', stopRepeat);
  };
};

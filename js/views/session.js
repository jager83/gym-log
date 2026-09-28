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

const blockHtml = (session, blockIndex, expanded, previousById) => {
  const block = session.blocks[blockIndex];
  const complete = block.exerciseIds.every((exerciseId) => session.entries[exerciseId].every(isDone));
  const superset = block.exerciseIds.length > 1;
  const names = block.exerciseIds.map((exerciseId) => escapeHtml(session.targets[exerciseId].name)).join(' + ');

  if (complete && !expanded.has(blockIndex)) {
    return `
      <article class="block block--done" data-block="${blockIndex}">
        <button type="button" class="block__summary" data-action="toggle-block" aria-expanded="false">
          <span>✓ ${names}</span><span class="muted">Mostra</span>
        </button>
      </article>`;
  }

  const header = block.exerciseIds
    .map((exerciseId) => {
      const target = session.targets[exerciseId];
      return `<h2 class="block__title">${escapeHtml(target.name)}</h2>
        <p class="block__target">${targetText(target)} · ${unitsText(target)}</p>`;
    })
    .join('');
  const order = interleaveSets(block, session.targets);
  const rows = order
    .map(({ exerciseId, setIndex }, index) => {
      const roundStart = superset && (index === 0 || order[index - 1].setIndex !== setIndex);
      return `${roundStart ? `<p class="round__label">Serie ${setIndex + 1}</p>` : ''}${setHtml(session, exerciseId, setIndex, previousById[exerciseId], superset)}`;
    })
    .join('');

  return `
    <article class="block" data-block="${blockIndex}">
      ${superset ? '<p class="block__tag">Superset</p>' : ''}
      ${header}
      ${complete ? '<button type="button" class="link" data-action="toggle-block" aria-expanded="true">Compatta</button>' : ''}
      <div class="block__sets">${rows}</div>
    </article>`;
};

const sessionHtml = (session, expanded, previousById) => `
  <section class="session">
    <header class="page-header">
      <a class="back" href="#/" aria-label="Torna alla home">‹</a>
      <h1>${escapeHtml(session.workoutName)}</h1>
    </header>
    <p class="legend">${EFFORTS.map((effort) => `<span>${faceSvg(effort)}${EFFORT_LABELS[effort]}</span>`).join('')}</p>
    <div class="blocks">${session.blocks.map((_, index) => blockHtml(session, index, expanded, previousById)).join('')}</div>
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
  const expanded = new Set();
  let repeat = null;
  let suppressClick = false;

  root.innerHTML = sessionHtml(initial, expanded, previousById);
  const restBar = root.querySelector('.rest-bar');
  const restTime = restBar.querySelector('.rest-bar__time');
  const soundButton = restBar.querySelector('[data-action="sound"]');

  const redrawBlock = (blockIndex) => {
    const element = root.querySelector(`.block[data-block="${blockIndex}"]`);
    if (element) element.outerHTML = blockHtml(getSession(), blockIndex, expanded, previousById);
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
  };

  const stepInfo = (button) => ({ ...setTargetOf(button), field: button.dataset.field, dir: Number(button.dataset.dir) });

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
      ctx.commit(updateSet(ctx.getState(), exerciseId, setIndex, { effort }, now));
      redrawBlock(blockIndex);
      tick();
      return;
    }
    if (action === 'toggle-block') {
      const blockIndex = blockIndexOf(target);
      if (expanded.has(blockIndex)) expanded.delete(blockIndex);
      else expanded.add(blockIndex);
      redrawBlock(blockIndex);
      return;
    }
    if (action === 'rest-start') {
      const session = getSession();
      const blockIndex = currentBlockIndex(session);
      ctx.commit(startRest(ctx.getState(), session.blocks[blockIndex].rest, now, blockIndex));
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
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onChange);
    root.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', stopRepeat);
  };
};

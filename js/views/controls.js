// Controlli condivisi tra la vista lista (session.js) e la vista focus (focus.js): stepper −/+,
// faccine (o "Fatto"), pulsante "i", testi del target, pressione prolungata, conferma "Termina".
import { countKey } from '../program.js';
import { setOutcome } from '../metrics.js';
import { DONE_EFFORT, EFFORTS, EFFORT_LABELS, finishSession, hasDoneSets, stepValue, updateSet } from '../session.js';
import { escapeHtml, formatDuration, formatNumber, formatRange, parseNumberInput } from '../format.js';
import { faceSvg } from './faces.js';

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 90;

export const FIELD_LABELS = {
  weight: 'peso',
  reps: 'ripetizioni',
  duration: 'durata',
  distance: 'distanza',
  level: 'livello',
  speed: 'velocità',
};

const DECIMAL_FIELDS = ['weight', 'distance', 'speed'];

const UNITS = {
  weight: 'kg × rip',
  bodyweight: 'zavorra kg × rip',
  time: 'secondi',
  cardio: 's · km · liv · km/h',
};

export const PHASE_LABELS = { riscaldamento: 'Riscaldamento', defaticamento: 'Defaticamento' };

// --- Testi del target -------------------------------------------------------------------------

const categoryOf = (target) => target.category ?? 'forza';

const isPerSide = (target) => target.sides === 2;

const durationRange = ({ min, max }) => (min === max ? formatDuration(min) : `${formatDuration(min)}-${formatDuration(max)}`);

// Riga della lista: "3 × 8-10 · kg × rip"; cardio "1 × 20:00-30:00" (o "1 serie" senza obiettivo).
export const targetText = (target) => {
  const range = target[countKey(target.type)];
  if (target.type === 'cardio') return range ? `${target.sets} × ${durationRange(range)}` : `${target.sets} serie`;
  return `${target.sets} × ${formatRange(range)}`;
};

export const unitsText = (target) => {
  const units = target.type === 'weight' && target.load === 'per-dumbbell' ? 'kg a manubrio × rip' : UNITS[target.type];
  return isPerSide(target) ? `${units} per lato` : units;
};

// Riga del focus: "Serie 2 di 3 · 8-10 rip", "Serie 1 di 2 · 30 s per lato", "Serie 1 di 1 · 25:00".
export const focusTargetText = (target, setIndex) => {
  const range = target[countKey(target.type)];
  const parts = [`Serie ${setIndex + 1} di ${target.sets}`];
  if (target.type === 'cardio') {
    if (range) parts.push(durationRange(range));
  } else {
    parts.push(`${formatRange(range)} ${target.type === 'time' ? 's' : 'rip'}${isPerSide(target) ? ' per lato' : ''}`);
  }
  return parts.join(' · ');
};

export const hasExerciseTexts = (target) =>
  Boolean(target.description) || Boolean(target.steps?.length) || Boolean(target.tips?.length);

// --- HTML dei controlli -----------------------------------------------------------------------

export const outcomeClass = (outcome) => (outcome === 'fallita' || outcome === 'carico-basso' ? `is-${outcome}` : '');

// Cardio: obiettivo facoltativo e nessun esito fallita/carico basso.
export const outcomeOf = (set, target) =>
  target.type === 'cardio' ? null : setOutcome(set, target.type, target[countKey(target.type)]);

export const stepperHtml = (field, value, outcome, name, setNumber, fieldLabel = FIELD_LABELS[field]) => {
  const label = `${fieldLabel} ${name} serie ${setNumber}`;
  return `
    <div class="stepper">
      <button type="button" class="stepper__btn" data-action="step" data-field="${field}" data-dir="-1" aria-label="Diminuisci ${label}">−</button>
      <input class="stepper__input ${outcomeClass(outcome)}" type="text" inputmode="${DECIMAL_FIELDS.includes(field) ? 'decimal' : 'numeric'}"
        autocomplete="off" value="${formatNumber(value)}" data-field="${field}" aria-label="${label}">
      <button type="button" class="stepper__btn" data-action="step" data-field="${field}" data-dir="1" aria-label="Aumenta ${label}">+</button>
    </div>`;
};

// Campi di una serie, nell'ordine mostrato: [campo, etichetta accessibile].
export const setFields = (target) => {
  if (target.type === 'time') return [['duration', FIELD_LABELS.duration]];
  if (target.type === 'cardio') return ['duration', 'distance', 'level', 'speed'].map((field) => [field, FIELD_LABELS[field]]);
  const weightLabel = target.load === 'per-dumbbell' ? 'peso a manubrio' : FIELD_LABELS.weight;
  return [['weight', weightLabel], ['reps', FIELD_LABELS.reps]];
};

// `name` già escapato. L'esito (colore del numero) vale solo per il campo di conteggio.
export const fieldsHtml = (target, set, name, setNumber, fields = setFields(target)) => {
  const key = countKey(target.type);
  const outcome = outcomeOf(set, target);
  return fields
    .map(([field, label]) => stepperHtml(field, set[field], field === key ? outcome : null, name, setNumber, label))
    .join('');
};

// Faccine per forza e cardio, un solo "Fatto" per stretching/mobilità. `name` già escapato.
export const effortsHtml = (target, set, name, setNumber) => {
  if (categoryOf(target) !== 'forza') {
    const done = set.effort === DONE_EFFORT;
    return `
      <div class="efforts">
        <button type="button" class="done-toggle" data-action="effort" data-effort="${DONE_EFFORT}"
          aria-pressed="${done}" aria-label="Fatto ${name} serie ${setNumber}">${done ? '✓ ' : ''}Fatto</button>
      </div>`;
  }
  return `
    <div class="efforts" role="group" aria-label="Fatica ${name} serie ${setNumber}">
      ${EFFORTS.map(
        (effort) => `<button type="button" class="effort effort--${effort}" data-action="effort" data-effort="${effort}"
          aria-pressed="${set.effort === effort}" aria-label="${EFFORT_LABELS[effort]}">${faceSvg(effort)}</button>`,
      ).join('')}
    </div>`;
};

export const infoButtonHtml = (exerciseId, target) =>
  hasExerciseTexts(target)
    ? `<button type="button" class="info-button" data-action="info" data-exercise="${escapeHtml(exerciseId)}"
        aria-label="Scheda esercizio ${escapeHtml(target.name)}">i</button>`
    : '';

// --- Comportamento dei controlli --------------------------------------------------------------

// La riga (lista) o la scheda (focus) di una serie: l'elemento con data-exercise e data-set.
export const setTargetOf = (element) => {
  const row = element.closest('[data-set]');
  return { row, exerciseId: row.dataset.exercise, setIndex: Number(row.dataset.set) };
};

export const refreshOutcome = (row, session, exerciseId, setIndex) => {
  const target = session.targets[exerciseId];
  const input = row.querySelector(`.stepper__input[data-field="${countKey(target.type)}"]`);
  if (!input) return;
  input.classList.remove('is-fallita', 'is-carico-basso');
  const className = outcomeClass(outcomeOf(session.entries[exerciseId][setIndex], target));
  if (className) input.classList.add(className);
};

const currentValue = (ctx, exerciseId, setIndex, field) => ctx.getState().activeSession.entries[exerciseId][setIndex][field];

// Un passo −/+ su un campo: salva e aggiorna il numero sul posto, senza ridisegnare.
export const stepSet = (ctx, { row, exerciseId, setIndex, field, dir }) => {
  const current = currentValue(ctx, exerciseId, setIndex, field);
  ctx.commit(updateSet(ctx.getState(), exerciseId, setIndex, { [field]: stepValue(field, current, dir) }, new Date()));
  row.querySelector(`.stepper__input[data-field="${field}"]`).value = formatNumber(currentValue(ctx, exerciseId, setIndex, field));
  refreshOutcome(row, ctx.getState().activeSession, exerciseId, setIndex);
};

export const commitInput = (ctx, input) => {
  const { row, exerciseId, setIndex } = setTargetOf(input);
  ctx.commit(
    updateSet(ctx.getState(), exerciseId, setIndex, { [input.dataset.field]: parseNumberInput(input.value) }, new Date()),
  );
  refreshOutcome(row, ctx.getState().activeSession, exerciseId, setIndex);
};

// Su blur mostra il valore normalizzato senza ridisegnare.
export const normalizeInput = (ctx, input) => {
  const { exerciseId, setIndex } = setTargetOf(input);
  input.value = formatNumber(currentValue(ctx, exerciseId, setIndex, input.dataset.field));
};

// Pressione prolungata su −/+. Il primo passo avviene sul click, così uno scroll che parte da −/+
// (pointercancel) non cambia il valore; pointerdown arma solo la ripetizione. `onRepeatEnd(info)`
// viene chiamata quando una ripetizione partita finisce (rilascio o annullamento del puntatore).
export const createStepRepeat = ({ stepInfo, applyStep, onRepeatEnd = () => {} }) => {
  let repeat = null;
  let suppressClick = false;

  // Restituisce le info della ripetizione se era partita, altrimenti null.
  const cancel = () => {
    if (!repeat) return null;
    clearTimeout(repeat.timeout);
    clearInterval(repeat.interval);
    const { info, fired } = repeat;
    repeat = null;
    return fired ? info : null;
  };

  const stop = () => {
    const info = cancel();
    if (info) onRepeatEnd(info);
    return info !== null;
  };

  const onPointerDown = (event) => {
    const button = event.target.closest('[data-action="step"]');
    if (!button) return;
    cancel();
    suppressClick = false;
    const info = stepInfo(button);
    repeat = {
      info,
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
    if (stop()) suppressClick = true;
  };

  const onPointerCancel = () => {
    stop();
  };

  // Vero se il click su −/+ deve applicare un passo. Il click da tastiera (detail 0) non segue
  // mai una pressione prolungata.
  const takeClick = (event) => {
    const suppressed = suppressClick && event.detail !== 0;
    suppressClick = false;
    return !suppressed;
  };

  const attach = (root) => {
    root.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      cancel();
      root.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  };

  return { attach, cancel, takeClick };
};

// "Termina": chiede sempre conferma; senza serie fatte la sessione viene scartata.
export const confirmFinish = (ctx, now) => {
  const message = hasDoneSets(ctx.getState().activeSession)
    ? 'Terminare l\'allenamento? Non potrai più modificarlo.'
    : 'Nessuna serie fatta: la sessione verrà scartata. Continuare?';
  if (!window.confirm(message)) return;
  ctx.commit(finishSession(ctx.getState(), now));
  ctx.navigate('#/');
};

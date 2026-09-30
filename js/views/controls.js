// Controlli condivisi tra la vista lista (session.js) e la vista focus (focus.js): stepper −/+,
// faccine (o "Fatto"), pulsante "i", testi del target, pressione prolungata, conferma "Termina".
import { countKey } from '../program.js';
import { isDone, setOutcome } from '../metrics.js';
import { DONE_EFFORT, EFFORTS, EFFORT_LABELS, finishSession, hasDoneSets, stepValue, updateSet } from '../session.js';
import { escapeHtml, formatDuration, formatNumber, formatRange, parseNumberInput } from '../format.js';
import { faceSvg } from './faces.js';
import { confirmDialog } from './modal.js';

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

// La distanza si salva a 2 decimali (clampValue), gli altri campi al massimo a 1.
export const formatFieldValue = (field, value) => formatNumber(value, field === 'distance' ? 2 : 1);

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

const durationRange = (range) => {
  if (range.max === null) return formatRange(range);
  return range.min === range.max ? formatDuration(range.min) : `${formatDuration(range.min)}-${formatDuration(range.max)}`;
};

// Riga della lista: "3 × 8-10 · kg × rip"; cardio "1 × 20:00-30:00" (o "1 serie" senza obiettivo).
export const targetText = (target) => {
  const range = target[countKey(target.type)];
  if (target.type === 'cardio') return range ? `${target.sets} × ${durationRange(range)}` : `${target.sets} serie`;
  return `${target.sets} × ${formatRange(range)}`;
};

// Stretching/mobilità a ripetizioni: a corpo libero, senza zavorra.
const isUnloadedBodyweight = (target) => target.type === 'bodyweight' && categoryOf(target) !== 'forza';

const baseUnits = (target) => {
  if (target.type === 'weight' && target.assisted) return 'assistenza kg × rip';
  if (target.type === 'weight' && target.load === 'per-dumbbell') return 'kg a manubrio × rip';
  if (isUnloadedBodyweight(target)) return 'rip';
  return UNITS[target.type];
};

export const unitsText = (target) => {
  const units = baseUnits(target);
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
        autocomplete="off" value="${formatFieldValue(field, value)}" data-field="${field}" aria-label="${label}">
      <button type="button" class="stepper__btn" data-action="step" data-field="${field}" data-dir="1" aria-label="Aumenta ${label}">+</button>
    </div>`;
};

const weightLabelOf = (target) => {
  if (target.assisted) return 'assistenza';
  return target.load === 'per-dumbbell' ? 'peso a manubrio' : FIELD_LABELS.weight;
};

// Campi di una serie, nell'ordine mostrato: [campo, etichetta accessibile].
export const setFields = (target) => {
  if (target.type === 'time') return [['duration', FIELD_LABELS.duration]];
  if (target.type === 'cardio') return ['duration', 'distance', 'level', 'speed'].map((field) => [field, FIELD_LABELS[field]]);
  if (isUnloadedBodyweight(target)) return [['reps', FIELD_LABELS.reps]];
  return [['weight', weightLabelOf(target)], ['reps', FIELD_LABELS.reps]];
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

// Il peso cambiato segue sulle serie successive (updateSet): aggiorna sul posto i loro campi visibili,
// tranne quello in cui si sta scrivendo.
const refreshFollowingWeights = (ctx, exerciseId, setIndex) => {
  const sets = ctx.getState().activeSession.entries[exerciseId];
  document.querySelectorAll(`[data-exercise="${CSS.escape(exerciseId)}"][data-set]`).forEach((row) => {
    const index = Number(row.dataset.set);
    const input = row.querySelector('.stepper__input[data-field="weight"]');
    if (index <= setIndex || !input || input === document.activeElement) return;
    input.value = formatFieldValue('weight', sets[index].weight);
  });
};

const currentValue = (ctx, exerciseId, setIndex, field) => ctx.getState().activeSession.entries[exerciseId][setIndex][field];

// Salva un valore su un campo e aggiorna sul posto il numero (se la serie è in vista), l'esito e
// i pesi che seguono, senza ridisegnare.
const setField = (ctx, { row, exerciseId, setIndex, field, value }) => {
  ctx.commit(updateSet(ctx.getState(), exerciseId, setIndex, { [field]: value }, new Date()));
  const input = row?.querySelector(`.stepper__input[data-field="${field}"]`);
  if (input) input.value = formatFieldValue(field, currentValue(ctx, exerciseId, setIndex, field));
  if (row) refreshOutcome(row, ctx.getState().activeSession, exerciseId, setIndex);
  if (field === 'weight') refreshFollowingWeights(ctx, exerciseId, setIndex);
};

// Un passo −/+ su un campo: salva e aggiorna il numero sul posto, senza ridisegnare.
export const stepSet = (ctx, { row, exerciseId, setIndex, field, dir }) => {
  const current = currentValue(ctx, exerciseId, setIndex, field);
  setField(ctx, { row, exerciseId, setIndex, field, value: stepValue(field, current, dir) });
};

// --- Suggerimento di carico (advice.js) -------------------------------------------------------

// Riga del suggerimento, solo finché la serie 1 non è fatta e il peso suggerito non è già impostato.
export const adviceHtml = (advice, exerciseId, firstSet) => {
  if (!advice || isDone(firstSet)) return '';
  const usable = advice.kind === 'up';
  if (usable && firstSet.weight === advice.value) return '';
  const button = usable
    ? `<button type="button" class="button advice__use" data-action="use-advice" data-exercise="${escapeHtml(exerciseId)}"
        data-value="${advice.value}" aria-label="Usa il peso suggerito ${formatNumber(advice.value)} kg">Usa</button>`
    : '';
  return `<div class="advice"><p class="advice__text">${escapeHtml(advice.text)}</p>${button}</div>`;
};

// "Usa": imposta il peso suggerito sulla serie 1 (le successive non fatte seguono) e toglie la riga.
export const applyAdvice = (ctx, button) => {
  const { exercise: exerciseId, value } = button.dataset;
  const row = document.querySelector(`[data-exercise="${CSS.escape(exerciseId)}"][data-set="0"]`);
  setField(ctx, { row, exerciseId, setIndex: 0, field: 'weight', value: Number(value) });
  button.closest('.advice').remove();
};

export const commitInput = (ctx, input) => {
  const { row, exerciseId, setIndex } = setTargetOf(input);
  ctx.commit(
    updateSet(ctx.getState(), exerciseId, setIndex, { [input.dataset.field]: parseNumberInput(input.value) }, new Date()),
  );
  refreshOutcome(row, ctx.getState().activeSession, exerciseId, setIndex);
  if (input.dataset.field === 'weight') refreshFollowingWeights(ctx, exerciseId, setIndex);
};

// Su blur mostra il valore normalizzato senza ridisegnare.
export const normalizeInput = (ctx, input) => {
  const { exerciseId, setIndex } = setTargetOf(input);
  const { field } = input.dataset;
  input.value = formatFieldValue(field, currentValue(ctx, exerciseId, setIndex, field));
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
export const confirmFinish = async (ctx, now) => {
  const message = hasDoneSets(ctx.getState().activeSession)
    ? 'Terminare l\'allenamento? Non potrai più modificarlo.'
    : 'Nessuna serie fatta: la sessione verrà scartata. Continuare?';
  const confirmed = await confirmDialog({ title: 'Termina allenamento', message, confirmLabel: 'Termina' });
  if (!confirmed || !ctx.getState().activeSession) return;
  ctx.commit(finishSession(ctx.getState(), now));
  ctx.navigate('#/');
};

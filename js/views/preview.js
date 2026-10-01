// Anteprima di un allenamento prima di "Inizia": stessa lista di blocchi della sessione attiva
// (fasi, nomi, target, "i"), ma sola lettura, senza creare una sessione. La sessione si crea solo
// al tap su "Inizia" (eventualmente scartando quella attiva, con la stessa conferma della home).
import { discardSession, startSession } from '../session.js';
import { escapeHtml } from '../format.js';
import { chevronLeftSvg } from './icons.js';
import { alertDialog } from './modal.js';
import { blockTagsHtml, exerciseHeaderHtml } from './session.js';
import { confirmSwitchWorkout } from './workout-switch.js';

// Sessione "usa e getta" per l'anteprima: nessuna sessione attiva viene toccata o creata, si
// riusa solo la logica di startSession per calcolare blocchi/target/serie di default.
export const previewSessionOf = (program, state, workoutId, now = new Date()) =>
  startSession(program, { ...state, activeSession: null }, workoutId, now).activeSession;

const blockPreviewHtml = (session, blockIndex) => {
  const block = session.blocks[blockIndex];
  const superset = block.exerciseIds.length > 1;
  return `
    <article class="block">
      ${blockTagsHtml(block, superset)}
      ${exerciseHeaderHtml(session, blockIndex, {}, false)}
    </article>`;
};

const previewHtml = (workout, session) => `
  <section class="session">
    <header class="page-header">
      <a class="back" href="#/" aria-label="Indietro">${chevronLeftSvg()}</a>
      <h1>${escapeHtml(workout.name)}</h1>
    </header>
    <button type="button" class="button button--primary session__start" data-action="begin">Inizia</button>
    <div class="blocks">${session.blocks.map((_, index) => blockPreviewHtml(session, index)).join('')}</div>
  </section>`;

export const renderPreview = (root, ctx, workoutId) => {
  const workout = ctx.program.workouts.find((item) => item.id === workoutId);
  if (!workout) {
    ctx.navigate('#/');
    return () => {};
  }

  root.innerHTML = previewHtml(workout, previewSessionOf(ctx.program, ctx.getState(), workoutId));

  const commitStart = () => {
    const button = root.querySelector('[data-action="begin"]');
    if (button) button.disabled = true;
    try {
      ctx.commit(startSession(ctx.program, ctx.getState(), workoutId, new Date()));
      ctx.navigate('#/focus');
    } catch (error) {
      if (button) button.disabled = false;
      alertDialog({ title: 'Errore', message: error.message });
    }
  };

  const onClick = async (event) => {
    const target = event.target.closest('[data-action="begin"]');
    if (!target) return;
    const active = ctx.getState().activeSession;
    if (!active) {
      commitStart();
      return;
    }
    if (active.workoutId === workoutId) {
      ctx.navigate('#/focus');
      return;
    }
    const confirmed = await confirmSwitchWorkout(workout.name, active);
    if (!confirmed) return;
    ctx.commit(discardSession(ctx.getState()));
    commitStart();
  };

  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
};

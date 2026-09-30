import { discardSession, lastDoneByWorkout, nextWorkoutId, setBodyWeight } from '../session.js';
import { exportState, importState, isBackupDue } from '../store.js';
import { escapeHtml, formatDay, formatNumber, formatTime, parseNumberInput } from '../format.js';
import { downloadText } from '../device.js';
import { alertDialog, confirmDialog } from './modal.js';
import { discardMessage } from './workout-switch.js';

const bodyWeightSummary = (bodyWeight) =>
  bodyWeight === null ? 'Peso corporeo: non impostato' : `Peso corporeo: ${formatNumber(bodyWeight)} kg`;

const homeHtml = (program, state, backupDue) => {
  const active = state.activeSession;
  const lastDates = lastDoneByWorkout(state.sessions);
  const lastLabel = (workoutId) => (lastDates[workoutId] ? `ultima volta: ${formatDay(lastDates[workoutId])}` : 'mai fatto');
  const nextId = nextWorkoutId(program, state.sessions);

  const heroHtml = active
    ? `
      <button type="button" class="hero" data-action="resume" data-workout="${escapeHtml(active.workoutId)}">
        <span class="hero__kicker">Riprendi</span>
        <span class="hero__title">${escapeHtml(active.workoutName)}</span>
        <span class="hero__meta">iniziato alle ${formatTime(active.startedAt)}</span>
        <span class="hero__play" aria-hidden="true">▶</span>
      </button>
      <button type="button" class="link home__discard" data-action="discard-active">Scarta allenamento</button>`
    : '';

  return `
    <section class="home">
      ${heroHtml}
      <ul class="workout-list">
        ${program.workouts
          .map((workout) => {
            const isNext = !active && workout.id === nextId;
            return `
          <li>
            <button type="button" class="workout-card${isNext ? ' workout-card--next' : ''}" data-action="start"
              data-workout="${escapeHtml(workout.id)}">
              ${isNext ? '<span class="workout-card__kicker">Prossimo</span>' : ''}
              <span class="workout-card__name">${escapeHtml(workout.name)}</span>
              <span class="workout-card__meta muted">${lastLabel(workout.id)}</span>
            </button>
          </li>`;
          })
          .join('')}
      </ul>
      <nav class="home__links" aria-label="Altre funzioni">
        <a href="#/history">Storico</a>
        <details class="backup">
          <summary class="backup__summary">Backup${backupDue ? '<span class="dot" role="img" aria-label="backup consigliato"></span>' : ''}</summary>
          <p class="muted">Ultimo export: ${state.lastExportAt ? formatDay(state.lastExportAt) : 'mai'}</p>
          <div class="backup__actions">
            <button type="button" class="button" data-action="export">Esporta</button>
            <label class="button">Importa<input type="file" accept="application/json,.json" data-action="import" class="visually-hidden"></label>
          </div>
        </details>
        <details class="body-weight">
          <summary class="body-weight__summary">${escapeHtml(bodyWeightSummary(state.settings.bodyWeight))}</summary>
          <div class="body-weight__actions">
            <input type="text" inputmode="decimal" autocomplete="off" class="body-weight__input"
              value="${state.settings.bodyWeight === null ? '' : formatNumber(state.settings.bodyWeight)}"
              aria-label="Peso corporeo in kg">
            <button type="button" class="button" data-action="save-body-weight">Salva</button>
          </div>
        </details>
      </nav>
    </section>`;
};

export const renderHome = (root, ctx) => {
  const draw = () => {
    const state = ctx.getState();
    root.innerHTML = homeHtml(ctx.program, state, isBackupDue(state, new Date()) || ctx.persistDenied);
  };

  const confirmDiscardActive = async () => {
    const active = ctx.getState().activeSession;
    if (!active) return;
    const confirmed = await confirmDialog({
      title: 'Scartare l\'allenamento in corso?',
      message: discardMessage(active),
      confirmLabel: 'Scarta',
      danger: true,
    });
    if (!confirmed) return;
    ctx.commit(discardSession(ctx.getState()));
    draw();
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, workout } = target.dataset;
    if (action === 'resume') {
      ctx.navigate('#/focus');
      return;
    }
    if (action === 'discard-active') {
      confirmDiscardActive();
      return;
    }
    if (action === 'start') {
      const active = ctx.getState().activeSession;
      if (active && active.workoutId === workout) {
        ctx.navigate('#/focus');
        return;
      }
      ctx.navigate(`#/workout/${encodeURIComponent(workout)}`);
      return;
    }
    if (action === 'export') {
      const { filename, json, state } = exportState(ctx.getState(), new Date());
      downloadText(filename, json);
      ctx.commit(state);
      draw();
      return;
    }
    if (action === 'save-body-weight') {
      const input = root.querySelector('.body-weight__input');
      ctx.commit(setBodyWeight(ctx.getState(), parseNumberInput(input.value)));
      draw();
      ctx.notify('Peso corporeo salvato');
    }
  };

  const onChange = async (event) => {
    const input = event.target;
    if (input.dataset.action !== 'import' || !input.files[0]) return;
    try {
      const imported = importState(await input.files[0].text());
      const confirmed = await confirmDialog({ title: 'Importa backup', message: 'Sostituire tutti i dati attuali con il backup?' });
      if (!confirmed) return;
      ctx.commit(imported);
      draw();
      ctx.notify('Backup importato');
    } catch (error) {
      alertDialog({ title: 'Errore', message: error.message });
    } finally {
      input.value = '';
    }
  };

  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
};

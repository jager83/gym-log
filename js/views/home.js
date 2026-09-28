import { findWorkout } from '../program.js';
import { lastDoneByWorkout, nextWorkoutId, setBodyWeight, startSession } from '../session.js';
import { exportState, importState, isBackupDue } from '../store.js';
import { escapeHtml, formatDay, formatNumber, formatTime, parseNumberInput } from '../format.js';
import { downloadText } from '../device.js';

const bodyWeightSummary = (bodyWeight) =>
  bodyWeight === null ? 'Peso corporeo: non impostato' : `Peso corporeo: ${formatNumber(bodyWeight)} kg`;

const homeHtml = (program, state, backupDue) => {
  const active = state.activeSession;
  const lastDates = lastDoneByWorkout(state.sessions);
  const lastLabel = (workoutId) => (lastDates[workoutId] ? formatDay(lastDates[workoutId]) : 'mai fatto');
  const mainId = active ? active.workoutId : nextWorkoutId(program, state.sessions);
  const mainName = active ? active.workoutName : findWorkout(program, mainId).name;
  const others = program.workouts.filter((workout) => workout.id !== mainId);

  return `
    <section class="home">
      <button type="button" class="hero" data-action="${active ? 'resume' : 'start'}" data-workout="${escapeHtml(mainId)}">
        <span class="hero__kicker">${active ? 'Riprendi' : 'Prossimo'}</span>
        <span class="hero__title">${escapeHtml(mainName)}</span>
        <span class="hero__meta">${active ? `iniziato alle ${formatTime(active.startedAt)}` : `ultima volta: ${lastLabel(mainId)}`}</span>
        <span class="hero__play" aria-hidden="true">▶</span>
      </button>
      <ul class="workout-list">
        ${others
          .map(
            (workout) => `
          <li>
            <button type="button" class="workout-item" data-action="start" data-workout="${escapeHtml(workout.id)}" ${active ? 'disabled' : ''}>
              <span>${escapeHtml(workout.name)}</span>
              <span class="muted">${lastLabel(workout.id)}</span>
            </button>
          </li>`,
          )
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

  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, workout } = target.dataset;
    if (action === 'resume') {
      ctx.navigate('#/session');
      return;
    }
    if (action === 'start') {
      if (ctx.getState().activeSession) {
        ctx.navigate('#/session');
        return;
      }
      const buttons = root.querySelectorAll('[data-action="start"], [data-action="resume"]');
      buttons.forEach((button) => { button.disabled = true; });
      try {
        ctx.commit(startSession(ctx.program, ctx.getState(), workout, new Date()));
        ctx.navigate('#/session');
      } catch (error) {
        buttons.forEach((button) => { button.disabled = false; });
        ctx.notify(error.message);
      }
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
      if (!window.confirm('Sostituire tutti i dati attuali con il backup?')) return;
      ctx.commit(imported);
      draw();
      ctx.notify('Backup importato');
    } catch (error) {
      ctx.notify(error.message);
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

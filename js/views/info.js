// Scheda esercizio (spec §6): <dialog> modale con nome, descrizione, esecuzione (lista numerata) e
// consigli (lista puntata). Si chiude con "Chiudi", Esc (cancel nativo) e tap sullo sfondo.
import { escapeHtml } from '../format.js';
import { hasExerciseTexts } from './controls.js';

const listHtml = (tag, title, items) =>
  items?.length
    ? `<h3 class="info__heading">${title}</h3>
      <${tag} class="info__list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`
    : '';

const infoHtml = (target) => `
  <div class="info__body">
    <h2 class="info__title" tabindex="-1">${escapeHtml(target.name)}</h2>
    ${target.description ? `<p class="info__text">${escapeHtml(target.description)}</p>` : ''}
    ${listHtml('ol', 'Esecuzione', target.steps)}
    ${listHtml('ul', 'Consigli', target.tips)}
    <button type="button" class="button info__close" data-action="close-info">Chiudi</button>
  </div>`;

// Apre la scheda e restituisce la funzione che la chiude (per il cleanup della vista), o null se
// l'esercizio non ha testi.
export const openExerciseInfo = (target) => {
  if (!hasExerciseTexts(target)) return null;
  const dialog = document.createElement('dialog');
  dialog.className = 'info';
  dialog.setAttribute('aria-label', `Scheda esercizio ${target.name}`);
  dialog.innerHTML = infoHtml(target);

  // Il tap sullo sfondo arriva al <dialog> stesso: il contenuto è tutto dentro .info__body.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-action="close-info"]')) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());

  document.body.append(dialog);
  dialog.showModal();
  // Il focus va sul titolo, non su "Chiudi" in fondo: con testi lunghi la scheda parte dall'inizio.
  dialog.querySelector('.info__title').focus();
  return () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };
};

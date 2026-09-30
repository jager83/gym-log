// Modale unica al posto di window.confirm/alert: <dialog> con showModal, stesso modello della
// scheda esercizio (info.js). Esc (cancel nativo) e tap sullo sfondo valgono "Annulla"; il focus
// parte dal titolo e torna all'elemento attivo prima dell'apertura; il <dialog> si rimuove alla
// chiusura.
import { escapeHtml } from '../format.js';

const buttonHtml = (value, label, className) =>
  `<button type="button" class="button ${className}" data-modal="${value}">${escapeHtml(label)}</button>`;

const modalHtml = (title, message, buttons) => `
  <div class="info__body modal__body">
    <h2 class="info__title modal__title" tabindex="-1">${escapeHtml(title)}</h2>
    <p class="modal__message">${escapeHtml(message)}</p>
    <div class="modal__actions">${buttons}</div>
  </div>`;

// Risolve true solo con il pulsante data-modal="confirm"; ogni altra chiusura risolve false.
const openModal = (title, message, buttons) =>
  new Promise((resolve) => {
    const opener = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'info modal';
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = modalHtml(title, message, buttons);
    let confirmed = false;

    // Il tap sullo sfondo arriva al <dialog> stesso: il contenuto è tutto dentro .modal__body.
    dialog.addEventListener('click', (event) => {
      const button = event.target.closest('[data-modal]');
      if (event.target !== dialog && !button) return;
      confirmed = button?.dataset.modal === 'confirm';
      dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
      resolve(confirmed);
    });

    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('.modal__title').focus();
  });

export const confirmDialog = ({ title, message, confirmLabel = 'Conferma', cancelLabel = 'Annulla', danger = false }) =>
  openModal(
    title,
    message,
    buttonHtml('cancel', cancelLabel, '') + buttonHtml('confirm', confirmLabel, danger ? 'button--danger' : 'button--primary'),
  );

export const alertDialog = ({ title, message, okLabel = 'Ok' }) =>
  openModal(title, message, buttonHtml('confirm', okLabel, 'button--primary')).then(() => undefined);

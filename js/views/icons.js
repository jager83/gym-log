// Icone vettoriali in linea: stesso stile inline-SVG di faces.js, ma per i controlli (suono,
// scheda esercizio, eliminazione) invece che per la fatica. Tratto a 2px, nessun riempimento,
// currentColor così seguono il colore del testo/pulsante che le contiene.
const iconSvg = (className, content) =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  `${content}</svg>`;

const BELL_PATH =
  '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>' +
  '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>';

// `on` false: stessa campana, con una riga diagonale (muto).
export const bellSvg = (on) =>
  iconSvg('icon--bell', on ? BELL_PATH : `${BELL_PATH}<line x1="3" y1="3" x2="21" y2="21"/>`);

export const infoSvg = () =>
  iconSvg(
    'icon--info',
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/>' +
      '<circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>',
  );

export const trashSvg = () =>
  iconSvg(
    'icon--trash',
    '<path d="M4 7h16"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>' +
      '<path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>' +
      '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  );

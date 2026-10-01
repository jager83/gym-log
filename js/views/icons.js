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

export const chevronLeftSvg = () => iconSvg('icon--chevron-left', '<polyline points="15 6 9 12 15 18"/>');

export const chevronRightSvg = () => iconSvg('icon--chevron-right', '<polyline points="9 6 15 12 9 18"/>');

// Triangolo pieno: fill="currentColor" sul path, niente stroke (coerente con lo stile a tratto
// delle altre icone, ma qui serve un'area piena per leggersi a piccola taglia).
export const playSvg = () =>
  iconSvg('icon--play', '<path d="M7 4l13 8-13 8V4z" fill="currentColor" stroke="none"/>');

export const minusSvg = () => iconSvg('icon--minus', '<line x1="5" y1="12" x2="19" y2="12"/>');

export const plusSvg = () =>
  iconSvg('icon--plus', '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');

export const checkSvg = () => iconSvg('icon--check', '<polyline points="20 6 9 17 4 12"/>');

// Icone di riga (stile Renpho): una per tipo di esercizio e una per metrica del riepilogo.
// Classe comune icon--row per colore e misura.
const rowIconSvg = (name, content) => iconSvg(`icon--row icon--${name}`, content);

const EXERCISE_TYPE_ICONS = {
  weight: () =>
    rowIconSvg(
      'dumbbell',
      '<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M3.5 9v6"/><path d="M20.5 9v6"/><line x1="6.5" y1="12" x2="17.5" y2="12"/>',
    ),
  bodyweight: () =>
    rowIconSvg('person', '<circle cx="12" cy="5" r="2"/><path d="M5 10l7 1 7-1"/><path d="M12 11v4l-3 6"/><path d="M12 15l3 6"/>'),
  time: () =>
    rowIconSvg('stopwatch', '<circle cx="12" cy="14" r="7"/><polyline points="12 10 12 14 14.5 15.5"/><line x1="10" y1="3" x2="14" y2="3"/>'),
  cardio: () =>
    rowIconSvg(
      'heart',
      '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><polyline points="7 12 10 12 11.5 9.5 13 14 14.5 12 17 12"/>',
    ),
};

// Tipo sconosciuto: icona del peso (il tipo di default della scheda).
export const exerciseTypeSvg = (type) => (EXERCISE_TYPE_ICONS[type] ?? EXERCISE_TYPE_ICONS.weight)();

export const calendarSvg = () =>
  rowIconSvg(
    'calendar',
    '<rect x="4" y="5" width="16" height="15" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="9" y1="3" x2="9" y2="7"/><line x1="15" y1="3" x2="15" y2="7"/>',
  );

export const repeatSvg = () =>
  rowIconSvg(
    'repeat',
    '<path d="M4 11V9a3 3 0 0 1 3-3h12"/><polyline points="16 3 19 6 16 9"/><path d="M20 13v2a3 3 0 0 1-3 3H5"/><polyline points="8 21 5 18 8 15"/>',
  );

export const kettlebellSvg = () =>
  rowIconSvg('kettlebell', '<path d="M9 8a3 3 0 0 1 6 0"/><path d="M8.5 9.5h7a6 6 0 1 1-7 0z"/>');

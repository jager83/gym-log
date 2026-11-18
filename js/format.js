// Un formattatore it-IT per numero massimo di decimali, creato alla prima richiesta.
const numberFormats = new Map();
const numberFormatOf = (digits) => {
  if (!numberFormats.has(digits)) {
    numberFormats.set(digits, new Intl.NumberFormat('it-IT', { maximumFractionDigits: digits, useGrouping: false }));
  }
  return numberFormats.get(digits);
};
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric' });
const dateFormat = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);

export const formatNumber = (value, digits = 1) =>
  value === null || value === undefined ? '' : numberFormatOf(digits).format(value);

export const parseNumberInput = (text) => {
  const normalized = String(text).trim().replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

export const formatDuration = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// Durata cardio digitata in minuti: "5:30" (m:ss), "5,5"/"5.5" o "5" (minuti decimali). Restituisce
// i secondi arrotondati, o null se non interpretabile.
export const parseDurationMinutesInput = (text) => {
  const trimmed = String(text).trim();
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
  const minutes = parseNumberInput(trimmed);
  return minutes === null ? null : Math.round(minutes * 60);
};

// Durata trascorsa arrotondata al minuto per difetto: "52 min", "1 h 05 min".
export const formatElapsed = (seconds) => {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
};

// max null: esercizio "MAX" (quante più ripetizioni o secondi possibili).
export const formatRange = ({ min, max }) => {
  if (max === null) return 'MAX';
  return min === max ? `${min}` : `${min}-${max}`;
};

// Parti del riepilogo cardio per macchina; 'legacy': serie salvate prima della scelta macchina.
const durationPart = ['duration', (value) => formatDuration(value)];
const distancePart = ['distance', (value) => `${formatNumber(value, 2)} km`];
const speedPart = ['speed', (value) => `${formatNumber(value)} km/h`];
const CARDIO_PARTS = {
  camminata: [durationPart, distancePart, speedPart, ['incline', (value) => `${formatNumber(value)}%`]],
  cyclette: [durationPart, ['power', (value) => `${value} W`], ['cadence', (value) => `${value} rpm`]],
  legacy: [durationPart, distancePart, ['level', (value) => `liv ${value}`], speedPart],
};

export const formatSet = (set, type) => {
  if (type === 'cardio') {
    return CARDIO_PARTS[set.machine ?? 'legacy']
      .filter(([field]) => set[field] !== undefined && set[field] !== null)
      .map(([field, format]) => format(set[field]))
      .join(' · ');
  }
  if (type === 'time') return formatDuration(set.duration ?? 0);
  const reps = set.reps ?? '–';
  if (type === 'bodyweight') return set.weight ? `+${formatNumber(set.weight)}×${reps}` : `${reps}`;
  const weight = set.weight === null || set.weight === undefined ? '–' : formatNumber(set.weight);
  return `${weight}×${reps}`;
};

export const formatDay = (iso) => dayFormat.format(new Date(iso));

export const formatDate = (iso) => dateFormat.format(new Date(iso));

export const formatTime = (iso) => timeFormat.format(new Date(iso));

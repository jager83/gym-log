const numberFormat = new Intl.NumberFormat('it-IT', {
  maximumFractionDigits: 1,
  useGrouping: false,
});
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

export const formatNumber = (value) => (value === null || value === undefined ? '' : numberFormat.format(value));

export const parseNumberInput = (text) => {
  const normalized = String(text).trim().replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

export const formatDuration = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const formatRange = ({ min, max }) => (min === max ? `${min}` : `${min}-${max}`);

export const formatSet = (set, type) => {
  if (type === 'time') return formatDuration(set.duration ?? 0);
  const reps = set.reps ?? '–';
  if (type === 'bodyweight') return set.weight ? `+${formatNumber(set.weight)}×${reps}` : `${reps}`;
  const weight = set.weight === null || set.weight === undefined ? '–' : formatNumber(set.weight);
  return `${weight}×${reps}`;
};

export const formatDay = (iso) => dayFormat.format(new Date(iso));

export const formatDate = (iso) => dateFormat.format(new Date(iso));

export const formatTime = (iso) => timeFormat.format(new Date(iso));

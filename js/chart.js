import { round1 } from './metrics.js';
import { escapeHtml, formatNumber } from './format.js';

const PADDING = { top: 16, right: 12, bottom: 28, left: 40 };

export const scaleLinear = (domainMin, domainMax, rangeMin, rangeMax) => (value) =>
  domainMax === domainMin
    ? (rangeMin + rangeMax) / 2
    : rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);

export const niceBounds = (values) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.1;
  return { min: min - pad, max: max + pad };
};

export const lineChartSvg = (points, { width = 320, height = 180, title = '' } = {}) => {
  const values = points.map((point) => point.value);
  const bounds = niceBounds(values);
  const x = scaleLinear(0, points.length - 1, PADDING.left, width - PADDING.right);
  const y = scaleLinear(bounds.min, bounds.max, height - PADDING.bottom, PADDING.top);
  const right = width - PADDING.right;

  const coords = points.map((point, index) => [round1(x(index)), round1(y(point.value))]);
  const path = coords.map(([cx, cy], index) => `${index === 0 ? 'M' : 'L'}${cx} ${cy}`).join(' ');
  const dots = coords
    .map(
      ([cx, cy], index) =>
        `<circle class="chart-dot" cx="${cx}" cy="${cy}" r="3"><title>${escapeHtml(points[index].label)}: ${formatNumber(points[index].value)}</title></circle>`,
    )
    .join('');

  const valueLine = (value) => {
    const lineY = round1(y(value));
    return [
      `<line class="chart-grid" x1="${PADDING.left}" x2="${right}" y1="${lineY}" y2="${lineY}"/>`,
      `<text class="chart-axis" x="${PADDING.left - 6}" y="${lineY + 4}" text-anchor="end">${formatNumber(value)}</text>`,
    ].join('');
  };
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const axis = [
    valueLine(maxValue),
    minValue === maxValue ? '' : valueLine(minValue),
    `<text class="chart-axis" x="${PADDING.left}" y="${height - 8}">${escapeHtml(points[0].label)}</text>`,
    points.length > 1
      ? `<text class="chart-axis" x="${right}" y="${height - 8}" text-anchor="end">${escapeHtml(points.at(-1).label)}</text>`
      : '',
  ].join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">${axis}<path class="chart-line" d="${path}"/>${dots}</svg>`;
};

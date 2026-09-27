import test from 'node:test';
import assert from 'node:assert/strict';
import { lineChartSvg, niceBounds, scaleLinear } from '../js/chart.js';

const count = (text, pattern) => (text.match(pattern) ?? []).length;

test('scaleLinear e dominio degenere', () => {
  assert.equal(scaleLinear(0, 10, 0, 100)(5), 50);
  assert.equal(scaleLinear(3, 3, 0, 100)(3), 50);
});

test('niceBounds aggiunge margine', () => {
  assert.deepEqual(niceBounds([80, 80]), { min: 79, max: 81 });
  assert.deepEqual(niceBounds([80, 90]), { min: 79, max: 91 });
});

test('lineChartSvg disegna un punto per sessione e una linea', () => {
  const svg = lineChartSvg(
    [
      { label: 'lun 20', value: 80 },
      { label: 'mer 22', value: 81.7 },
      { label: 'ven 24', value: 83 },
    ],
    { title: '1RM stimato (kg)' },
  );
  assert.match(svg, /^<svg class="chart" viewBox="0 0 320 180" role="img" aria-label="1RM stimato \(kg\)">/);
  assert.equal(count(svg, /<circle /g), 3);
  assert.match(svg, /<path class="chart-line" d="M40 /);
  assert.match(svg, /81,7/);
  assert.match(svg, /lun 20/);
  assert.match(svg, /ven 24/);
});

test('lineChartSvg con un solo punto lo centra', () => {
  const svg = lineChartSvg([{ label: 'lun 20', value: 80 }]);
  assert.equal(count(svg, /<circle /g), 1);
  assert.match(svg, /cx="174"/);
});

test('lineChartSvg esegue l\'escape del titolo', () => {
  assert.match(lineChartSvg([{ label: 'x', value: 1 }], { title: '<b>' }), /aria-label="&lt;b&gt;"/);
});

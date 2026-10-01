import test from 'node:test';
import assert from 'node:assert/strict';
import { barChartSvg, compactNumber, lineChartSvg, niceBounds, scaleLinear } from '../js/chart.js';

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

test('barChartSvg: una barra per punto, la parziale tenue, etichette prima e ultima', () => {
  const svg = barChartSvg(
    [
      { label: 'lun 7', value: 3 },
      { label: 'lun 14', value: 0 },
      { label: 'lun 21', value: 2.5 },
      { label: 'lun 28', value: 1, partial: true },
    ],
    { title: 'Sessioni a settimana' },
  );
  assert.match(svg, /^<svg class="chart" viewBox="0 0 320 180" role="img" aria-label="Sessioni a settimana">/);
  assert.equal(count(svg, /<rect /g), 4);
  assert.equal(count(svg, /chart-bar--partial/g), 1);
  assert.match(svg, /<title>lun 21: 2,5<\/title>/);
  assert.match(svg, />lun 7<\/text>/);
  assert.match(svg, />lun 28<\/text>/);
  assert.doesNotMatch(svg, />lun 14<\/text>/);
  assert.match(svg, /height="0"><title>lun 14/);
});

test('barChartSvg: tutti zero, solo la linea di base; nessun NaN', () => {
  const svg = barChartSvg([{ label: 'lun 7', value: 0 }, { label: 'lun 14', value: 0 }]);
  assert.equal(count(svg, /<line /g), 1);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('barChartSvg: escape di titolo ed etichette', () => {
  const svg = barChartSvg([{ label: '<b>', value: 1 }], { title: 'a"b' });
  assert.match(svg, /aria-label="a&quot;b"/);
  assert.doesNotMatch(svg, /<b>/);
});

test('compactNumber: migliaia con la k, sotto 1000 invariato', () => {
  assert.equal(compactNumber(24300), '24,3k');
  assert.equal(compactNumber(1000), '1k');
  assert.equal(compactNumber(999), '999');
  assert.equal(compactNumber(2.5), '2,5');
  assert.match(barChartSvg([{ label: 'a', value: 24300 }]), />24,3k<\/text>/);
  assert.match(barChartSvg([{ label: 'a', value: 24300 }]), /<title>a: 24300<\/title>/);
});

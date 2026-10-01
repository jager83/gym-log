import test from 'node:test';
import assert from 'node:assert/strict';
import { bellSvg, infoSvg, trashSvg } from '../js/views/icons.js';

test('bellSvg: acceso e spento producono markup diverso', () => {
  assert.notEqual(bellSvg(true), bellSvg(false));
  assert.match(bellSvg(false), /<line/);
});

test('tutte le icone hanno aria-hidden, focusable="false" e currentColor', () => {
  [bellSvg(true), bellSvg(false), infoSvg(), trashSvg()].forEach((html) => {
    assert.match(html, /viewBox="0 0 24 24"/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /focusable="false"/);
    assert.match(html, /stroke="currentColor"/);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bellSvg,
  checkSvg,
  chevronLeftSvg,
  chevronRightSvg,
  infoSvg,
  minusSvg,
  plusSvg,
  playSvg,
  trashSvg,
} from '../js/views/icons.js';

test('bellSvg: acceso e spento producono markup diverso', () => {
  assert.notEqual(bellSvg(true), bellSvg(false));
  assert.match(bellSvg(false), /<line/);
});

test('tutte le icone hanno aria-hidden, focusable="false" e currentColor', () => {
  [
    bellSvg(true),
    bellSvg(false),
    infoSvg(),
    trashSvg(),
    chevronLeftSvg(),
    chevronRightSvg(),
    playSvg(),
    minusSvg(),
    plusSvg(),
    checkSvg(),
  ].forEach((html) => {
    assert.match(html, /viewBox="0 0 24 24"/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /focusable="false"/);
    assert.match(html, /stroke="currentColor"/);
  });
});

test('chevronLeftSvg e chevronRightSvg: markup distinto e classi dedicate', () => {
  assert.notEqual(chevronLeftSvg(), chevronRightSvg());
  assert.match(chevronLeftSvg(), /icon--chevron-left/);
  assert.match(chevronRightSvg(), /icon--chevron-right/);
});

test('playSvg: triangolo pieno con fill currentColor', () => {
  const html = playSvg();
  assert.match(html, /icon--play/);
  assert.match(html, /fill="currentColor"/);
  assert.match(html, /stroke="none"/);
});

test('minusSvg e plusSvg: markup distinto, plusSvg con due linee', () => {
  assert.notEqual(minusSvg(), plusSvg());
  assert.match(minusSvg(), /icon--minus/);
  const plusHtml = plusSvg();
  assert.match(plusHtml, /icon--plus/);
  assert.equal((plusHtml.match(/<line/g) ?? []).length, 2);
  assert.equal((minusSvg().match(/<line/g) ?? []).length, 1);
});

test('checkSvg: markup distinto dalle altre icone', () => {
  const html = checkSvg();
  assert.match(html, /icon--check/);
  assert.match(html, /<polyline/);
  assert.notEqual(html, bellSvg(true));
});

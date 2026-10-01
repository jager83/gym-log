import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bellSvg,
  calendarSvg,
  checkSvg,
  chevronLeftSvg,
  chevronRightSvg,
  exerciseTypeSvg,
  infoSvg,
  kettlebellSvg,
  minusSvg,
  plusSvg,
  playSvg,
  repeatSvg,
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

test('icone di riga: una per tipo di esercizio, stile comune, peso come default', () => {
  const byType = ['weight', 'bodyweight', 'time', 'cardio'].map(exerciseTypeSvg);
  assert.equal(new Set(byType).size, 4);
  [...byType, calendarSvg(), repeatSvg(), kettlebellSvg()].forEach((svg) => {
    assert.match(svg, /class="icon icon--row icon--[a-z]+"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.match(svg, /stroke="currentColor"/);
  });
  assert.match(exerciseTypeSvg('weight'), /icon--dumbbell/);
  assert.match(exerciseTypeSvg('bodyweight'), /icon--person/);
  assert.match(exerciseTypeSvg('time'), /icon--stopwatch/);
  assert.match(exerciseTypeSvg('cardio'), /icon--heart/);
  assert.equal(exerciseTypeSvg('boh'), exerciseTypeSvg('weight'));
});

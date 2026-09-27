import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('sw.js', root), 'utf8');
const shell = [...source.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);

test('ogni file in SHELL esiste', () => {
  shell
    .filter((path) => path !== './')
    .forEach((path) => assert.ok(existsSync(new URL(path, root)), `file mancante: ${path}`));
});

test('ogni modulo JS, il CSS, la scheda e il manifest sono in SHELL', () => {
  const jsFiles = readdirSync(new URL('js/', root), { recursive: true })
    .filter((path) => path.endsWith('.js'))
    .map((path) => `js/${path}`);
  [...jsFiles, 'index.html', 'css/main.css', 'data/program.json', 'manifest.webmanifest'].forEach((path) =>
    assert.ok(shell.includes(path), `manca in SHELL: ${path}`),
  );
});

test('CACHE_VERSION è definita', () => {
  assert.match(source, /const CACHE_VERSION = 'gym-log-v\d+';/);
});

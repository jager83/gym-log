// Incrementa CACHE_VERSION a ogni deploy (codice o scheda): la nuova versione
// si scarica in background e si attiva alla successiva riapertura dell'app.
const CACHE_VERSION = 'gym-log-v2';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/main.css',
  'data/program.json',
  'js/app.js',
  'js/chart.js',
  'js/device.js',
  'js/format.js',
  'js/metrics.js',
  'js/program.js',
  'js/session.js',
  'js/store.js',
  'js/timer.js',
  'js/views/faces.js',
  'js/views/history.js',
  'js/views/home.js',
  'js/views/session.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/atkinson-hyperlegible-mono-latin-var.woff2',
  'fonts/atkinson-hyperlegible-next-latin-var.woff2',
  'fonts/bricolage-grotesque-latin-var.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.match(request, { ignoreSearch: true }))
      .then((cached) => cached ?? fetch(request)),
  );
});

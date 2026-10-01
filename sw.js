// Incrementa CACHE_VERSION a ogni deploy (codice o scheda): la nuova versione
// si scarica in background e si attiva alla successiva riapertura dell'app.
const CACHE_VERSION = 'gym-log-v14';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/main.css',
  'data/program.json',
  'js/advice.js',
  'js/app.js',
  'js/chart.js',
  'js/device.js',
  'js/focus.js',
  'js/format.js',
  'js/insights.js',
  'js/metrics.js',
  'js/program.js',
  'js/report.js',
  'js/session.js',
  'js/store.js',
  'js/timer.js',
  'js/views/controls.js',
  'js/views/days.js',
  'js/views/faces.js',
  'js/views/focus.js',
  'js/views/history.js',
  'js/views/home.js',
  'js/views/icons.js',
  'js/views/info.js',
  'js/views/modal.js',
  'js/views/preview.js',
  'js/views/progress.js',
  'js/views/session.js',
  'js/views/workout-switch.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/figtree-latin-var.woff2',
  'fonts/outfit-latin-var.woff2',
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

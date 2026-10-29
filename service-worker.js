'use strict';

// Keep this cache local to the Haumdaucher project, not other GitHub Pages sites.
const CACHE_PREFIX = 'haumdaucher-champions-league-';
const CACHE_NAME = CACHE_PREFIX + 'v4';
const CORE_FILES = [
  './', './index.html', './styles.css', './schedule-data.js', './league-data.js',
  './league-ui.js', './app.js', './pwa.js', './manifest.webmanifest',
  './schedule.json', './league-data.json', './spielplaene.txt',
  './assets/haumdaucher-logo.jpg', './assets/icons/icon-180.png',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './scorer.html', './scorer.css', './checkout-data.js', './scorer-engine.js', './scorer-share.js', './scorer.js'
];
const scopeURL = new URL('./', self.location.href);
const pageURL = new URL('./index.html', scopeURL).href;
const coreURLs = new Set(CORE_FILES.map(path => new URL(path, scopeURL).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES.map(path => new Request(new URL(path, scopeURL), {cache: 'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE_NAME);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(request, {cache: 'no-store', signal: controller.signal});
    if (response.ok) {
      try { await cache.put(key, response.clone()); } catch { /* Storage failure must not hide an online response. */ }
      return response;
    }
    return (await cache.match(key)) || response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scopeURL.origin || !url.pathname.startsWith(scopeURL.pathname)) return;
  url.search = '';
  url.hash = '';
  const isPage = request.mode === 'navigate' && (url.href === scopeURL.href || url.href === pageURL);
  // Query strings select views/players but all app navigations share one shell.
  if (isPage) {
    event.respondWith(networkFirst(request, pageURL));
  } else if (coreURLs.has(url.href)) {
    event.respondWith(networkFirst(request, url.href));
  }
});

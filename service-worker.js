const PWA_VERSION = 'liq-pwa-v5';
const STATIC_CACHE = `${PWA_VERSION}-static`;
const RUNTIME_CACHE = `${PWA_VERSION}-runtime`;
const API_CACHE = `${PWA_VERSION}-api`;
const OFFLINE_URL = 'offline.html';
const SAFE_API_ACTIONS = new Set(['push_key', 'get_settings']);

const PRECACHE_ASSETS = [
  './',
  'chat.php',
  'login.php',
  'register.php',
  'offline.html',
  'manifest.json',
  'css/style.css',
  'css/liquid-glass.css',
  'css/telegram-z.css',
  'js/theme.js',
  'js/api-client.js',
  'js/pwa.js',
  'assets/logo.svg',
  'assets/favicon.svg',
  'assets/pwa/icon-192.png',
  'assets/pwa/icon-512.png'
];

// Import push notification & background sync worker
try {
  importScripts('sw.js');
} catch (e) {
  console.warn('Liquid Chat SW: sw.js import skipped or failed', e);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn(`Liquid Chat SW: Failed to precache ${url}`, err);
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (!key.startsWith(PWA_VERSION)) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Cross-origin requests not handled by default cache
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation requests: Network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Safe API actions
  if (isSafeApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // Static assets (CSS, JS, Images, Icons, Manifest)
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    const offline = await caches.match(OFFLINE_URL);
    if (offline) {
      return offline;
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    eventSafeWaitUntil(networkPromise);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  if (request.destination === 'document') {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) {
      return offline;
    }
  }

  return Response.error();
}

function isStaticAsset(url) {
  const p = url.pathname.toLowerCase();
  return (
    p.includes('/assets/') ||
    p.includes('/css/') ||
    p.includes('/js/') ||
    p.endsWith('manifest.json') ||
    p.endsWith('.png') ||
    p.endsWith('.jpg') ||
    p.endsWith('.jpeg') ||
    p.endsWith('.svg') ||
    p.endsWith('.woff2') ||
    p.endsWith('.woff') ||
    p.endsWith('.css') ||
    p.endsWith('.js')
  );
}

function isSafeApiRequest(url) {
  if (!url.pathname.includes('/api/')) {
    return false;
  }
  const action = url.searchParams.get('action');
  return action && SAFE_API_ACTIONS.has(action);
}

function eventSafeWaitUntil(promise) {
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => null);
  }
}

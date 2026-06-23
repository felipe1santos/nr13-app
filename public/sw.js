// Service worker mínimo do NR-13 — necessário para o app ser instalável (PWA) e abrir offline.
// Estratégia: network-first para navegação (HTML sempre fresco, com fallback ao cache);
// cache-first para assets estáticos (rápido e funciona offline).
const CACHE = 'nr13-cache-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // não intercepta Supabase/externos

  // Navegação (HTML): rede primeiro, cai no cache se offline (SPA: devolve index.html).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copia));
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html'))),
    );
    return;
  }

  // Assets: cache primeiro, busca na rede se não tiver e guarda.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((resp) => {
          if (resp.ok && resp.type === 'basic') {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return resp;
        }),
    ),
  );
});

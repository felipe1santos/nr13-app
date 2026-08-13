// Service worker mínimo do NR-13 — necessário para o app ser instalável (PWA) e abrir offline.
// Estratégia: network-first para navegação E para as folhas de relatório/prontuário (HTML sempre
// fresco, com fallback ao cache); cache-first SÓ para assets com hash no nome (/assets/ do build).
// v6: o v5 fazia cache-first de QUALQUER asset da origem — inclusive os módulos do dev server do
// Vite (sem hash), então edições de código/CSS nunca chegavam ao navegador (ficavam presas no
// cache do SW). Agora só /assets/ (nomes com hash, imutáveis) é cache-first; o resto é rede
// primeiro com fallback ao cache (continua funcionando offline).
// v7: "network-first" com fetch(req) simples ainda batia no CACHE HTTP do navegador — o servidor
// (Caddy) não manda Cache-Control, o navegador aplica cache heurístico e o fetch devolvia
// rel-assinatura.js/templates VELHOS sem nem ir à rede. Agora todo caminho network-first usa
// {cache:'no-cache'} (revalida por ETag — barato, 304) e só cai no cache do SW offline.
// v8: os ícones do PWA trocaram (passaram a ser a marca do sistema). O nome do
// cache PRECISA mudar junto: o `cache.add` do APP_SHELL só roda na instalação de
// uma versão nova, então mantendo 'v7' quem já tem o app instalado continuaria
// com o ícone antigo guardado.
const CACHE = 'nr13-cache-v8';

// Rede com revalidação obrigatória (fura o cache heurístico do HTTP; 304 quando não mudou).
function fetchFresco(req) {
  return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
}
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // allSettled: se um item do shell faltar (404), o install não falha inteiro (senão fica sem SW).
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(APP_SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
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
      fetchFresco(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copia));
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html'))),
    );
    return;
  }

  // Folhas de relatório/prontuário (templates HTML em iframe): rede primeiro, cache só de fallback
  // offline. Sem isto (cache-first), uma edição numa folha fica presa no cache após o deploy — os
  // URLs dos templates NÃO têm hash, então o cache nunca expiraria sozinho.
  if (url.pathname.startsWith('/arquivos-inspecao/') || url.pathname.startsWith('/arquivos-prontuario/')) {
    event.respondWith(
      fetchFresco(req)
        .then((resp) => {
          if (resp.ok && resp.type === 'basic') {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return resp;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Assets com hash no nome (/assets/ do build Vite): imutáveis — cache primeiro.
  if (url.pathname.startsWith('/assets/')) {
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
    return;
  }

  // Qualquer outro asset (módulos do dev server, ícones, imagens sem hash): rede primeiro,
  // cache só como fallback offline — garante que edições apareçam no próximo reload.
  event.respondWith(
    fetchFresco(req)
      .then((resp) => {
        if (resp.ok && resp.type === 'basic') {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req)),
  );
});

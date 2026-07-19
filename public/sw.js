/* ADSUM member app service worker: offline resilience.
 *
 * Keeps the app usable when the network is flaky or absent:
 * - the app shell (HTML, JS, CSS, fonts, images) is served from cache, so the app
 *   still boots offline;
 * - authenticated API GETs are network-first and cached on success, so the last
 *   known data (member card, hierarchy, notifications) stays readable offline;
 * - writes still require the network (never cached), so nothing is silently lost.
 * The API cache is cleared on logout to avoid leaking a previous user's data.
 */
const VERSION = "adsum-membre-v3";
const STATIC_CACHE = `${VERSION}-static`;
const API_CACHE = `${VERSION}-api`;
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(SHELL).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === "clear-api-cache") event.waitUntil(caches.delete(API_CACHE));
  if (data.type === "skip-waiting") self.skipWaiting();
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.hostname.includes("adsum-api");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
  } else if (isApiRequest(url)) {
    event.respondWith(networkFirstApi(request));
  } else if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put("/", response.clone()).catch(() => undefined);
    return response;
  } catch (_e) {
    const cached = (await caches.match("/")) || (await caches.match("/index.html"));
    return cached || new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch (_e) {
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-Adsum-Stale", "1");
      const body = await cached.blob();
      return new Response(body, { status: cached.status, statusText: cached.statusText, headers });
    }
    return new Response(JSON.stringify({ detail: "Hors ligne : donnée non disponible hors connexion." }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => null);
  return cached || (await network) || new Response("", { status: 504 });
}

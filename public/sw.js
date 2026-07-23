/*
 * Service worker de Ventex.
 *
 * Regla que manda sobre todas las demás: un punto de venta NO puede servir
 * datos viejos. Acá solo se cachea lo inmutable (los bundles con hash de
 * Next, los íconos) y la pantalla de respaldo sin conexión. Nada de ventas,
 * stock, sesiones ni respuestas de Supabase toca el caché.
 */

const VERSION = "v1";
const STATIC_CACHE = `ventex-static-${VERSION}`;
const SHELL_CACHE = `ventex-shell-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== SHELL_CACHE).map((k) => caches.delete(k)),
      );
      // Sin skipWaiting: la versión nueva toma el control recién cuando se
      // cierran las pestañas viejas, para no cambiarle los assets a una venta
      // que está a mitad de camino.
      await self.clients.claim();
    })(),
  );
});

/** Assets con hash en el nombre: cambiar el contenido cambia la URL. */
const isImmutable = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/assets/");

/** Íconos y manifiesto: estables, pero conviene refrescarlos en segundo plano. */
const isRevalidatable = (url) =>
  url.pathname.startsWith("/icon-") ||
  url.pathname === "/apple-icon.png" ||
  url.pathname === "/manifest.webmanifest";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Otro origen (Supabase, fuentes externas): siempre en vivo.
  if (url.origin !== self.location.origin) return;
  // Auth y API nunca se cachean: son sesión y datos del negocio.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (isRevalidatable(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  // Navegación: siempre red primero. Si no hay conexión, la pantalla de
  // respaldo; nunca una copia vieja del dashboard.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
  }

  // Todo lo demás (payloads RSC, datos) pasa de largo hacia la red.
});

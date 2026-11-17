/*
 * CellConnect AI — service worker :
 *  - notifications push et partage de fichiers vers l'application (Web Share Target) ;
 *  - page « hors ligne » quand le réseau ne répond pas ;
 *  - fichiers statiques versionnés de Next (/_next/static/*) servis depuis le cache.
 * Règle de confidentialité : aucune réponse /api/* ni aucune page de l'application n'est
 * mise en cache (elles contiennent des données personnelles). Seuls la page /hors-ligne
 * (statique, sans donnée) et les fichiers /_next/static/* le sont.
 */
const VERSION = "v2";
const SHARE_CACHE = "cc-share-target";
const STATIC_CACHE = `cc-static-${VERSION}`;
const OFFLINE_CACHE = `cc-offline-${VERSION}`;
const OFFLINE_URL = "/hors-ligne";
const NAVIGATION_TIMEOUT_MS = 3000;
const KEEP = [SHARE_CACHE, STATIC_CACHE, OFFLINE_CACHE];

/** Met en cache la page hors ligne et les fichiers statiques qu'elle utilise (styles, scripts). */
async function precacheOffline() {
  const res = await fetch(OFFLINE_URL, { cache: "reload", credentials: "same-origin" });
  if (!res.ok || res.redirected) return; // jamais une autre page (ex. connexion) à la place
  const html = await res.clone().text();
  await (await caches.open(OFFLINE_CACHE)).put(OFFLINE_URL, res);
  const assets = [...new Set(html.match(/\/_next\/static\/[\w\-./~%]+\.(?:js|css|woff2?)/g) || [])];
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(
    assets.map(async (a) => {
      const r = await fetch(a).catch(() => null);
      if (r && isImmutable(r)) await statics.put(a, r);
    }),
  );
}

/**
 * Seuls les fichiers que le serveur déclare immuables (build de production : nom unique par contenu)
 * sont gardés. En développement, Next les sert en « no-store » : rien n'est mis en cache.
 */
function isImmutable(res) {
  return res.ok && res.type === "basic" && /immutable/i.test(res.headers.get("cache-control") || "");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheOffline()
      .catch(() => undefined) // hors ligne à l'installation : on réessaiera à la prochaine version
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge des caches des versions précédentes.
      for (const key of await caches.keys()) if (key.startsWith("cc-") && !KEEP.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "CellConnect AI", body: "", url: "/notifications" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* charge utile non JSON : affichage générique */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/icon.svg",
      data: { url: data.url },
      lang: "fr",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url === url && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});

/** Fichier statique versionné (nom unique par contenu) : le cache d'abord, le réseau sinon. */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (isImmutable(res)) cache.put(request, res.clone()).catch(() => undefined);
  return res;
}

/** Moment du dernier repli pour lenteur : la navigation suivante (« Réessayer ») attend le serveur sans délai. */
let lastTimeoutAt = 0;
const PATIENT_WINDOW_MS = 60_000;

/**
 * Navigation : le réseau d'abord ; sans réponse sous 3 s (ou en cas d'échec), la page hors ligne.
 * Juste après un repli pour lenteur, on attend le serveur sans délai : sur un réseau ou un
 * serveur lent (mais joignable), « Réessayer » finit donc par ouvrir la page.
 */
async function networkFirst(request) {
  const patient = Date.now() - lastTimeoutAt < PATIENT_WINDOW_MS;
  let timer;
  const timeout = new Promise((resolve) => {
    if (!patient) timer = setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([fetch(request), timeout]);
    if (res) return res;
    lastTimeoutAt = Date.now();
  } catch {
    /* réseau coupé : repli ci-dessous */
  } finally {
    clearTimeout(timer);
  }
  const offline = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
  return offline || new Response("Pas de connexion. Vérifiez votre connexion internet, puis réessayez.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === "POST" && url.pathname === "/capture/partage") return shareTarget(event);
  if (request.method !== "GET") return;
  // Données de l'application : toujours le réseau, jamais de cache.
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(request));
  if (request.mode === "navigate") return event.respondWith(networkFirst(request));
});

// Web Share Target (POST multipart) : une capture partagée depuis WhatsApp ou la galerie
// est mise de côté localement, puis la page /capture la reprend.
function shareTarget(event) {
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const cache = await caches.open(SHARE_CACHE);
      await Promise.all((await cache.keys()).map((k) => cache.delete(k)));
      const files = form.getAll("files").filter((f) => typeof f !== "string").slice(0, 5);
      let i = 0;
      for (const f of files) {
        await cache.put(`/__partage/${i++}`, new Response(f, { headers: { "content-type": f.type, "x-filename": encodeURIComponent(f.name || "capture") } }));
      }
      const text = [form.get("title"), form.get("text"), form.get("url")].filter(Boolean).join("\n");
      const target = new URL("/capture", self.location.origin);
      if (files.length) target.searchParams.set("partage", "1");
      else if (text) target.searchParams.set("text", text);
      return Response.redirect(target.href, 303);
    })(),
  );
}

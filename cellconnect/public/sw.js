/* CellConnect AI — service worker : notifications push et partage de fichiers vers l'application. */
const SHARE_CACHE = "cc-share-target";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
      icon: "/icon.svg",
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

// Web Share Target (POST multipart) : une capture partagée depuis WhatsApp ou la galerie
// est mise de côté localement, puis la page /capture la reprend.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/capture/partage") return;
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
});

/* MIGL SuperApp Service Worker — offline-first, cache-everything.
   Strategy: cache-first with background refresh. USB/file:// safe (no-op there). */
const CACHE = "migl-superapp-v1";
const CORE = [
  "./index.html",
  "./migl_feed.json",
  "./manifest.json",
  "./air1_village_player.html"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (!e.request.url.startsWith("http")) return; // file:// = already offline
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetchp = fetch(e.request).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => hit);
      return hit || fetchp;
    })
  );
});

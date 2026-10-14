const CACHE_NAME = "samsung-remote-shell-v2";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icons/tv-remote.svg", "./icons/tv-remote-192.png", "./icons/tv-remote-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith("samsung-remote-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});

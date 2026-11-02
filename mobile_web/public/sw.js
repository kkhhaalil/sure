// Service worker for the installable mobile web app (scope /m).
// - App shell: network first, cached copy when offline.
// - GET /api/v1 reads: network first, last good response when offline.
// - Web Push: shows the notification and opens the app on tap.
const SHELL = "sure-mobile-shell-v1";
const DATA = "sure-mobile-data-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(["/m", "/m-app/index.js", "/m-app/index.css"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL, DATA].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackKey ?? request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackKey ?? request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/m")) {
    event.respondWith(networkFirst(request, SHELL, "/m"));
  } else if (url.pathname.startsWith("/m-app/")) {
    event.respondWith(networkFirst(request, SHELL));
  } else if (url.pathname.startsWith("/api/v1/") && !url.pathname.startsWith("/api/v1/auth")) {
    // Cached per URL; responses carry the user's data, so a sign-out clears them.
    event.respondWith(networkFirst(request, DATA));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "sign-out") caches.delete(DATA);
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Sure", body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Sure", {
      body: data.body,
      tag: data.tag,
      icon: "/android-chrome-192x192.png",
      badge: "/android-chrome-192x192.png",
      data: { url: data.url || "/m" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/m", location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(`${location.origin}/m`));
      if (existing) return existing.focus().then(() => existing.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});

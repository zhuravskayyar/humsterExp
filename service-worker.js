const VERSION = "hamster-exp-v2";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./css/layout.css",
  "./css/buttons.css",
  "./css/cards.css",
  "./css/animations.css",
  "./js/app.js",
  "./js/colony.js",
  "./js/data.js",
  "./js/equipment.js",
  "./js/expeditions.js",
  "./js/gacha.js",
  "./js/hamster-assets.js",
  "./js/hamsters.js",
  "./js/icons.js",
  "./js/inventory.js",
  "./js/quests.js",
  "./js/router.js",
  "./js/save.js",
  "./js/sprite.js",
  "./js/state.js",
  "./js/training.js",
  "./js/ui.js",
  "./data/buildings.json",
  "./data/colony_upgrades.json",
  "./data/events.json",
  "./data/gacha.json",
  "./data/hamsters.json",
  "./data/items.json",
  "./data/quests.json",
  "./data/zones.json",
  "./assets/images/maneken/maneken.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put("./index.html", response.clone());
        return response;
      } catch {
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const networkPromise = fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => cached);

    return cached || networkPromise;
  })());
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() ?? {};
  const title = payload.title || "Hamster Expeditions";
  const options = {
    body: payload.body || "У норі щось сталося. Час повертатися.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url: payload.url || "./#play" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./#play";

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientList.find((client) => "focus" in client);
    if (existing) {
      await existing.focus();
      existing.navigate(targetUrl);
      return;
    }
    await clients.openWindow(targetUrl);
  })());
});

const VERSION = "hamster-exp-v51";
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
  "./js/app.js?v=34",
  "./js/battle.js",
  "./js/battle.js?v=34",
  "./js/app.js",
  "./js/colony.js",
  "./js/data.js",
  "./js/equipment.js",
  "./js/equipment.js?v=24",
  "./js/expeditions.js",
  "./js/expeditions.js?v=24",
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
  "./js/ui.js?v=33",
  "./data/buildings.json",
  "./data/bosses.json",
  "./data/colony_upgrades.json",
  "./data/events.json",
  "./data/gacha.json",
  "./data/hamsters.json",
  "./data/items.json",
  "./data/quests.json",
  "./data/zones.json",
  "./assets/images/maneken/maneken.png",
  "./assets/images/hamsters/pixel/idle/pixel_idle_normalized.png?v=24",
  "./assets/images/hamsters/pixel/attack/pixel_attack_normalized.png?v=25",
  "./assets/images/hamsters/shurup/idle/shurup_idle_normalized.png",
  "./assets/images/hamsters/shurup/attack/shurup_attack_normalized.png",
  "./assets/images/hamsters/pliushka/idle/pliushka_idle_normalized.png",
  "./assets/images/hamsters/pliushka/attack/pliushka_attack_normalized.png",
  "./assets/images/hamsters/bublyk/idle/bublyk_idle_normalized.png",
  "./assets/images/hamsters/bublyk/attack/bublyk_attack_normalized.png",
  "./assets/images/hamsters/hryzun/idle/hryzun_idle_normalized.png",
  "./assets/images/hamsters/hryzun/attack/hryzun_attack_normalized.png?v=26",
  "./assets/images/hamsters/iskra/idle/iskra_idle_normalized.png",
  "./assets/images/hamsters/iskra/attack/iskra_attack_normalized.png",
  "./assets/images/hamsters/krykhta/idle/krykhta_idle_normalized.png",
  "./assets/images/hamsters/krykhta/attack/krykhta_attack_normalized.png",
  "./assets/images/hamsters/tin/idle/tin_idle_normalized.png",
  "./assets/images/hamsters/tin/attack/tin_attack_normalized.png",
  "./assets/images/hamsters/BOS/atack/867714b1-670b-4519-8969-22c21731940e_no_bg.png",
  "./assets/images/hamsters/BOS/damage/51c53827-b474-46b6-9d21-91cd9e3546e8_no_bg.png",
  "./assets/images/hamsters/BOS/idle/0be3bca7-e8eb-4d1e-a117-bb7df850cc7b_no_bg.png",
  "./assets/images/hamsters/BOS/portret/690e526d-59a9-4e88-af09-7f4523a0b440_no_bg.png",
  "./assets/images/bosses/rat_keeper/portrait/head.png",
  "./assets/images/bosses/rat_keeper/idle/idle_01.png",
  "./assets/images/bosses/rat_keeper/idle/idle_02.png",
  "./assets/images/bosses/rat_keeper/idle/idle_03.png",
  "./assets/images/bosses/rat_keeper/idle/idle_04.png",
  "./assets/images/bosses/rat_keeper/attack/attack_01.png",
  "./assets/images/bosses/rat_keeper/attack/attack_02.png",
  "./assets/images/bosses/rat_keeper/attack/attack_03.png",
  "./assets/images/bosses/rat_keeper/attack/attack_04.png",
  "./assets/images/bosses/rat_keeper/damage/damage_01.png",
  "./assets/images/bosses/rat_keeper/damage/damage_02.png",
  "./assets/images/bosses/rat_keeper/damage/damage_03.png",
  "./assets/images/bosses/rat_keeper/damage/damage_04.png",
  "./assets/textures/cardboard_fiber_tile.webp",
  "./assets/textures/light_paper_grain_tile.webp",
  "./assets/textures/paper_grain_tile_no_bg.png",
  "./assets/textures/training_sawdust_floor_overlay.png",
  "./assets/ui/dark_cardboard_button_panel.webp",
  "./assets/ui/tape_strip_clear.webp",
  "./assets/ui/torn_cardboard_edge.webp",
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

  // JS, CSS, JSON — network-first: завжди беремо свіжу версію, кеш — лише офлайн-резерв
  const isCode = /\.(js|css|json)(\?.*)?$/.test(url.pathname);
  if (isCode) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  // Решта (зображення, JSON тощо) — cache-first
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

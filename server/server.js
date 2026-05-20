/**
 * Hamster Expeditions server for Render.
 *
 * Deploy to Render.com with root directory: server.
 *
 * Optional env vars:
 *   VAPID_PUBLIC_KEY   - generate with: npm run generate-keys
 *   VAPID_PRIVATE_KEY
 *   VAPID_EMAIL        - e.g. mailto:you@example.com
 *   ALLOWED_ORIGINS    - comma-separated, e.g. https://zhuravskayyar.github.io
 *   STATS_FILE         - custom JSON file for persisted player statistics
 *   PORT               - set automatically by Render
 */

import express from "express";
import webpush from "web-push";
import cors from "cors";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_EMAIL,
  ALLOWED_ORIGINS,
  PORT = 3000,
  STATS_FILE,
} = process.env;

const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (PUSH_ENABLED) {
  webpush.setVapidDetails(
    VAPID_EMAIL ?? "mailto:admin@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
} else {
  console.warn("Push notifications disabled: missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY");
}

const app = express();
app.use(express.json({ limit: "32kb" }));

const allowedList = ALLOWED_ORIGINS
  ? ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : true;

app.use(cors({ origin: allowedList }));

const subscribers = new Map();
const MAX_EXPEDITIONS = 10;
const STALE_MS = 10 * 60 * 1000;
const PLAYER_ONLINE_MS = 2 * 60 * 1000;
const STATS_SAVE_DELAY_MS = 750;
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const STATS_STORAGE_FILE = STATS_FILE ? resolve(STATS_FILE) : resolve(SERVER_DIR, "player-stats.json");

const statsStore = loadStatsStore();
let statsSaveTimer = null;

function scheduleNotification(endpoint, expeditionId, subscription, endTime, zoneName) {
  const delay = Math.min(Math.max(0, endTime - Date.now()), 2_147_483_647);

  return setTimeout(async () => {
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: "Експедиція завершена",
          body: `Загін повернувся з "${zoneName}". Час забрати трофеї!`,
          url: "./#play",
        }),
      );
      console.log(`[push] sent for expedition ${expeditionId}`);
    } catch (err) {
      console.warn(`[push] failed for ${expeditionId}: ${err.statusCode} ${err.message}`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        const sub = subscribers.get(endpoint);
        if (sub) {
          for (const timer of sub.timers.values()) clearTimeout(timer);
          subscribers.delete(endpoint);
        }
      }
    }

    const sub = subscribers.get(endpoint);
    if (sub) sub.timers.delete(expeditionId);
  }, delay);
}

function loadStatsStore() {
  const now = Date.now();
  try {
    if (existsSync(STATS_STORAGE_FILE)) {
      const parsed = JSON.parse(readFileSync(STATS_STORAGE_FILE, "utf8"));
      return normalizeStatsStore(parsed, now);
    }
  } catch (error) {
    console.warn(`[stats] failed to read ${STATS_STORAGE_FILE}: ${error.message}`);
  }

  return normalizeStatsStore({}, now);
}

function normalizeStatsStore(store = {}, now = Date.now()) {
  const players = typeof store.players === "object" && store.players !== null ? store.players : {};
  const days = typeof store.days === "object" && store.days !== null ? store.days : {};
  const totalSessions = Number.isFinite(Number(store.totalSessions))
    ? Number(store.totalSessions)
    : Object.values(players).reduce((sum, player) => sum + Object.keys(player.sessions ?? {}).length, 0);

  for (const player of Object.values(players)) {
    player.sessions = typeof player.sessions === "object" && player.sessions !== null ? player.sessions : {};
    player.sessionCount = Number(player.sessionCount ?? Object.keys(player.sessions).length) || 0;
    player.pings = Number(player.pings ?? 0) || 0;
  }

  return {
    version: 1,
    createdAt: Number(store.createdAt) || now,
    serverStartedAt: now,
    totalPings: Number(store.totalPings) || 0,
    totalSessions,
    peakOnline: Number(store.peakOnline) || 0,
    peakOnlineAt: Number(store.peakOnlineAt) || null,
    players,
    days,
  };
}

function scheduleStatsSave() {
  if (statsSaveTimer) return;
  statsSaveTimer = setTimeout(() => {
    statsSaveTimer = null;
    writeStatsStore();
  }, STATS_SAVE_DELAY_MS);
  statsSaveTimer.unref?.();
}

function writeStatsStore() {
  try {
    mkdirSync(dirname(STATS_STORAGE_FILE), { recursive: true });
    writeFileSync(STATS_STORAGE_FILE, JSON.stringify(statsStore, null, 2), "utf8");
  } catch (error) {
    console.warn(`[stats] failed to write ${STATS_STORAGE_FILE}: ${error.message}`);
  }
}

function flushStatsStore() {
  if (statsSaveTimer) {
    clearTimeout(statsSaveTimer);
    statsSaveTimer = null;
  }
  writeStatsStore();
}

function isSafeClientId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,96}$/.test(value);
}

function cleanRoute(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(value)
    ? value
    : "unknown";
}

function cleanNumber(value, max = 1_000_000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.round(number)));
}

function getDayKey(time = Date.now()) {
  return new Date(time).toISOString().slice(0, 10);
}

function ensureDayStats(dayKey) {
  statsStore.days[dayKey] = statsStore.days[dayKey] ?? {
    pings: 0,
    players: {},
    sessions: {},
  };
  return statsStore.days[dayKey];
}

function recordPlayerPing(payload = {}) {
  if (!isSafeClientId(payload.playerId) || !isSafeClientId(payload.sessionId)) {
    return null;
  }

  const now = Date.now();
  const playerId = payload.playerId.slice(0, 96);
  const sessionId = payload.sessionId.slice(0, 96);
  const isNewPlayer = !statsStore.players[playerId];

  const player = statsStore.players[playerId] ?? {
    id: playerId,
    firstSeenAt: now,
    lastSeenAt: now,
    sessions: {},
    sessionCount: 0,
    pings: 0,
  };

  if (!player.sessions[sessionId]) {
    player.sessions[sessionId] = now;
    player.sessionCount = (player.sessionCount ?? 0) + 1;
    statsStore.totalSessions += 1;
  }

  player.lastSeenAt = now;
  player.pings = (player.pings ?? 0) + 1;
  player.route = cleanRoute(payload.route);
  player.playerLevel = cleanNumber(payload.playerLevel, 10_000);
  player.hamsters = cleanNumber(payload.hamsters, 10_000);
  player.activeExpeditions = cleanNumber(payload.activeExpeditions, 100);
  player.completedExpeditions = cleanNumber(payload.completedExpeditions, 100);
  player.expeditionsStarted = cleanNumber(payload.expeditionsStarted, 1_000_000);
  player.gachaPulls = cleanNumber(payload.gachaPulls, 1_000_000);
  player.bossesDefeated = cleanNumber(payload.bossesDefeated, 1_000_000);
  statsStore.players[playerId] = player;
  statsStore.totalPings += 1;

  const day = ensureDayStats(getDayKey(now));
  day.pings = (day.pings ?? 0) + 1;
  day.players[playerId] = true;
  day.sessions[sessionId] = true;

  const online = getOnlinePlayers(now).length;
  if (online > statsStore.peakOnline) {
    statsStore.peakOnline = online;
    statsStore.peakOnlineAt = now;
  }

  scheduleStatsSave();
  return { playerId, isNewPlayer, online };
}

function getOnlinePlayers(now = Date.now()) {
  const cutoff = now - PLAYER_ONLINE_MS;
  return Object.values(statsStore.players).filter((player) => Number(player.lastSeenAt) >= cutoff);
}

function countPlayersSince(cutoff) {
  return Object.values(statsStore.players).filter((player) => Number(player.lastSeenAt) >= cutoff).length;
}

function routeCounts(players) {
  const counts = {};
  for (const player of players) {
    const route = player.route || "unknown";
    counts[route] = (counts[route] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([route, count]) => ({ route, count }))
    .sort((left, right) => right.count - left.count || left.route.localeCompare(right.route));
}

function publicPlayer(player) {
  return {
    id: String(player.id ?? "").slice(-8),
    firstSeenAt: player.firstSeenAt,
    lastSeenAt: player.lastSeenAt,
    route: player.route ?? "unknown",
    playerLevel: player.playerLevel ?? 0,
    hamsters: player.hamsters ?? 0,
    activeExpeditions: player.activeExpeditions ?? 0,
    completedExpeditions: player.completedExpeditions ?? 0,
    expeditionsStarted: player.expeditionsStarted ?? 0,
    gachaPulls: player.gachaPulls ?? 0,
    bossesDefeated: player.bossesDefeated ?? 0,
    sessions: player.sessionCount ?? Object.keys(player.sessions ?? {}).length,
  };
}

function buildPublicStats() {
  const now = Date.now();
  const players = Object.values(statsStore.players);
  const onlinePlayers = getOnlinePlayers(now);
  const today = ensureDayStats(getDayKey(now));

  return {
    ok: true,
    generatedAt: now,
    serverStartedAt: statsStore.serverStartedAt,
    createdAt: statsStore.createdAt,
    uptimeSeconds: Math.round(process.uptime()),
    onlinePlayers: onlinePlayers.length,
    totalPlayers: players.length,
    totalSessions: statsStore.totalSessions,
    totalPings: statsStore.totalPings,
    peakOnline: statsStore.peakOnline,
    peakOnlineAt: statsStore.peakOnlineAt,
    today: {
      players: Object.keys(today.players ?? {}).length,
      sessions: Object.keys(today.sessions ?? {}).length,
      pings: today.pings ?? 0,
    },
    last24hPlayers: countPlayersSince(now - 24 * 60 * 60 * 1000),
    last7dPlayers: countPlayersSince(now - 7 * 24 * 60 * 60 * 1000),
    activeExpeditions: onlinePlayers.reduce((sum, player) => sum + (player.activeExpeditions ?? 0), 0),
    routes: routeCounts(players),
    onlineRoutes: routeCounts(onlinePlayers),
    recentPlayers: players
      .sort((left, right) => Number(right.lastSeenAt) - Number(left.lastSeenAt))
      .slice(0, 20)
      .map(publicPlayer),
  };
}

function renderStatsPage() {
  return `<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>Hamster Expeditions - статистика</title>
    <style>
      :root {
        --bg: #24180f;
        --panel: #f4dfb5;
        --panel-2: #e9c987;
        --ink: #23170f;
        --muted: #73583c;
        --line: rgba(35, 23, 15, 0.2);
        --accent: #2f7767;
        --danger: #9c3a2f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 20% 0%, rgba(244, 223, 181, 0.2), transparent 28rem),
          linear-gradient(160deg, #1f130c 0%, #3b2616 48%, #21140d 100%);
      }
      main {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 44px;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-end;
        color: #fff5df;
        margin-bottom: 22px;
      }
      h1, h2, p { margin: 0; }
      h1 { font-size: clamp(2rem, 4vw, 3.6rem); line-height: 0.95; letter-spacing: 0; }
      header p { color: rgba(255, 245, 223, 0.76); margin-top: 8px; }
      .status {
        padding: 10px 14px;
        border: 1px solid rgba(255, 245, 223, 0.28);
        border-radius: 8px;
        white-space: nowrap;
        color: #fff5df;
        background: rgba(255, 255, 255, 0.08);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
      }
      .card, .panel {
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        border: 2px solid rgba(80, 48, 25, 0.42);
        border-radius: 8px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
      }
      .card {
        min-height: 126px;
        padding: 16px;
      }
      .card span, .muted { color: var(--muted); }
      .card strong {
        display: block;
        margin-top: 8px;
        font-size: clamp(2rem, 5vw, 3.3rem);
        line-height: 0.95;
      }
      .card small { display: block; margin-top: 10px; color: var(--muted); }
      .online strong { color: var(--accent); }
      .panel {
        margin-top: 12px;
        padding: 18px;
      }
      .panel-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 14px;
      }
      .route-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .route-pill {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.32);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 11px 8px;
        text-align: left;
        border-top: 1px solid var(--line);
        vertical-align: middle;
      }
      th {
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
      }
      .empty {
        padding: 28px 0;
        color: var(--muted);
        text-align: center;
      }
      .error {
        color: #ffe8d5;
        background: rgba(156, 58, 47, 0.22);
        border-color: rgba(255, 232, 213, 0.26);
      }
      @media (max-width: 900px) {
        header { display: block; }
        .status { display: inline-block; margin-top: 14px; white-space: normal; }
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        table { display: block; overflow-x: auto; white-space: nowrap; }
      }
      @media (max-width: 520px) {
        main { width: min(100% - 20px, 1180px); padding-top: 20px; }
        .grid { grid-template-columns: 1fr; }
        .panel-head { display: block; }
        .panel-head .muted { margin-top: 6px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Статистика гри</h1>
          <p>Hamster Expeditions - дані оновлюються автоматично кожні 10 секунд.</p>
        </div>
        <div id="loadStatus" class="status">Завантаження...</div>
      </header>

      <section class="grid" aria-label="Основні показники">
        <article class="card online"><span>Зараз онлайн</span><strong id="onlinePlayers">0</strong><small>активні за останні 2 хвилини</small></article>
        <article class="card"><span>Усього гравців</span><strong id="totalPlayers">0</strong><small>унікальні браузери</small></article>
        <article class="card"><span>Сесій</span><strong id="totalSessions">0</strong><small>запуски гри</small></article>
        <article class="card"><span>Сьогодні</span><strong id="todayPlayers">0</strong><small id="todaySessions">0 сесій</small></article>
        <article class="card"><span>Пік онлайн</span><strong id="peakOnline">0</strong><small id="peakOnlineAt">ще не було</small></article>
        <article class="card"><span>Активні вилазки</span><strong id="activeExpeditions">0</strong><small>у гравців онлайн</small></article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Екрани гри</h2>
          <p class="muted">Останній відкритий екран кожного гравця.</p>
        </div>
        <div id="routes" class="route-list"><span class="muted">Немає даних.</span></div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Останні гравці</h2>
          <p class="muted" id="lastUpdated">-</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Був у грі</th>
              <th>Екран</th>
              <th>Рівень</th>
              <th>Хом'яки</th>
              <th>Вилазки</th>
              <th>Гача</th>
              <th>Сесії</th>
            </tr>
          </thead>
          <tbody id="recentPlayers"></tbody>
        </table>
      </section>
    </main>

    <script>
      const numberFormat = new Intl.NumberFormat("uk-UA");
      const dateFormat = new Intl.DateTimeFormat("uk-UA", { dateStyle: "short", timeStyle: "medium" });
      const status = document.querySelector("#loadStatus");

      function setText(id, value) {
        document.querySelector("#" + id).textContent = value;
      }

      function number(value) {
        return numberFormat.format(Number(value) || 0);
      }

      function time(value) {
        return value ? dateFormat.format(new Date(value)) : "ще не було";
      }

      function renderRoutes(routes) {
        const node = document.querySelector("#routes");
        node.replaceChildren();
        if (!routes.length) {
          const empty = document.createElement("span");
          empty.className = "muted";
          empty.textContent = "Немає даних.";
          node.append(empty);
          return;
        }
        for (const route of routes) {
          const pill = document.createElement("span");
          pill.className = "route-pill";
          pill.textContent = route.route + ": " + number(route.count);
          node.append(pill);
        }
      }

      function renderPlayers(players) {
        const tbody = document.querySelector("#recentPlayers");
        tbody.replaceChildren();
        if (!players.length) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 8;
          cell.className = "empty";
          cell.textContent = "Ще немає пінгів від клієнтів.";
          row.append(cell);
          tbody.append(row);
          return;
        }
        for (const player of players) {
          const row = document.createElement("tr");
          [
            player.id,
            time(player.lastSeenAt),
            player.route,
            number(player.playerLevel),
            number(player.hamsters),
            number(player.expeditionsStarted) + " / " + number(player.activeExpeditions) + " акт.",
            number(player.gachaPulls),
            number(player.sessions),
          ].forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
          });
          tbody.append(row);
        }
      }

      async function loadStats() {
        try {
          const response = await fetch("/stats.json", { cache: "no-store" });
          if (!response.ok) throw new Error("HTTP " + response.status);
          const data = await response.json();
          setText("onlinePlayers", number(data.onlinePlayers));
          setText("totalPlayers", number(data.totalPlayers));
          setText("totalSessions", number(data.totalSessions));
          setText("todayPlayers", number(data.today.players));
          setText("todaySessions", number(data.today.sessions) + " сесій - " + number(data.today.pings) + " пінгів");
          setText("peakOnline", number(data.peakOnline));
          setText("peakOnlineAt", time(data.peakOnlineAt));
          setText("activeExpeditions", number(data.activeExpeditions));
          setText("lastUpdated", "Оновлено: " + time(data.generatedAt));
          renderRoutes(data.routes || []);
          renderPlayers(data.recentPlayers || []);
          status.className = "status";
          status.textContent = "Сервер працює - uptime " + number(Math.round((data.uptimeSeconds || 0) / 60)) + " хв";
        } catch (error) {
          status.className = "status error";
          status.textContent = "Не вдалося завантажити статистику: " + error.message;
        }
      }

      loadStats();
      setInterval(loadStats, 10000);
    </script>
  </body>
</html>`;
}

app.get("/", (_req, res) => {
  res.redirect(302, "/stats");
});

app.get("/stats", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("html").send(renderStatsPage());
});

app.get("/stats.json", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(buildPublicStats());
});

app.post("/player-ping", (req, res) => {
  const result = recordPlayerPing(req.body ?? {});
  if (!result) {
    return res.status(400).json({ error: "invalid payload" });
  }
  res.json({
    ok: true,
    onlinePlayers: result.online,
    totalPlayers: Object.keys(statsStore.players).length,
    isNewPlayer: result.isNewPlayer,
  });
});

app.get("/vapid-public-key", (_req, res) => {
  if (!PUSH_ENABLED) {
    return res.status(503).json({ error: "push disabled" });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post("/ping", (req, res) => {
  if (!PUSH_ENABLED) {
    return res.status(503).json({ error: "push disabled" });
  }

  const { subscription, expeditions } = req.body ?? {};

  if (
    typeof subscription?.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    !Array.isArray(expeditions)
  ) {
    return res.status(400).json({ error: "invalid payload" });
  }

  const endpoint = subscription.endpoint;
  const now = Date.now();

  if (!subscribers.has(endpoint)) {
    subscribers.set(endpoint, { subscription, timers: new Map(), lastPingAt: now });
  }

  const sub = subscribers.get(endpoint);
  sub.subscription = subscription;
  sub.lastPingAt = now;

  const incomingIds = new Set(
    expeditions.slice(0, MAX_EXPEDITIONS).map((expedition) => expedition.id),
  );

  for (const [id, timer] of sub.timers) {
    if (!incomingIds.has(id)) {
      clearTimeout(timer);
      sub.timers.delete(id);
    }
  }

  for (const { id, endTime, zoneName } of expeditions.slice(0, MAX_EXPEDITIONS)) {
    if (typeof id !== "string" || typeof endTime !== "number" || endTime <= now) {
      if (sub.timers.has(id)) {
        clearTimeout(sub.timers.get(id));
        sub.timers.delete(id);
      }
      continue;
    }

    if (sub.timers.has(id)) clearTimeout(sub.timers.get(id));
    const safeZone = String(zoneName ?? "невідомої зони").slice(0, 64);
    sub.timers.set(id, scheduleNotification(endpoint, id, subscription, endTime, safeZone));
  }

  res.json({ ok: true, scheduled: sub.timers.size });
});

app.get("/health", (_req, res) => {
  const stats = buildPublicStats();
  res.json({
    ok: true,
    subscribers: subscribers.size,
    pushEnabled: PUSH_ENABLED,
    onlinePlayers: stats.onlinePlayers,
    totalPlayers: stats.totalPlayers,
  });
});

setInterval(() => {
  const cutoff = Date.now() - STALE_MS;
  for (const [endpoint, sub] of subscribers) {
    if (sub.lastPingAt < cutoff) {
      for (const timer of sub.timers.values()) clearTimeout(timer);
      subscribers.delete(endpoint);
      console.log(`[cleanup] removed stale subscriber ${endpoint.slice(0, 40)}...`);
    }
  }
}, 60_000);

process.once("SIGTERM", () => {
  flushStatsStore();
  process.exit(0);
});

process.once("SIGINT", () => {
  flushStatsStore();
  process.exit(0);
});

app.listen(PORT, () => console.log(`Hamster server listening on port ${PORT}`));

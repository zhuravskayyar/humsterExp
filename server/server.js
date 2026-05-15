/**
 * Hamster Expeditions — Push Notification Server
 * Deploy to Render.com (root directory: server).
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY   — generate with: npm run generate-keys
 *   VAPID_PRIVATE_KEY
 *   VAPID_EMAIL        — e.g. mailto:you@example.com
 *   ALLOWED_ORIGINS    — comma-separated, e.g. https://zhuravskayyar.github.io
 *   PORT               — set automatically by Render
 */

import express from "express";
import webpush from "web-push";
import cors from "cors";

// ── VAPID setup ───────────────────────────────────────────────────────────────
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, ALLOWED_ORIGINS, PORT = 3000 } = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Run: npm run generate-keys");
  process.exit(1);
}

webpush.setVapidDetails(
  VAPID_EMAIL ?? "mailto:admin@example.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "32kb" }));

const allowedList = ALLOWED_ORIGINS
  ? ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : true; // true = allow all (for local dev)

app.use(cors({ origin: allowedList }));

// ── In-memory subscriber store ────────────────────────────────────────────────
// endpoint → { subscription, timers: Map<expeditionId, TimeoutId>, lastPingAt: number }
const subscribers = new Map();

const MAX_EXPEDITIONS = 10;
const STALE_MS = 10 * 60 * 1000; // remove subscriber if no ping for 10 min

function scheduleNotification(endpoint, expeditionId, subscription, endTime, zoneName) {
  const delay = Math.min(Math.max(0, endTime - Date.now()), 2_147_483_647);

  return setTimeout(async () => {
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: "🐹 Експедиція завершена",
          body: `Загін повернувся з "${zoneName}". Час забрати трофеї!`,
          url: "./#play",
        }),
      );
      console.log(`[push] sent for expedition ${expeditionId}`);
    } catch (err) {
      console.warn(`[push] failed for ${expeditionId}: ${err.statusCode} ${err.message}`);
      // 410 Gone / 404 → subscription expired, clean up
      if (err.statusCode === 410 || err.statusCode === 404) {
        const sub = subscribers.get(endpoint);
        if (sub) {
          for (const t of sub.timers.values()) clearTimeout(t);
          subscribers.delete(endpoint);
        }
      }
    }

    const sub = subscribers.get(endpoint);
    if (sub) sub.timers.delete(expeditionId);
  }, delay);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Client fetches this to build a PushSubscription with the correct VAPID key.
app.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

/**
 * POST /ping
 * Body: {
 *   subscription: PushSubscription (JSON),
 *   expeditions: [{ id: string, endTime: number, zoneName: string }]
 * }
 */
app.post("/ping", (req, res) => {
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
  sub.subscription = subscription; // refresh keys in case they rotated
  sub.lastPingAt = now;

  const incomingIds = new Set(
    expeditions.slice(0, MAX_EXPEDITIONS).map((e) => e.id),
  );

  // Cancel timers for expeditions no longer active
  for (const [id, timer] of sub.timers) {
    if (!incomingIds.has(id)) {
      clearTimeout(timer);
      sub.timers.delete(id);
    }
  }

  // Schedule / refresh timers for active expeditions
  for (const { id, endTime, zoneName } of expeditions.slice(0, MAX_EXPEDITIONS)) {
    if (typeof id !== "string" || typeof endTime !== "number" || endTime <= now) {
      if (sub.timers.has(id)) {
        clearTimeout(sub.timers.get(id));
        sub.timers.delete(id);
      }
      continue;
    }

    // Always reschedule so drift never accumulates
    if (sub.timers.has(id)) clearTimeout(sub.timers.get(id));

    const safeZone = String(zoneName ?? "невідомої зони").slice(0, 64);
    sub.timers.set(id, scheduleNotification(endpoint, id, subscription, endTime, safeZone));
  }

  res.json({ ok: true, scheduled: sub.timers.size });
});

// Health / monitoring endpoint
app.get("/health", (_req, res) => {
  res.json({ ok: true, subscribers: subscribers.size });
});

// ── Stale subscriber cleanup ──────────────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - STALE_MS;
  for (const [endpoint, sub] of subscribers) {
    if (sub.lastPingAt < cutoff) {
      for (const t of sub.timers.values()) clearTimeout(t);
      subscribers.delete(endpoint);
      console.log(`[cleanup] removed stale subscriber ${endpoint.slice(0, 40)}…`);
    }
  }
}, 60_000);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Push server listening on port ${PORT}`));

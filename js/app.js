import { loadData, dataStore, findZone, resourceMeta } from "./data.js";
import { abandonBossBattle, performBattleAction, startBossBattle } from "./battle.js?v=34";
import { canAfford, collectPassiveIncome, spendResources, upgradeColony } from "./colony.js?v=60";
import * as equipmentApi from "./equipment.js?v=24";
import { launchExpedition, updateExpeditionStatuses, claimExpedition } from "./expeditions.js?v=24";
import { rollGacha } from "./gacha.js";
import { getHamsterEffectiveStats, levelUpHamster, recoverHamsters } from "./hamsters.js";
import { navigate } from "./router.js";
import { exportSave, importSave, loadGame, resetGame, saveGame } from "./save.js";
import { gameState, runtimeState } from "./state.js";
import { claimQuest, resetDailyQuestsIfNeeded, syncQuestProgress } from "./quests.js";
import { hitDummy, processOfflineTraining, upgradeDummy, getDummyConfig, startAutoAttack, stopAutoAttack } from "./training.js";
import { closeModal, openModal, pushToast, renderApp, updateLiveTimers, updateTrainingArena } from "./ui.js?v=61";
import { playSound } from "./audio.js";

const {
  equipItem,
  getEquipmentTemplate,
  salvageEquipment,
  unequipSlot,
  upgradeEquipment
} = equipmentApi;

let deferredInstallPrompt = null;
let bootPromise = null;
let expeditionReminderTimer = null;
let _hadSwController = false;
let inactivityReminderTimer = null;
const INACTIVITY_DELAY_MS = 2 * 60 * 60 * 1000;
const INACTIVITY_KEY = "hamster_last_active_ms";

const TUTORIAL_STEP_ROUTES = [
  "base",
  "base",
  "expeditions",
  "expeditions",
  "expeditions",
  "expeditions",
  "expeditions",
  "training",
  "training",
  "gacha"
];
const MARKET_SHINY_TRADE = Object.freeze({
  cost: { gold: 90 },
  reward: { shiny: 10 }
});
const BOSS_AMBUSH_CHANCE = 0.35;

// ── Optional push notification server ─────────────────────────────────────────
// Offline MVP uses only local notifications. Add a server URL here later if push
// reminders should work after the browser process is killed.
const SERVER_URL_STORAGE_KEY = "hamster_server_url";
const PLAYER_ID_KEY = "hamster_player_id_v1";
const PLAYER_SESSION_KEY = "hamster_session_id_v1";
const PLAYER_STATS_INTERVAL_MS = 30_000;
const APP_SERVER = resolveAppServer();
const PUSH_SERVER = APP_SERVER;
const STATS_SERVER = APP_SERVER;

let _pushSub = null;
let _pingTimer = null;
let _playerStatsTimer = null;
let _volatilePlayerId = null;
let _volatileSessionId = null;

function resolveAppServer() {
  const candidates = [
    window.HAMSTER_SERVER_URL,
    document.querySelector("meta[name='hamster-server-url']")?.content,
    getStoredServerUrl(),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeServerUrl(candidate);
    if (normalized !== null) return normalized;
  }

  if (/\.onrender\.com$/i.test(window.location.hostname)) return "";
  return null;
}

function getStoredServerUrl() {
  try {
    return localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function normalizeServerUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw === "same-origin") return "";

  try {
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname === "/" ? "" : url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function _urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function _initPush() {
  if (PUSH_SERVER === null) { console.log("[push] disabled (server URL empty)"); return; }
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { console.log("[push] not supported"); return; }
  if (Notification.permission !== "granted") { console.log("[push] permission:", Notification.permission); return; }
  try {
    const reg = await navigator.serviceWorker.ready;

    // Fetch server's current VAPID public key
    const resp = await fetch(`${PUSH_SERVER}/vapid-public-key`);
    if (!resp.ok) { console.warn("[push] vapid-public-key fetch failed:", resp.status); return; }
    const { publicKey } = await resp.json();
    console.log("[push] server VAPID key:", publicKey.slice(0, 12) + "…");

    let sub = await reg.pushManager.getSubscription();

    // If subscription exists but was made with a different VAPID key — resubscribe
    if (sub) {
      const existingKey = sub.options?.applicationServerKey;
      const newKeyBytes = _urlBase64ToUint8Array(publicKey);
      const existingB64 = existingKey
        ? btoa(String.fromCharCode(...new Uint8Array(existingKey)))
        : null;
      const newB64 = btoa(String.fromCharCode(...newKeyBytes));
      if (existingB64 !== newB64) {
        console.log("[push] VAPID key changed — resubscribing");
        await sub.unsubscribe();
        sub = null;
      }
    }

    if (!sub) {
      console.log("[push] creating new subscription…");
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(publicKey),
      });
      console.log("[push] subscribed:", sub.endpoint.slice(-20));
    } else {
      console.log("[push] existing subscription OK");
    }

    _pushSub = sub;
    _startPingLoop();
  } catch (err) {
    console.warn("[push] init failed:", err.message);
  }
}

async function _sendPing() {
  if (PUSH_SERVER === null || !_pushSub || !gameState) return;
  const active = (gameState.expeditions ?? [])
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, endTime: e.endTime, zoneName: findZone(e.zoneId)?.name ?? e.zoneId }));
  try {
    await fetch(`${PUSH_SERVER}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: _pushSub.toJSON(), expeditions: active }),
    });
  } catch { /* network error — ignore */ }
}

function _startPingLoop() {
  if (PUSH_SERVER === null) return;
  if (_pingTimer) clearInterval(_pingTimer);
  _pingTimer = setInterval(_sendPing, 20_000);
  void _sendPing();
}

function _startPlayerStatsLoop() {
  if (STATS_SERVER === null) return;
  if (_playerStatsTimer) clearInterval(_playerStatsTimer);
  _playerStatsTimer = setInterval(_sendPlayerStatsPing, PLAYER_STATS_INTERVAL_MS);
  void _sendPlayerStatsPing();
}

async function _sendPlayerStatsPing(options = {}) {
  if (STATS_SERVER === null || !gameState) return;

  const payload = buildPlayerStatsPayload();
  if (!payload) return;

  try {
    await fetch(`${STATS_SERVER}/player-ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: options.keepalive === true,
    });
  } catch {
    // Stats must never block gameplay.
  }
}

function buildPlayerStatsPayload() {
  const playerId = getOrCreatePlayerId();
  const sessionId = getOrCreateSessionId();
  if (!playerId || !sessionId) return null;

  return {
    playerId,
    sessionId,
    route: runtimeState.route,
    playerLevel: gameState.player?.level ?? 1,
    hamsters: gameState.hamsters?.length ?? 0,
    activeExpeditions: gameState.expeditions?.filter((expedition) => expedition.status === "active").length ?? 0,
    completedExpeditions: gameState.expeditions?.filter((expedition) => expedition.status === "completed").length ?? 0,
    expeditionsStarted: gameState.stats?.expeditionsStarted ?? 0,
    gachaPulls: gameState.stats?.gachaPulls ?? 0,
    bossesDefeated: gameState.stats?.bossesDefeated ?? 0,
  };
}

function getOrCreatePlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const next = createClientId("player");
    localStorage.setItem(PLAYER_ID_KEY, next);
    return next;
  } catch {
    _volatilePlayerId = _volatilePlayerId ?? createClientId("player");
    return _volatilePlayerId;
  }
}

function getOrCreateSessionId() {
  try {
    const existing = sessionStorage.getItem(PLAYER_SESSION_KEY);
    if (existing) return existing;
    const next = createClientId("session");
    sessionStorage.setItem(PLAYER_SESSION_KEY, next);
    return next;
  } catch {
    _volatileSessionId = _volatileSessionId ?? createClientId("session");
    return _volatileSessionId;
  }
}

function createClientId(prefix) {
  const random = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

const uiRefs = {
  landing: null,
  app: null,
  tryButton: null,
  notifyButton: null,
  installHint: null,
  iosModal: null
};

async function boot() {
  try {
    await loadData();
    const state = loadGame(dataStore);
    processPassiveUpdates(state);
    _checkInactivityOnBoot(state);
    resetDailyQuestsIfNeeded(state);
    syncQuestProgress(state);
    // Офлайн-тренування: зарахувати час поки гравець був відсутній
    const offlineBoot = processOfflineTraining(state);
    // Відновити тренування після перезавантаження
    const savedTrainId = state.training?.activeHamsterId ?? null;
    if (savedTrainId) {
      const trainH = state.hamsters.find((h) => h.id === savedTrainId && h.status === "available");
      if (trainH) {
        runtimeState.trainingHamsterId = savedTrainId;
      } else {
        state.training.activeHamsterId = null;
      }
    }
    saveGame(state);
    syncOnboardingRuntime(state);
    renderApp(state);
    if (offlineBoot) {
      pushToast(`Тренування: ${offlineBoot.rounds} раундів · схованки +${offlineBoot.booksAwarded} · насіння +${offlineBoot.goldAwarded}`);
    }
    if (runtimeState.trainingHamsterId) startAutoAttack(doTrainingAttack);
    bindEvents();
    startTicker();
    _startPlayerStatsLoop();
  } catch (error) {
    document.querySelector("#app").innerHTML = `
      <main class="boot-screen">
        <div class="boot-logo">HE</div>
        <h1>Не вдалося запустити гру</h1>
        <p>${error.message}. Запустіть проєкт через Live Server або інший локальний web server.</p>
      </main>
    `;
    console.error(error);
  }
}

function initSite() {
  uiRefs.landing = document.querySelector("#landing");
  uiRefs.app = document.querySelector("#app");
  uiRefs.tryButton = document.querySelector("#tryBtn");
  uiRefs.notifyButton = document.querySelector("#notifyBtn");
  uiRefs.installHint = document.querySelector("#installHint");
  uiRefs.iosModal = document.querySelector("#iosInstallModal");

  document.querySelector("#iosModalClose")?.addEventListener("click", _closeIosModal);
  document.querySelector("#iosModalOk")?.addEventListener("click", _closeIosModal);

  uiRefs.tryButton?.addEventListener("click", handleTryClick);
  uiRefs.notifyButton?.addEventListener("click", handleNotifyClick);

  registerServiceWorker();
  bindPwaEvents();
  updateInstallUi();
  updateNotificationUi();

  window.addEventListener("visibilitychange", handleVisibilityRefresh);
  window.addEventListener("pagehide", () => {
    if (gameState) {
      saveGame(gameState);
      void _sendPlayerStatsPing({ keepalive: true });
    }
  });

  if (shouldAutoLaunchGame()) {
    void startGame();
  }
}

function _onSwUpdateReady() {
  if (sessionStorage.getItem("swUpdateShown")) return;
  sessionStorage.setItem("swUpdateShown", "1");

  if (isIOS() && isStandaloneMode()) {
    // iOS standalone: save will be lost on reinstall — show export modal
    if (gameState) {
      openModal("ios-update", { saveText: exportSave(gameState) });
      renderApp(gameState);
    }
  } else {
    // Android / desktop: плавне згасання перед перезавантаження
    pushToast("Оновлення встановлено. Перезавантажую…");
    setTimeout(() => {
      const shell = document.querySelector(".page-shell");
      if (shell) {
        shell.style.transition = "opacity 280ms ease";
        shell.style.opacity = "0";
        setTimeout(() => window.location.reload(), 300);
      } else {
        window.location.reload();
      }
    }, 1400);
  }
}

function bindPwaEvents() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallUi();
    setInstallHint("Система готова встановити гру. Натисни \"Спробувати\", щоб відкрити prompt.");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallUi();
    setInstallHint("Гру встановлено. Тепер її можна запускати з головного екрана.");
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  _hadSwController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!_hadSwController) {
      _hadSwController = true;
      return; // first install, not an update
    }
    _onSwUpdateReady();
  });

  navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }).catch((error) => {
    console.error("Service worker registration failed", error);
  });
}

function shouldAutoLaunchGame() {
  return isStandaloneMode() || window.location.hash === "#play";
}

async function startGame() {
  revealGameShell();
  if (!bootPromise) {
    bootPromise = boot().finally(() => {
      syncExpeditionReminder();
      updateNotificationUi();
      void _initPush();
      _schedulePermissionOnFirstClick();
    });
  }
  await bootPromise;
}

// Request notification permission on the first click inside the game
// (needed when the game auto-launches and handleTryClick never ran)
function _schedulePermissionOnFirstClick() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "default") return;

  const handler = async () => {
    document.removeEventListener("click", handler, { capture: true });
    if (Notification.permission !== "default") return;
    const permission = await Notification.requestPermission();
    updateNotificationUi();
    if (permission === "granted") void _initPush();
  };
  document.addEventListener("click", handler, { capture: true, once: true });
}

function revealGameShell() {
  uiRefs.landing?.setAttribute("hidden", "hidden");
  uiRefs.app?.removeAttribute("hidden");
  if (window.location.hash !== "#play") {
    window.history.replaceState(null, "", "#play");
  }
}

async function handleTryClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallUi();
    setInstallHint(
      choice.outcome === "accepted"
        ? "Гра додана або буде додана після системного підтвердження."
        : "Гру можна встановити пізніше або просто грати в браузері."
    );
  } else if (isIOS() && !isStandaloneMode()) {
    _showIosModal();
  }

  // Auto-request notification permission while we still have the user gesture
  if ("Notification" in window && Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    updateNotificationUi();
    if (permission === "granted") void _initPush();
  }

  await startGame();
}

async function handleNotifyClick() {
  if (!("Notification" in window)) {
    setInstallHint("Цей браузер не підтримує Web Notifications.");
    return;
  }

  if (Notification.permission === "denied") {
    setInstallHint("Сповіщення заблоковано браузером. Дозволь у налаштуваннях сайту.");
    return;
  }

  const permission = await Notification.requestPermission();
  updateNotificationUi();

  if (permission === "granted") {
    setInstallHint("Сповіщення дозволені.");
    void _initPush();
    return;
  }

  setInstallHint("Без дозволу браузера локальні нагадування не працюватимуть.");
}

function updateInstallUi() {
  if (!uiRefs.tryButton) return;

  if (deferredInstallPrompt) {
    uiRefs.tryButton.textContent = "Встановити і відкрити";
    uiRefs.tryButton.classList.add("is-install-ready");
    return;
  }

  uiRefs.tryButton.textContent = isStandaloneMode() ? "Відкрити нору" : "Спробувати";
  uiRefs.tryButton.classList.remove("is-install-ready");
}

function updateNotificationUi() {
  if (!uiRefs.notifyButton) return;
  if (!("Notification" in window)) {
    uiRefs.notifyButton.hidden = true;
    return;
  }

  if (Notification.permission === "granted") {
    uiRefs.notifyButton.hidden = true;
    return;
  }

  uiRefs.notifyButton.hidden = false;
  uiRefs.notifyButton.disabled = false;
  uiRefs.notifyButton.textContent = Notification.permission === "denied"
    ? "Сповіщення заблоковано"
    : "Увімкнути сповіщення";
  uiRefs.notifyButton.disabled = Notification.permission === "denied";
}

function setInstallHint(message) {
  if (uiRefs.installHint) {
    uiRefs.installHint.textContent = message;
  }
}

function _saveTrainingPause() {
  if (!gameState || !runtimeState.trainingHamsterId) return;
  const hamster = gameState.hamsters.find((h) => h.id === runtimeState.trainingHamsterId);
  if (!hamster || hamster.status !== "available") return;
  const stats = getHamsterEffectiveStats(hamster, gameState);
  gameState.training.offlineSince = Date.now();
  gameState.training.offlineDps = getExpectedTrainingDamage(stats) / 1300;
  saveGame(gameState);
}

function handleVisibilityRefresh() {
  if (!gameState) return;

  if (document.visibilityState === "hidden") {
    _saveTrainingPause();
    saveGame(gameState);
    void _sendPlayerStatsPing({ keepalive: true });
    return;
  }

  if (document.visibilityState !== "visible") return;
  void _sendPlayerStatsPing();

  // Офлайн-тренування: зарахувати час відсутності
  const offlineResult = processOfflineTraining(gameState);
  if (offlineResult) {
    saveGame(gameState);
    if (runtimeState.trainingHamsterId) startAutoAttack(doTrainingAttack);
    pushToast(`Тренування: ${offlineResult.rounds} раундів · схованки +${offlineResult.booksAwarded} · насіння +${offlineResult.goldAwarded}`);
  }

  const changed = processPassiveUpdates(gameState);
  if (changed || offlineResult) {
    syncQuestProgress(gameState);
    renderApp(gameState);
    return;
  }
  updateLiveTimers(gameState);
}

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
}

function doTrainingAttack() {
  const hamsterId = runtimeState.trainingHamsterId;
  if (!hamsterId) { stopAutoAttack(); return; }
  const hamster = gameState.hamsters.find((h) => h.id === hamsterId);
  if (!hamster || hamster.status !== "available") {
    stopAutoAttack();
    runtimeState.trainingHamsterId = null;
    gameState.training.activeHamsterId = null;
    saveGame(gameState);
    if (runtimeState.route === "training") renderApp(gameState);
    return;
  }
  const result = hitDummy(gameState, hamsterId);
  if (result) {
    runtimeState.lastHitInfo = { ...result, timestamp: Date.now() };
    saveGame(gameState);
    if (result.booksAwarded > 0) {
      const extras = [];
      if (result.goldAwarded > 0) extras.push(`насіння +${result.goldAwarded}`);
      if (result.foodAwarded > 0) extras.push(`крихти +${result.foodAwarded}`);
      if (result.oreAwarded > 0) extras.push(`камінці +${result.oreAwarded}`);
      const extrasStr = extras.length ? ` · ${extras.join(" · ")}` : "";
      pushToast(`Схованки +${result.booksAwarded}${extrasStr}`);
    }
  }
  // Цільове оновлення арени — без повного перебудовування DOM (уникаємо моргання)
  if (runtimeState.route === "training") {
    updateTrainingArena(gameState);
  }
}

function handleClick(event) {
  const closeTarget = event.target.closest("[data-action='close-modal']");
  if (closeTarget?.classList.contains("modal-backdrop")) {
    event.preventDefault();
    if (!event.target.closest("[data-stop-close]")) {
      closeModal();
      renderApp(gameState);
    }
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) return;
  event.preventDefault();
  const action = target.dataset.action;
  let shouldPlayGachaOpen = false;
  playSound("tap", gameState);

  try {
    if (action === "nav") {
      navigate(target.dataset.route);
      if (target.dataset.route === "training" && runtimeState.trainingHamsterId) {
        startAutoAttack(doTrainingAttack);
      }
    }

    if (action === "tutorial-next") {
      setTutorialStep(getCurrentTutorialStep() + 1);
    }

    if (action === "tutorial-prev") {
      setTutorialStep(getCurrentTutorialStep() - 1);
    }

    if (action === "tutorial-skip") {
      finishTutorial(true);
    }

    if (action === "tutorial-finish") {
      finishTutorial(false);
    }

    if (action === "restart-onboarding") {
      restartTutorial();
    }

    if (action === "select-zone") {
      const zone = findZone(target.dataset.zoneId);
      runtimeState.selectedZoneId = zone.id;
      runtimeState.selectedDurationMs = zone.minDurationMs;
      runtimeState.selectedHamsterIds = [];
    }

    if (action === "select-duration") {
      runtimeState.selectedDurationMs = Number(target.dataset.duration);
    }

    if (action === "select-ration") {
      runtimeState.selectedRationId = target.dataset.rationId || "none";
    }

    if (action === "toggle-hamster") {
      toggleHamster(target.dataset.hamsterId);
    }

    if (action === "select-boss") {
      runtimeState.selectedBossId = target.dataset.bossId || runtimeState.selectedBossId;
      runtimeState.selectedBossHamsterIds = [];
    }

    if (action === "toggle-boss-hamster") {
      toggleBossHamster(target.dataset.hamsterId);
    }

    if (action === "start-boss-battle") {
      const battle = startBossBattle(gameState, runtimeState.selectedBossId, runtimeState.selectedBossHamsterIds);
      pauseTrainingForBattle(battle);
      runtimeState.selectedBossHamsterIds = [];
      saveAndToast("Бій почався");
    }

    if (action === "battle-action") {
      const result = performBattleAction(gameState, target.dataset.battleAction);
      syncQuestProgress(gameState);
      saveGame(gameState);
      if (result?.status === "won") {
        pushToast("Боса переможено");
      }
      if (result?.status === "lost") {
        pushToast("Загін поранено");
      }
    }

    if (action === "abandon-battle") {
      if (gameState.settings.confirmDangerActions === false || confirm("Відступити з бою? Хом'яки підуть відпочивати.")) {
        abandonBossBattle(gameState);
        saveAndToast("Загін відступив");
        playSound("danger", gameState);
      }
    }

    if (action === "open-hamster") {
      runtimeState.expandedHamsterId = target.dataset.hamsterId;
      runtimeState.activeCharacterEquipmentSlot = "weapon";
    }

    if (action === "open-hamster-detail") {
      runtimeState.expandedHamsterId = target.dataset.hamsterId;
      runtimeState.activeCharacterEquipmentSlot = "weapon";
    }

    if (action === "close-hamster-detail") {
      runtimeState.expandedHamsterId = null;
    }

    if (action === "select-character-equipment-slot") {
      runtimeState.activeCharacterEquipmentSlot = target.dataset.slot;
    }

    if (action === "open-constellations") {
      openModal("constellations", { hamsterId: target.dataset.hamsterId });
    }

    if (action === "level-hamster") {
      const hamster = levelUpHamster(gameState, target.dataset.hamsterId);
      let toastMsg = `${hamster.name}: рівень ${hamster.level}`;
      if (hamster.level % 10 === 0) {
        const shinyBonus = hamster.level / 10;
        gameState.resources.shiny = (gameState.resources.shiny ?? 0) + shinyBonus;
        toastMsg += ` · світяшки +${shinyBonus}`;
      }
      saveAndToast(toastMsg);
    }

    if (action === "equip-item") {
      equipItem(gameState, target.dataset.hamsterId, target.dataset.equipmentUid);
      saveAndToast("Екіпіровку встановлено");
    }

    if (action === "unequip-slot") {
      unequipSlot(gameState, target.dataset.hamsterId, target.dataset.slot);
      saveAndToast("Екіпіровку знято");
    }

    if (action === "upgrade-equipment") {
      const equipment = upgradeEquipment(gameState, target.dataset.equipmentUid);
      saveAndToast(`Предмет покращено до рівня ${equipment.level}`);
    }

    if (action === "upgrade-equipment-fodder") {
      if (!equipmentApi.upgradeEquipmentWithFodder) {
        throw new Error("Онови сторінку, щоб завантажити нову систему прокачки");
      }
      const result = equipmentApi.upgradeEquipmentWithFodder(gameState, target.dataset.equipmentUid);
      const fodderItem = getEquipmentTemplate(result.fodder);
      saveAndToast(`Спорядження +${result.levelsGained} рів. · поглинуто ${fodderItem?.name ?? "матеріал"}`);
    }

    if (action === "refine-weapon") {
      if (!equipmentApi.refineWeapon) {
        throw new Error("Онови сторінку, щоб завантажити систему злиття зброї");
      }
      const result = equipmentApi.refineWeapon(gameState, target.dataset.equipmentUid);
      const item = getEquipmentTemplate(result.equipment);
      const copies = equipmentApi.getWeaponCopies?.(result.equipment) ?? result.equipment.copies ?? 0;
      saveAndToast(`${item?.name ?? "Зброя"}: копії ${copies}/5`);
    }

    if (action === "salvage-equipment") {
      salvageEquipment(gameState, target.dataset.equipmentUid);
      saveAndToast("Предмет розібрано на ресурси");
    }

    if (action === "launch-expedition") {
      const expedition = launchExpedition(gameState, runtimeState.selectedZoneId, runtimeState.selectedHamsterIds, runtimeState.selectedDurationMs, runtimeState.selectedRationId);
      runtimeState.selectedHamsterIds = [];
      runtimeState.selectedRationId = "none";
      const rationLabel = expedition.ration ? ` · пайок: ${expedition.ration.label}` : "";
      saveAndToast(`Експедицію запущено: ${findZone(expedition.zoneId).name}${rationLabel}`);
      playSound("launch", gameState);
      syncExpeditionReminder();
    }

    if (action === "claim-expedition") {
      const expeditionId = target.dataset.expeditionId;
      const expedition = gameState.expeditions.find((candidate) => candidate.id === expeditionId);
      const result = claimExpedition(gameState, expeditionId);
      if (result) {
        const shinyBonus = getExpeditionShinyBonus(result);
        gameState.resources.shiny = (gameState.resources.shiny ?? 0) + shinyBonus;
        result.resources.shiny = (result.resources.shiny ?? 0) + shinyBonus;
        const ambushBattle = maybeStartRandomBossAfterExpedition(expedition);
        syncQuestProgress(gameState);
        saveGame(gameState);
        runtimeState.expeditionResult = result;
        syncExpeditionReminder();
        if (ambushBattle) {
          pushToast("Засідка після вилазки!");
          playSound("danger", gameState);
        } else {
          playSound("reward", gameState);
        }
      }
    }

    if (action === "dismiss-expedition-result") {
      runtimeState.expeditionResult = null;
    }

    if (action === "select-training-hamster") {
      const hamster = gameState.hamsters.find((entry) => entry.id === target.dataset.hamsterId);
      if (!hamster || hamster.status !== "available") {
        pushToast("Для тренування хом'як має бути вільним");
        renderApp(gameState);
        return;
      }
      runtimeState.trainingHamsterId = target.dataset.hamsterId;
      gameState.training.activeHamsterId = target.dataset.hamsterId;
      saveGame(gameState);
      startAutoAttack(doTrainingAttack);
    }

    if (action === "set-training-tab") {
      runtimeState.trainingTab = target.dataset.tab;
    }

    if (action === "upgrade-dummy") {
      const success = upgradeDummy(gameState);
      if (success) {
        const dummy = getDummyConfig(gameState);
        saveGame(gameState);
        pushToast(`Манекен покращено до рівня ${dummy.level}`);
        playSound("upgrade", gameState);
      }
    }

    if (action === "claim-quest") {
      if (claimQuest(gameState, target.dataset.questId)) {
        saveAndToast("Нагороду отримано");
      }
    }

    if (action === "upgrade-colony") {
      const upgrade = upgradeColony(gameState, target.dataset.upgradeId);
      saveAndToast(`Покращено: ${upgrade.name}`);
      playSound("upgrade", gameState);
    }

    if (action === "collect-passive") {
      const rewards = collectPassiveIncome(gameState);
      if (rewards) {
        const summary = Object.entries(rewards)
          .map(([key, value]) => `${resourceMeta[key]?.label ?? key} +${value}`)
          .join(" · ");
        saveAndToast(summary || "Пасивний дохід зібрано");
        playSound("reward", gameState);
      } else {
        pushToast("Комора ще наповнюється");
      }
    }

    if (action === "trade-market-shiny") {
      if (!canAfford(gameState, MARKET_SHINY_TRADE.cost)) {
        pushToast("На ринку бракує насіння для обміну");
      } else {
        spendResources(gameState, MARKET_SHINY_TRADE.cost);
        gameState.resources.shiny = (gameState.resources.shiny ?? 0) + MARKET_SHINY_TRADE.reward.shiny;
        saveAndToast(`Ринок: світяшки +${MARKET_SHINY_TRADE.reward.shiny}`);
      }
    }

    if (action === "pull-gacha") {
      const count = Number(target.dataset.count ?? 1);
      const results = rollGacha(gameState, count);
      syncQuestProgress(gameState);
      saveGame(gameState);
      runtimeState.gachaResults = results;
      shouldPlayGachaOpen = true;
      playSound("gacha", gameState);
    }

    if (action === "clear-gacha-results") {
      runtimeState.gachaResults = [];
    }

    if (action === "open-settings" || action === "toggle-settings") {
      navigate("settings");
    }
    if (action === "open-map") navigate("expeditions");
    if (action === "open-workshop") navigate("colony");
    if (action === "open-shop") navigate("inventory");
    if (action === "close-modal") closeModal();

    if (action === "copy-save-code") {
      const textarea = document.querySelector(".save-text");
      const text = textarea?.value ?? "";
      navigator.clipboard?.writeText(text).then(() => pushToast("Код нори скопійовано!")).catch(() => {
        textarea?.select();
        document.execCommand("copy");
        pushToast("Код нори скопійовано!");
      });
    }

    if (action === "open-export") {
      openModal("export", { saveText: exportSave(gameState) });
    }

    if (action === "open-import") {
      openModal("import");
    }

    if (action === "confirm-import") {
      const textarea = document.querySelector("[data-role='import-save']");
      importSave(textarea.value, dataStore);
      processPassiveUpdates(gameState);
      syncQuestProgress(gameState);
      closeModal();
      pushToast("Save імпортовано");
    }

    if (action === "toggle-setting") {
      const key = target.dataset.setting;
      gameState.settings[key] = !gameState.settings[key];
      saveGame(gameState);
      if (key === "sound" && gameState.settings.sound) {
        playSound("reward", gameState);
      }
    }

    if (action === "reset-game") {
      if (gameState.settings.confirmDangerActions === false || confirm("Скинути прогрес Hamster Expeditions?")) {
        resetGame(dataStore);
        runtimeState.selectedHamsterIds = [];
        runtimeState.selectedBossHamsterIds = [];
        runtimeState.selectedBossId = "rat_keeper";
        runtimeState.selectedZoneId = "kitchen";
        runtimeState.selectedDurationMs = 300000;
        runtimeState.selectedRationId = "none";
        runtimeState.expandedHamsterId = null;
        navigate("base");
        runtimeState.gachaResults = [];
        runtimeState.expeditionResult = null;
        runtimeState.onboardingStep = 0;
        closeModal();
        syncExpeditionReminder();
        pushToast("Прогрес скинуто");
      }
    }

    advanceTutorialForAction(action, target);
  } catch (error) {
    pushToast(error.message);
    console.error(error);
  }

  renderApp(gameState);
  if (shouldPlayGachaOpen) {
    playGachaOpenAnimation();
  }
}

function getExpectedTrainingDamage(stats) {
  const critChance = Math.max(0, Math.min(75, stats.critChance ?? 0));
  const critDamage = Math.max(0, stats.critDamage ?? 0);
  return Math.max(1, stats.attack * (1 + (critChance / 100) * (critDamage / 100)));
}

function playGachaOpenAnimation() {
  const stage = document.querySelector("#gachaStage");
  if (!stage) return;

  const hasReward = stage.classList.contains("has-reward");
  stage.classList.remove("has-reward", "is-opening");
  void stage.offsetWidth;
  stage.classList.add("is-opening");

  if (hasReward) {
    window.setTimeout(() => {
      stage.classList.add("has-reward");
    }, 260);
  }

  window.setTimeout(() => {
    stage.classList.remove("is-opening");
  }, 1300);
}

function handleChange(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  if (target.dataset.action === "change-language") {
    gameState.settings.language = target.value;
    saveGame(gameState);
    renderApp(gameState);
  }
}

function toggleHamster(hamsterId) {
  if (runtimeState.selectedHamsterIds.includes(hamsterId)) {
    runtimeState.selectedHamsterIds = runtimeState.selectedHamsterIds.filter((id) => id !== hamsterId);
    return;
  }
  const selectedZone = findZone(runtimeState.selectedZoneId);
  const maxTeam = selectedZone?.maxTeam ?? 3;
  if (runtimeState.selectedHamsterIds.length >= maxTeam) {
    pushToast(`У цю зону можна взяти максимум ${maxTeam} хом'яків`);
    return;
  }
  runtimeState.selectedHamsterIds.push(hamsterId);
}

function toggleBossHamster(hamsterId) {
  if (runtimeState.selectedBossHamsterIds.includes(hamsterId)) {
    runtimeState.selectedBossHamsterIds = runtimeState.selectedBossHamsterIds.filter((id) => id !== hamsterId);
    return;
  }

  const boss = dataStore.bosses.find((entry) => entry.id === runtimeState.selectedBossId) ?? dataStore.bosses[0];
  const maxTeam = boss?.maxTeam ?? 3;
  if (runtimeState.selectedBossHamsterIds.length >= maxTeam) {
    pushToast(`У бій можна взяти максимум ${maxTeam} хом'яків`);
    return;
  }

  runtimeState.selectedBossHamsterIds.push(hamsterId);
}

function maybeStartRandomBossAfterExpedition(expedition) {
  if (!expedition || gameState.battle?.active?.status === "active") return null;
  if (Math.random() > BOSS_AMBUSH_CHANCE) return null;

  const bosses = (dataStore.bosses ?? []).filter((entry) => (gameState.battle?.wins?.[entry.id] ?? 0) <= 0);
  const boss = bosses[Math.floor(Math.random() * bosses.length)];
  if (!boss) return null;

  const availableIds = gameState.hamsters
    .filter((hamster) => hamster.status === "available")
    .map((hamster) => hamster.id);
  const expeditionIds = (expedition.hamsterIds ?? []).filter((id) => availableIds.includes(id));
  const teamIds = [...new Set([...expeditionIds, ...availableIds])].slice(0, boss.maxTeam ?? 3);
  if (!teamIds.length) return null;

  try {
    const battle = startBossBattle(gameState, boss.id, teamIds);
    pauseTrainingForBattle(battle);
    runtimeState.selectedBossId = boss.id;
    runtimeState.selectedBossHamsterIds = [];
    navigate("battle");
    return battle;
  } catch (error) {
    console.warn("[battle] random ambush skipped", error);
    return null;
  }
}

function pauseTrainingForBattle(battle) {
  if (!runtimeState.trainingHamsterId || !battle?.hamsterIds?.includes(runtimeState.trainingHamsterId)) return;
  stopAutoAttack();
  gameState.training.activeHamsterId = null;
  runtimeState.trainingHamsterId = null;
}

function getExpeditionShinyBonus(result) {
  const base = {
    rare_find: 7,
    special_event: 5,
    full_success: 4,
    partial_success: 3,
    injury: 2,
    ambush: 2,
    failure: 2
  }[result.type] ?? 2;
  const durationBonus = Math.max(0, Math.min(4, Math.round(((result.durationMultiplier ?? 1) - 1) * 2)));
  return base + durationBonus;
}

function processPassiveUpdates(state, options = {}) {
  const completedExpeditions = updateExpeditionStatuses(state);
  const changedHamsters = recoverHamsters(state);
  const passiveRewards = state.settings?.autoCollectPassiveIncome === false ? null : collectPassiveIncome(state);
  const dailyQuestsReset = resetDailyQuestsIfNeeded(state);

  if (completedExpeditions.length) {
    void notifyAboutCompletedExpeditions(completedExpeditions, {
      forceSystemNotification: Boolean(options.forceExpeditionNotification)
    });
  }

  if (completedExpeditions.length || changedHamsters || passiveRewards || dailyQuestsReset) {
    saveGame(state);
  }
  syncExpeditionReminder();
  syncInactivityReminder();
  return Boolean(completedExpeditions.length || changedHamsters || passiveRewards || dailyQuestsReset);
}

function startTicker() {
  setInterval(() => {
    const changed = processPassiveUpdates(gameState);
    if (changed) {
      syncQuestProgress(gameState);
      renderApp(gameState);
      return;
    }
    updateLiveTimers(gameState);
  }, 1000);
}

function saveAndToast(message) {
  syncQuestProgress(gameState);
  saveGame(gameState);
  pushToast(message);
}

function syncOnboardingRuntime(state) {
  if (state.onboarding?.completed) {
    runtimeState.onboardingStep = null;
    return;
  }

  const step = normalizeTutorialStep(state.onboarding?.currentStep ?? 0);
  runtimeState.onboardingStep = step;
  navigate(TUTORIAL_STEP_ROUTES[step] ?? "base");
}

function getCurrentTutorialStep() {
  return normalizeTutorialStep(runtimeState.onboardingStep ?? gameState?.onboarding?.currentStep ?? 0);
}

function setTutorialStep(nextStep) {
  if (!gameState) return;
  if (nextStep >= TUTORIAL_STEP_ROUTES.length) {
    finishTutorial(false);
    return;
  }

  const step = normalizeTutorialStep(nextStep);
  ensureOnboardingState();
  gameState.onboarding.currentStep = step;
  runtimeState.onboardingStep = step;
  navigate(TUTORIAL_STEP_ROUTES[step] ?? "base");
  saveGame(gameState);
}

function advanceTutorialForAction(action, target) {
  if (!gameState || gameState.onboarding?.completed) return;
  const step = getCurrentTutorialStep();

  const matched = (
    (step === 1 && action === "nav" && target.dataset.route === "expeditions") ||
    (step === 2 && action === "select-zone") ||
    (step === 3 && action === "select-duration") ||
    (step === 4 && action === "toggle-hamster" && runtimeState.selectedHamsterIds.length > 0) ||
    (step === 5 && action === "launch-expedition") ||
    (step === 6 && action === "nav" && target.dataset.route === "training") ||
    (step === 7 && action === "select-training-hamster") ||
    (step === 8 && action === "nav" && target.dataset.route === "gacha")
  );

  if (matched) {
    setTutorialStep(step + 1);
  }
}

function finishTutorial(skipped) {
  if (!gameState) return;
  ensureOnboardingState();
  gameState.onboarding.completed = true;
  gameState.onboarding.currentStep = 0;
  gameState.onboarding.completedAt = Date.now();
  gameState.onboarding.skipped = Boolean(skipped);
  runtimeState.onboardingStep = null;
  saveGame(gameState);
  pushToast(skipped ? "Навчання сховано. Його можна повторити в налаштуваннях." : "Навчання завершено. Час у вилазку!");
}

function restartTutorial() {
  if (!gameState) return;
  ensureOnboardingState();
  gameState.onboarding.completed = false;
  gameState.onboarding.currentStep = 0;
  gameState.onboarding.completedAt = null;
  gameState.onboarding.skipped = false;
  runtimeState.onboardingStep = 0;
  navigate("base");
  saveGame(gameState);
}

function ensureOnboardingState() {
  gameState.onboarding = {
    version: 1,
    completed: false,
    currentStep: 0,
    completedAt: null,
    ...(gameState.onboarding ?? {})
  };
}

function normalizeTutorialStep(step) {
  const numericStep = Number.isFinite(Number(step)) ? Number(step) : 0;
  return Math.max(0, Math.min(TUTORIAL_STEP_ROUTES.length - 1, numericStep));
}

function syncExpeditionReminder() {
  if (expeditionReminderTimer !== null) {
    clearTimeout(expeditionReminderTimer);
    expeditionReminderTimer = null;
  }

  if (!gameState?.expeditions?.length) return;

  const nextExpedition = gameState.expeditions
    .filter((expedition) => expedition.status === "active")
    .sort((left, right) => left.endTime - right.endTime)[0];

  if (!nextExpedition) return;

  const delay = Math.min(Math.max(0, nextExpedition.endTime - Date.now()), 2147483647);
  expeditionReminderTimer = window.setTimeout(() => {
    const changed = processPassiveUpdates(gameState);
    if (changed) {
      syncQuestProgress(gameState);
      renderApp(gameState);
      return;
    }
    updateLiveTimers(gameState);
    syncExpeditionReminder();
  }, delay);
}

function _checkInactivityOnBoot(state) {
  const hasActive = (state.expeditions ?? []).some((e) => e.status === "active");
  if (hasActive) {
    localStorage.setItem(INACTIVITY_KEY, String(Date.now()));
    return;
  }
  const lastMs = Number(localStorage.getItem(INACTIVITY_KEY) || "0");
  if (lastMs && Date.now() - lastMs >= INACTIVITY_DELAY_MS) {
    localStorage.setItem(INACTIVITY_KEY, String(Date.now()));
    // Delay so SW has time to become active
    window.setTimeout(() => void showInactivityNotification(), 3000);
  }
}

function syncInactivityReminder() {
  if (inactivityReminderTimer !== null) {
    clearTimeout(inactivityReminderTimer);
    inactivityReminderTimer = null;
  }

  const hasActive = gameState?.expeditions?.some((e) => e.status === "active");
  if (hasActive) {
    localStorage.setItem(INACTIVITY_KEY, String(Date.now()));
    return;
  }

  const lastMs = Number(localStorage.getItem(INACTIVITY_KEY) || "0");
  if (!lastMs) return;

  const remaining = INACTIVITY_DELAY_MS - (Date.now() - lastMs);
  if (remaining <= 0) return;

  inactivityReminderTimer = window.setTimeout(() => {
    inactivityReminderTimer = null;
    localStorage.setItem(INACTIVITY_KEY, String(Date.now()));
    void showInactivityNotification();
  }, Math.min(remaining, 2147483647));
}

async function showLocalNotification(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  if (document.visibilityState === "visible") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      ...options,
      data: { url: "./#play", ...(options.data ?? {}) }
    });
  } catch (error) {
    console.error("Notification error", error);
  }
}

async function showInactivityNotification() {
  if (!gameState) return;
  // Don't show if an expedition is already active
  if (gameState.expeditions?.some((e) => e.status === "active")) return;
  await showLocalNotification("Хом'яки сумують!", {
    body: "Ви давно не відправляли загони в похід. Час зібратися!",
    tag: "inactivity-reminder",
    renotify: false
  });
}

async function notifyAboutCompletedExpeditions(expeditions, options = {}) {
  if (!expeditions.length) return;

  const body = expeditions.length === 1
    ? `Загін повернувся з ${findZone(expeditions[0].zoneId)?.name ?? "маршруту"}.`
    : `Повернулися ${expeditions.length} загони. Час забрати трофеї.`;

  if (document.visibilityState === "visible") {
    if (expeditions.length === 1) {
      pushToast(`Готово: ${findZone(expeditions[0].zoneId)?.name ?? "експедиція"}`);
    } else {
      pushToast(`Готово ${expeditions.length} експедиції`);
    }
    if (!options.forceSystemNotification) return;
  }

  await showLocalNotification("Експедиція завершена", {
    body,
    tag: expeditions.length === 1 ? `expedition-ready-${expeditions[0].id}` : "expedition-ready",
    renotify: expeditions.length > 1 || options.forceSystemNotification
  });
}

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function _showIosModal() {
  if (!uiRefs.iosModal) return;
  uiRefs.iosModal.removeAttribute("hidden");
}

function _closeIosModal() {
  if (!uiRefs.iosModal) return;
  uiRefs.iosModal.setAttribute("hidden", "hidden");
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

initSite();

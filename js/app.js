import { loadData, dataStore, findZone } from "./data.js";
import { collectPassiveIncome, upgradeColony } from "./colony.js";
import { equipItem, salvageEquipment, unequipSlot, upgradeEquipment } from "./equipment.js";
import { launchExpedition, updateExpeditionStatuses, claimExpedition } from "./expeditions.js";
import { rollGacha } from "./gacha.js";
import { levelUpHamster, recoverHamsters } from "./hamsters.js";
import { navigate } from "./router.js";
import { exportSave, importSave, loadGame, resetGame, saveGame } from "./save.js";
import { gameState, runtimeState } from "./state.js";
import { claimQuest, resetDailyQuestsIfNeeded, syncQuestProgress } from "./quests.js";
import { hitDummy, upgradeDummy, getDummyConfig, startAutoAttack, stopAutoAttack } from "./training.js";
import { closeModal, openModal, pushToast, renderApp, updateLiveTimers } from "./ui.js";

let deferredInstallPrompt = null;
let bootPromise = null;
let expeditionReminderTimer = null;

// ── Push notification server ──────────────────────────────────────────────────
// After deploying server/ to Render, paste your URL here (no trailing slash).
const PUSH_SERVER = "https://humsterexp.onrender.com";

let _pushSub = null;
let _pingTimer = null;

function _urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function _initPush() {
  if (!PUSH_SERVER) { console.log("[push] disabled (PUSH_SERVER empty)"); return; }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { console.log("[push] not supported"); return; }
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
  if (!PUSH_SERVER || !_pushSub || !gameState) return;
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
  if (!PUSH_SERVER) return;
  if (_pingTimer) clearInterval(_pingTimer);
  _pingTimer = setInterval(_sendPing, 20_000);
  void _sendPing();
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
    resetDailyQuestsIfNeeded(state);
    syncQuestProgress(state);
    saveGame(state);
    renderApp(state);
    bindEvents();
    startTicker();
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

  if (shouldAutoLaunchGame()) {
    void startGame();
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

  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
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
    });
  }
  await bootPromise;
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

function handleVisibilityRefresh() {
  if (document.visibilityState !== "visible" || !gameState) return;
  const changed = processPassiveUpdates(gameState);
  if (changed) {
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
    if (runtimeState.route === "training") renderApp(gameState);
    return;
  }
  const result = hitDummy(gameState, hamsterId);
  if (result) {
    runtimeState.lastHitInfo = { ...result, timestamp: Date.now() };
    saveGame(gameState);
    if (result.booksAwarded > 0) {
      const extras = [];
      if (result.goldAwarded > 0) extras.push(`💛 +${result.goldAwarded}`);
      if (result.foodAwarded > 0) extras.push(`🍞 +${result.foodAwarded}`);
      if (result.oreAwarded > 0) extras.push(`⛏️ +${result.oreAwarded}`);
      const extrasStr = extras.length ? ` · ${extras.join(" · ")}` : "";
      pushToast(`📚 +${result.booksAwarded} схованок${extrasStr}`);
    }
  }
  // Перемальовуємо UI лише на екрані тренування
  if (runtimeState.route === "training") {
    renderApp(gameState);
  }
}

function handleClick(event) {
  const closeTarget = event.target.closest("[data-action='close-modal']");
  if (closeTarget?.classList.contains("modal-backdrop")) {
    if (!event.target.closest("[data-stop-close]")) {
      closeModal();
      renderApp(gameState);
    }
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  try {
    if (action === "nav") {
      navigate(target.dataset.route);
      if (target.dataset.route === "training" && runtimeState.trainingHamsterId) {
        startAutoAttack(doTrainingAttack);
      }
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

    if (action === "toggle-hamster") {
      toggleHamster(target.dataset.hamsterId);
    }

    if (action === "open-hamster") {
      runtimeState.expandedHamsterId = target.dataset.hamsterId;
    }

    if (action === "open-hamster-detail") {
      runtimeState.expandedHamsterId = target.dataset.hamsterId;
    }

    if (action === "close-hamster-detail") {
      runtimeState.expandedHamsterId = null;
    }

    if (action === "level-hamster") {
      const hamster = levelUpHamster(gameState, target.dataset.hamsterId);
      let toastMsg = `${hamster.name}: рівень ${hamster.level}`;
      if (hamster.level % 10 === 0) {
        const shinyBonus = hamster.level / 10;
        gameState.resources.shiny = (gameState.resources.shiny ?? 0) + shinyBonus;
        toastMsg += ` · ✨ +${shinyBonus} світяшок!`;
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

    if (action === "salvage-equipment") {
      salvageEquipment(gameState, target.dataset.equipmentUid);
      saveAndToast("Предмет розібрано на ресурси");
    }

    if (action === "launch-expedition") {
      const expedition = launchExpedition(gameState, runtimeState.selectedZoneId, runtimeState.selectedHamsterIds, runtimeState.selectedDurationMs);
      runtimeState.selectedHamsterIds = [];
      saveAndToast(`Експедицію запущено: ${findZone(expedition.zoneId).name}`);
      syncExpeditionReminder();
    }

    if (action === "claim-expedition") {
      const result = claimExpedition(gameState, target.dataset.expeditionId);
      if (result) {
        const shinyBonus = getExpeditionShinyBonus(result);
        gameState.resources.shiny = (gameState.resources.shiny ?? 0) + shinyBonus;
        result.resources.shiny = (result.resources.shiny ?? 0) + shinyBonus;
        syncQuestProgress(gameState);
        saveGame(gameState);
        runtimeState.expeditionResult = result;
        syncExpeditionReminder();
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
        pushToast(`🔨 Манекен покращено до рівня ${dummy.level}!`);
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
    }

    if (action === "collect-passive") {
      const rewards = collectPassiveIncome(gameState);
      if (rewards) {
        saveAndToast("Пасивний дохід зібрано");
      } else {
        pushToast("Пасивний дохід ще накопичується");
      }
    }

    if (action === "pull-gacha") {
      const count = Number(target.dataset.count ?? 1);
      const results = rollGacha(gameState, count);
      syncQuestProgress(gameState);
      saveGame(gameState);
      runtimeState.gachaResults = results;
    }

    if (action === "clear-gacha-results") {
      runtimeState.gachaResults = [];
    }

    if (action === "open-settings" || action === "toggle-settings") {
      runtimeState.showSettings = !runtimeState.showSettings;
    }
    if (action === "open-map") navigate("expeditions");
    if (action === "open-workshop") navigate("colony");
    if (action === "open-shop") navigate("inventory");
    if (action === "close-modal") closeModal();

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
    }

    if (action === "reset-game") {
      if (confirm("Скинути прогрес Hamster Expeditions?")) {
        resetGame(dataStore);
        runtimeState.selectedHamsterIds = [];
        runtimeState.selectedZoneId = "kitchen";
        runtimeState.selectedDurationMs = 300000;
        runtimeState.expandedHamsterId = null;
        runtimeState.showSettings = false;
        runtimeState.gachaResults = [];
        runtimeState.expeditionResult = null;
        closeModal();
        syncExpeditionReminder();
        pushToast("Прогрес скинуто");
      }
    }
  } catch (error) {
    pushToast(error.message);
    console.error(error);
  }

  renderApp(gameState);
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

function getExpeditionShinyBonus(result) {
  const base = {
    rare_find: 3,
    full_success: 2,
    special_event: 2,
    partial_success: 1,
    injury: 1,
    ambush: 1,
    failure: 1
  }[result.type] ?? 1;
  const durationBonus = Math.max(0, Math.min(2, Math.floor(result.durationMultiplier ?? 1) - 1));
  return base + durationBonus;
}

function processPassiveUpdates(state) {
  const completedExpeditions = updateExpeditionStatuses(state);
  const changedHamsters = recoverHamsters(state);
  const passiveRewards = collectPassiveIncome(state);
  const dailyQuestsReset = resetDailyQuestsIfNeeded(state);

  if (completedExpeditions.length) {
    void notifyAboutCompletedExpeditions(completedExpeditions);
  }

  if (completedExpeditions.length || changedHamsters || passiveRewards || dailyQuestsReset) {
    saveGame(state);
  }
  syncExpeditionReminder();
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

async function notifyAboutCompletedExpeditions(expeditions) {
  if (!expeditions.length) return;

  if (document.visibilityState === "visible") {
    if (expeditions.length === 1) {
      pushToast(`Готово: ${findZone(expeditions[0].zoneId)?.name ?? "експедиція"}`);
    } else {
      pushToast(`Готово ${expeditions.length} експедиції`);
    }
    return;
  }

  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const body = expeditions.length === 1
      ? `Загін повернувся з ${findZone(expeditions[0].zoneId)?.name ?? "маршруту"}.`
      : `Повернулися ${expeditions.length} загони. Час забрати трофеї.`;

    await registration.showNotification("Експедиція завершена", {
      body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: "expedition-ready",
      renotify: expeditions.length > 1,
      data: { url: "./#play" }
    });
  } catch (error) {
    console.error("Notification error", error);
  }
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

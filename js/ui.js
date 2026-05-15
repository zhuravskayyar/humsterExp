import { getColonyStats, getMaxExpeditionSlots, getUpgradeCost, getUpgradeLevel, getUsedExpeditionSlots, canAfford } from "./colony.js";
import { dataStore, findItem, findZone, resourceMeta, t } from "./data.js";
import { calculateSuccessChance, calculateTeam } from "./expeditions.js";
import { formatCost, getSelectedBanner } from "./gacha.js";
import { canUpgradeEquipment, EQUIPMENT_SLOTS, getAvailableEquipmentForSlot, getEquipmentByUid, getEquipmentLevelCost, getEquipmentStats, getEquipmentTemplate, getHamsterEquipment, needsFodder, findFodderEquipment } from "./equipment.js";
import { canLevelHamster, getHamsterLevelCost, getHamsterEffectiveStats } from "./hamsters.js";
import { iconForBuilding, iconForClass, iconForItemType, svgIcon } from "./icons.js";
import { getHamsterPortrait, getHamsterSlug, getHamsterSpriteConfig } from "./hamster-assets.js";
import { getInventoryGroups } from "./inventory.js";
import { runtimeState } from "./state.js";
import { getDummyConfig, getNextDummyConfig, canUpgradeDummy } from "./training.js";
import { attachTrainingCanvas, detachTrainingCanvas, CANVAS_DISPLAY_H } from "./sprite.js";

const navItems = [
  { route: "base",        icon: "base",      labelKey: "base" },
  { route: "hamsters",    icon: "hamster",   labelKey: "hamsters" },
  { route: "expeditions", icon: "map",       labelKey: "expeditions" },
  { route: "training",    icon: "power",     labelKey: "training" },
  { route: "gacha",       icon: "gacha",     labelKey: "gacha" },
];

export function renderApp(state) {
  const app = document.querySelector("#app");
  app.innerHTML = `
    ${renderScreen(state)}
    ${renderBottomNav()}
    ${renderModal(state)}
    ${renderToasts()}
  `;
  _syncTrainingCanvas(state);
}

function _syncTrainingCanvas(state) {
  const canvas = document.querySelector("#training-sprite-canvas");
  if (!canvas) {
    detachTrainingCanvas();
    return;
  }
  const sid = runtimeState.trainingHamsterId;
  if (!sid) return;
  const ham = state?.hamsters?.find((h) => h.id === sid);
  if (!ham) return;
  const slug = getHamsterSlug(ham);
  if (!slug || !getHamsterSpriteConfig(ham)) return;
  const isAttacking = !!(runtimeState.lastHitInfo?.timestamp && Date.now() - runtimeState.lastHitInfo.timestamp < 260);
  attachTrainingCanvas(canvas, slug, isAttacking);
}

export function pushToast(message) {
  const id = crypto.randomUUID();
  runtimeState.toasts.push({ id, message });
  setTimeout(() => {
    runtimeState.toasts = runtimeState.toasts.filter((toast) => toast.id !== id);
    renderApp(window.hamsterGame.state);
  }, 2400);
}

export function openModal(type, payload = {}) {
  runtimeState.modal = { type, payload };
}

export function closeModal() {
  runtimeState.modal = null;
}

export function updateLiveTimers(state) {
  for (const expedition of state.expeditions) {
    const slot = document.querySelector(`[data-expedition-id="${expedition.id}"]`);
    if (!slot) continue;

    const timer = slot.querySelector("[data-timer]");
    const progress = slot.querySelector("[data-progress]");
    if (timer) timer.textContent = expedition.status === "completed" ? "Готово" : formatRemaining(expedition.endTime - Date.now());
    if (progress) progress.style.width = `${calculateProgress(expedition)}%`;
  }
}

function renderScreen(state) {
  if (runtimeState.route === "hamsters") return renderHamstersScreen(state);
  if (runtimeState.route === "expeditions") return renderExpeditionsScreen(state);
  if (runtimeState.route === "colony") return renderColonyScreen(state);
  if (runtimeState.route === "gacha") return renderGachaScreen(state);
  if (runtimeState.route === "inventory") return renderInventoryScreen(state);
  if (runtimeState.route === "quests") return renderQuestsScreen(state);
  if (runtimeState.route === "training") return renderTrainingScreen(state);
  return renderBaseScreen(state);
}

function renderBaseScreen(state) {
  if (runtimeState.showSettings) return renderSettingsScreen(state);

  const active = state.expeditions.filter((expedition) => expedition.status === "active" || expedition.status === "completed");
  const slots = `${getUsedExpeditionSlots(state)}/${getMaxExpeditionSlots(state)}`;
  const result = runtimeState.expeditionResult;
  return `
    <main class="screen">
      ${renderResourceBar(state)}

      ${result ? `
        <div class="result-banner rarity-frame-${rarityClass(result.outcome ?? "common")}">
          <div class="card-row">
            <h3>${result.title}</h3>
            <button class="icon-btn" data-action="dismiss-expedition-result" title="Закрити">${svgIcon("close")}</button>
          </div>
          <p>${result.text}</p>
          <div class="tag-row">
            ${Object.entries(result.resources ?? {}).map(([k, v]) => v > 0 ? `<span class="tag">${resourceMeta[k]?.label ?? k} +${v}</span>` : "").join("")}
            ${(result.items ?? []).map((e) => { const it = findItem(e.itemId); return `<span class="tag">${it?.name ?? e.itemId} ×${e.quantity}</span>`; }).join("")}
            ${result.xp ? `<span class="tag">XP +${result.xp}</span>` : ""}
          </div>
        </div>
      ` : ""}

      <section class="hero-panel">
        <div class="top-row">
          <div>
            <p class="muted">Рівень ${state.player.baseLevel} · загонів ${slots}</p>
            <h1>Нора ${escapeHtml(state.player.name)}</h1>
          </div>
          <button class="icon-btn" data-action="toggle-settings" title="${t("settings")}">${svgIcon("settings")}</button>
        </div>
        <p>Нора копає, збирає, іноді навіть перемагає. Загони готові до вилазок.</p>
        <p>Відправляй хом'яків у вилазки, збирай ресурси й відкривай нових бійців.</p>
        <div class="button-row">
          <button class="btn" data-action="nav" data-route="expeditions">🗺️ ${t("expeditions")}</button>
          <button class="btn secondary" data-action="nav" data-route="colony">🏗️ ${t("colony")}</button>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Активні вилазки</h2>
          <span class="tag">${active.length}</span>
        </div>
        <div class="stack">
          ${active.length ? active.map((expedition) => renderExpeditionSlot(state, expedition)).join("") : `<div class="empty-state"><span class="empty-icon">${svgIcon("map", "svg-icon svg-icon-lg")}</span><p>Загін ще не в дорозі.<br>Саме час обрати маршрут.</p></div>`}
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>Споруди нори</h2>
        </div>
        <div class="stack">
          ${dataStore.buildings.map(renderBuildingCard).join("")}
        </div>
      </section>
    </main>
  `;
}

function renderSettingsScreen(state) {
  return `
    <main class="screen">
      ${renderResourceBar(state)}
      <div class="top-row">
        <button class="icon-btn" data-action="toggle-settings" title="Назад">${svgIcon("close")}</button>
        <div style="flex:1">
          <p class="muted">Нора · MVP</p>
          <h1>${t("settings")}</h1>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-row"><span>Мова</span><strong>Українська</strong></div>
          <p class="muted">MVP зараз працює в одній локалі, щоб інтерфейс не змішував мови.</p>
        </div>
        <div class="card">
          <div class="stack">
            <button class="btn ghost" data-action="toggle-setting" data-setting="sound">
              ${state.settings.sound ? "🔊" : "🔇"} Звук: ${state.settings.sound ? "увімкнено" : "вимкнено"}
            </button>
            <button class="btn ghost" data-action="toggle-setting" data-setting="music">
              🎵 Музика: ${state.settings.music ? "увімкнено" : "вимкнено"}
            </button>
            <button class="btn ghost" data-action="toggle-setting" data-setting="performanceMode">
              ⚡ Режим продуктивності: ${state.settings.performanceMode ? "увімкнено" : "вимкнено"}
            </button>
          </div>
        </div>
        <div class="card">
          <h3>💾 Збереження</h3>
          <p class="muted">Перенеси прогрес на інший пристрій або завантаж резервну копію.</p>
          <div class="button-row">
            <button class="btn secondary" data-action="open-export">Вивантажити</button>
            <button class="btn secondary" data-action="open-import">Завантажити</button>
          </div>
        </div>
        <div class="card">
          <h3>☠️ Небезпечна зона</h3>
          <p class="muted">Скидання видалить весь прогрес нори. Без зворотного шляху.</p>
          <button class="btn danger-btn" data-action="reset-game">🗑️ Скинути прогрес</button>
        </div>
      </div>
    </main>
  `;
}

function renderHamstersScreen(state) {
  if (runtimeState.expandedHamsterId) {
    const hamster = state.hamsters.find((h) => h.id === runtimeState.expandedHamsterId);
    if (hamster) return renderHamsterDetailScreen(state, hamster);
  }
  return `
    <main class="screen">
      ${renderResourceBar(state)}
      <div class="top-row">
        <div>
          <p class="muted">${state.hamsters.length}/${dataStore.hamsters.length} у колекції</p>
          <h1>${t("hamsters")}</h1>
        </div>
        <button class="icon-btn" data-action="nav" data-route="gacha" title="${t("gacha")}">${svgIcon("gacha")}</button>
      </div>
      <div class="stack">
        ${state.hamsters.map((hamster) => renderHamsterCard(state, hamster)).join("")}
      </div>
    </main>
  `;
}

function renderHamsterDetailScreen(state, hamster) {
  const stats = getHamsterEffectiveStats(hamster, state);
  const cost = getHamsterLevelCost(hamster);
  const equipment = getHamsterEquipment(state, hamster);
  const signatureOwned = state.equipment.some((e) => e.itemId === hamster.signatureWeaponId);
  const signatureEquipped = Object.values(equipment).some((e) => e?.itemId === hamster.signatureWeaponId);
  const nextPassive = hamster.constellations?.find((c) => c.level === (hamster.constellationLevel ?? 0) + 1);
  return `
    <main class="screen">
      ${renderResourceBar(state)}
      <div class="top-row">
        <button class="icon-btn" data-action="close-hamster-detail" title="Назад">${svgIcon("close")}</button>
        <div style="flex:1">
          <p class="muted">${hamster.class} · C${hamster.constellationLevel ?? 0}/6</p>
          <h2>${escapeHtml(hamster.name)}</h2>
        </div>
        <span class="tag rarity-${rarityClass(hamster.rarity)}">${renderStarRating(hamster.stars)}</span>
      </div>

      <section class="section card rarity-frame-${rarityClass(hamster.rarity)}">
        <div class="card-row">
          <div>
            <h3>Рівень ${hamster.level} / ${hamster.maxLevel ?? 90}</h3>
            <p class="muted">${signatureEquipped ? "🔮 Сигнатурна зброя активна" : signatureOwned ? "🔮 Є, але не одягнена" : "Сигнатурки ще немає"}</p>
          </div>
          <span class="tag status-${hamster.status}">${t(hamster.status)}</span>
        </div>
        <p>${escapeHtml(hamster.trait)}</p>
        ${renderConstellationRow(hamster)}
        ${nextPassive ? `<p><strong>Наступний пасив C${nextPassive.level}:</strong> ${escapeHtml(nextPassive.name)} — ${escapeHtml(nextPassive.description)}</p>` : `<p><strong>✅ Всі пасиви відкрито!</strong> Дублікати дадуть ресурси.</p>`}
        <div class="stat-grid">
          <div class="stat"><span>HP</span><strong>${stats.hp}</strong></div>
          <div class="stat"><span>Урон</span><strong>${stats.attack}</strong></div>
          <div class="stat"><span>Захист</span><strong>${stats.defense}</strong></div>
          <div class="stat"><span>Сила</span><strong>${stats.power}</strong></div>
          <div class="stat"><span>Швидк.</span><strong>${stats.speed}</strong></div>
          <div class="stat"><span>Удача</span><strong>${stats.luck}</strong></div>
        </div>
        <div class="tag-row" style="margin-top:8px">
          <span class="tag">💛 ${cost.gold} Золото</span>
          <span class="tag">📚 ${cost.xpBooks} Схованки</span>
        </div>
        <button class="btn" style="margin-top:10px" data-action="level-hamster" data-hamster-id="${hamster.id}" ${canLevelHamster(state, hamster) ? "" : "disabled"}>
          ⬆️ Прокачати рівень
        </button>
      </section>

      <section class="section">
        <h2>⚔️ Спорядження</h2>
        <div class="stack">
          ${EQUIPMENT_SLOTS.map((slot) => renderEquipmentSlot(state, hamster, slot, equipment[slot])).join("")}
        </div>
      </section>
    </main>
  `;
}

function renderExpeditionsScreen(state) {
  const selectedZone = findZone(runtimeState.selectedZoneId) ?? dataStore.zones[0];
  if (selectedZone && !runtimeState.selectedDurationMs) runtimeState.selectedDurationMs = selectedZone.minDurationMs;
  const team = calculateTeam(state, runtimeState.selectedHamsterIds);
  const chance = calculateSuccessChance(state, selectedZone?.id, runtimeState.selectedHamsterIds);
  const colonyStats = getColonyStats(state);
  const slots = `${getUsedExpeditionSlots(state)}/${getMaxExpeditionSlots(state)}`;
  const hasFreeSlot = getUsedExpeditionSlots(state) < getMaxExpeditionSlots(state);
  const maxTeam = selectedZone?.maxTeam ?? 3;
  const selectedCount = runtimeState.selectedHamsterIds.length;
  const canLaunch = selectedCount > 0 && selectedCount <= maxTeam && hasFreeSlot;

  return `
    <main class="screen">
      ${renderResourceBar(state)}
      <div class="top-row">
        <div>
          <p class="muted">Загони ${slots} · швидкість +${colonyStats.expeditionSpeedPercent}%</p>
          <h1>${t("expeditions")}</h1>
        </div>
      </div>

      <section class="section stack">
        ${dataStore.zones.filter((zone) => state.unlockedZones.includes(zone.id)).map((zone) => renderZoneCard(zone)).join("")}
      </section>

      <section class="section card">
        <div class="section-header">
          <h2>Тривалість</h2>
          <span class="tag">${formatDuration(runtimeState.selectedDurationMs)}</span>
        </div>
        <div class="duration-row">
          ${renderDurationOptions(selectedZone)}
        </div>
      </section>

      <section class="section card">
        <div class="section-header">
          <h2>Загін</h2>
          <span class="tag">${selectedCount}/${maxTeam} вибрано</span>
        </div>
        <div class="team-grid">
          ${state.hamsters.map((hamster) => renderTeamPill(hamster)).join("")}
        </div>
      </section>

      <section class="section card">
        <div class="section-header">
          <h2>Прогноз</h2>
          <span class="timer-badge">${chance}% успіху</span>
        </div>
        <div class="chance-meter" aria-label="Шанс успіху"><span style="width:${chance}%"></span></div>
        <div class="stat-grid">
          <div class="stat"><span>Бій</span><strong>${Math.round(team.combat)}</strong></div>
          <div class="stat"><span>Урон</span><strong>${team.attack}</strong></div>
          <div class="stat"><span>Захист</span><strong>${team.defense}</strong></div>
          <div class="stat"><span>Сила</span><strong>${team.power}</strong></div>
          <div class="stat"><span>Удача</span><strong>${team.luck}</strong></div>
          <div class="stat"><span>Лут</span><strong>+${team.lootBonus}%</strong></div>
        </div>
        <p>${selectedZone?.description ?? ""}</p>
        <p class="muted">Бій підвищує шанс успіху і зменшує травми. Довша вилазка дає більше трофеїв, а швидкість скорочує тільки час.</p>
        ${hasFreeSlot ? "" : `<p class="muted">Немає вільного слота експедиції</p>`}
        <button class="btn" data-action="launch-expedition" ${canLaunch ? "" : "disabled"}>${t("send")}</button>
      </section>
    </main>
  `;
}

function renderColonyScreen(state) {
  const stats = getColonyStats(state);
  return `
    <main class="screen">
      ${renderResourceBar(state)}
      <div class="top-row">
        <div>
          <p class="muted">Нора пасивно заробляє і пришвидшує загони</p>
          <h1>${t("colony")}</h1>
        </div>
        <button class="icon-btn" data-action="collect-passive" title="Зібрати пасивний дохід">${svgIcon("collect")}</button>
      </div>

      <section class="section panel">
        <div class="stat-grid">
          <div class="stat"><span>Їжа/хв</span><strong>${stats.passiveIncomePerMin.food ?? 0}</strong></div>
          <div class="stat"><span>Дерево/хв</span><strong>${stats.passiveIncomePerMin.wood ?? 0}</strong></div>
          <div class="stat"><span>Монети/хв</span><strong>${stats.passiveIncomePerMin.coins ?? 0}</strong></div>
          <div class="stat"><span>Швидкість</span><strong>+${stats.expeditionSpeedPercent}%</strong></div>
          <div class="stat"><span>Загонів</span><strong>${getMaxExpeditionSlots(state)}</strong></div>
          <div class="stat"><span>Удача</span><strong>+${stats.gachaLuckPercent}%</strong></div>
        </div>
      </section>

      <section class="section stack">
        ${dataStore.colonyUpgrades.map((upgrade) => renderUpgradeCard(state, upgrade)).join("")}
      </section>

      <section class="section">
        <div class="section-header">
          <h2>🔨 Кузня</h2>
          <span class="tag">Скоро</span>
        </div>
        <div class="empty-state">
          <span class="empty-icon">⚒️</span>
          <p>Тут можна кувати, покращувати<br>та розбирати спорядження загонів.</p>
        </div>
      </section>
    </main>
  `;
}

function renderGachaScreen(state) {
  const banner = getSelectedBanner(state);
  const shiny = state.resources.shiny ?? 0;
  const singleCost = banner.cost.single.shiny ?? banner.cost.single.coins ?? 0;
  const tenCost = banner.cost.ten.shiny ?? banner.cost.ten.coins ?? 0;
  const pityPercent = Math.min(100, Math.round((state.gacha.pity5 / banner.pity.fiveStarEvery) * 100));
  const softPityStart = banner.pity.softPityStart ?? banner.pity.fiveStarEvery;
  const pullsToTen = Math.max(0, tenCost - shiny);
  const results = runtimeState.gachaResults ?? [];
  const canSingle = shiny >= singleCost;
  const canTen = shiny >= tenCost;
  return `
    <main class="screen">
      ${renderResourceBar(state)}

      <section class="hero-panel hero-gacha">
        <div class="top-row">
          <div>
            <h1>${t("gacha")}</h1>
            <p class="muted">${banner.name}</p>
          </div>
          <span class="shiny-counter">✨ ${shiny}</span>
        </div>
        <p>${banner.description}</p>
        <div class="gacha-pity-bar">
          <div class="gacha-pity-fill" style="width:${pityPercent}%"></div>
        </div>
        <p class="gacha-pity-note">Гарант 5⭐: ${state.gacha.pity5}/${banner.pity.fiveStarEvery} листів · м'який шанс з ${softPityStart}</p>
        <div class="gacha-economy-row">
          <span class="tag">Вилазка ✨1-5</span>
          <span class="tag">Щоденні ✨8</span>
          <span class="tag">${pullsToTen ? `До 10 листів ✨${pullsToTen}` : "10 листів готові"}</span>
        </div>
        <div class="button-row">
          <button class="btn" data-action="pull-gacha" data-count="1" ${canSingle ? "" : "disabled"}>
            1 лист · ✨${singleCost}
          </button>
          <button class="btn secondary" data-action="pull-gacha" data-count="10" ${canTen ? "" : "disabled"}>
            10 листів · ✨${tenCost}
          </button>
        </div>
        ${!canSingle ? `<p class="gacha-pity-note">Бракує світяшок. Вилазки та доручення поповнюють запас.</p>` : ""}
      </section>

      <section class="section panel">
        <div class="section-header">
          <h2>Шанси</h2>
          <span class="tag">Хом'як ${banner.hamsterChance}%</span>
        </div>
        <div class="tag-row">
          <span class="tag">🐹 4⭐ ${banner.hamsterStars["4"]}%</span>
          <span class="tag">🐹 5⭐ ${banner.hamsterStars["5"]}%</span>
          <span class="tag">🔩 предмети 1-5⭐</span>
          <span class="tag">⚡ гарант кожні ${banner.pity.fiveStarEvery}</span>
          <span class="tag">✨ м'який ${softPityStart}+</span>
        </div>
      </section>

      ${results.length ? `
        <section class="section">
          <div class="section-header">
            <h2>Відкриті листи (${results.length})</h2>
            <button class="select-pill" data-action="clear-gacha-results">Очистити</button>
          </div>
          <div class="gacha-result-grid">
            ${results.map(renderGachaResultCard).join("")}
          </div>
        </section>
      ` : `
        <section class="section">
          <div class="empty-state"><span class="empty-icon">${svgIcon("gacha", "svg-icon svg-icon-lg")}</span><p>Поштар ще не приходив.<br>Жми кнопку!</p></div>
        </section>
      `}
    </main>
  `;
}

function renderInventoryScreen(state) {
  const items = getInventoryGroups(state, dataStore);
  return `
    <main class="screen">
      ${renderResourceBar(state)}
      <div class="top-row">
        <div>
          <p class="muted">${items.length} типів предметів</p>
          <h1>${t("inventory")}</h1>
        </div>
      </div>
      <section class="section">
        <h2>Ресурси</h2>
        <div class="resource-bar">
          ${Object.entries(state.resources).map(([key, value]) => renderResourceChip(key, value)).join("")}
        </div>
      </section>
      <section class="section">
        <h2>Екіпіровка</h2>
        <div class="stack">
          ${state.equipment?.length ? state.equipment.map((equipment) => renderEquipmentCard(state, equipment)).join("") : `<div class="empty-state"><span class="empty-icon">${svgIcon("armor", "svg-icon svg-icon-lg")}</span><p>Екіпіровки ще немає.</p></div>`}
        </div>
      </section>
      <section class="section stack">
        <h2>Матеріали</h2>
        ${items.length ? items.map(renderInventoryItemCard).join("") : `<div class="empty-state"><span class="empty-icon">${svgIcon("inventory", "svg-icon svg-icon-lg")}</span><p>Інвентар порожній.<br>Вилазки це виправлять.</p></div>`}
      </section>
      <section class="section">
        <div class="section-header">
          <h2>🔁 Обмін</h2>
          <span class="tag">Скоро</span>
        </div>
        <div class="empty-state">
          <span class="empty-icon">💱</span>
          <p>Тут можна буде міняти зайві ресурси<br>на Світяшки та рідкісні матеріали.</p>
        </div>
      </section>
    </main>
  `;
}

function renderQuestsScreen(state) {
  return `
    <main class="screen">
      ${renderResourceBar(state)}
      <div class="top-row">
        <div>
          <p class="muted">Щоденні, сюжетні та досягнення</p>
          <h1>${t("quests")}</h1>
        </div>
      </div>
      <div class="stack">
        ${state.quests.map((quest) => renderQuestCard(quest)).join("")}
      </div>
    </main>
  `;
}

function renderTrainingScreen(state) {
  const dummy = getDummyConfig(state);
  const nextDummy = getNextDummyConfig(state);
  const progress = state.training?.damageProgress ?? 0;
  const totalRounds = state.training?.totalRounds ?? 0;
  const progressPercent = Math.min(100, Math.round((progress / dummy.hpPerRound) * 100));

  const selectedId = runtimeState.trainingHamsterId;
  const selectedHamsterCandidate = selectedId ? state.hamsters.find((h) => h.id === selectedId) : null;
  const selectedHamster = selectedHamsterCandidate?.status === "available" ? selectedHamsterCandidate : null;
  const availableHamsters = state.hamsters.filter((h) => h.status === "available");
  const selectedStats = selectedHamster ? getHamsterEffectiveStats(selectedHamster, state) : null;
  const lastHit = runtimeState.lastHitInfo;
  const activeTab = runtimeState.trainingTab ?? "fight";

  // Чи атакує зараз (анімація attack якщо удар < 450мс тому)
  const isAttacking = !!(lastHit?.timestamp && Date.now() - lastHit.timestamp < 450);

  // Portrait path (fallback when no sprite config)
  const hasSprite = !!getHamsterSpriteConfig(selectedHamster);
  const portraitSrc = getHamsterPortrait(selectedHamster);

  const dummyEmojis = ["🪆", "🪆", "🤺", "🥊", "💀"];
  const dummyEmoji = dummyEmojis[dummy.level - 1] ?? "🪆";
  const rarityNames = ["common", "uncommon", "rare", "epic", "legendary"];

  return `
    <main class="screen">
      ${renderResourceBar(state)}

      <div class="training-title-row">
        <h2>💪 ${t("training")}</h2>
        <span class="muted" style="font-size:0.8rem">${totalRounds} раундів</span>
      </div>

      <div class="training-arena">
        <!-- Один спільний контейнер: хом'як + манекен без розділення на колонки -->
        <div class="arena-stage">
          ${selectedHamster ? `
            ${hasSprite ? `
              <div class="arena-canvas-wrap">
                <canvas id="training-sprite-canvas"
                  style="height:${CANVAS_DISPLAY_H}px;display:block;image-rendering:pixelated"></canvas>
              </div>
            ` : `
              <div class="arena-sprite-wrap">
                <img class="arena-sprite" src="${escapeHtml(portraitSrc)}"
                  alt="${escapeHtml(selectedHamster.name)}"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                <div class="hamster-portrait-fallback" style="display:none">
                  ${svgIcon(iconForClass(selectedHamster.class), "svg-icon svg-icon-lg")}
                  <span>арт скоро</span>
                </div>
              </div>
            `}
          ` : `
            <div class="arena-canvas-wrap arena-empty-wrap">
              <span class="arena-empty-icon">🐾</span>
            </div>
          `}

          <div class="arena-center">
            ${lastHit && isAttacking ? `
              <div class="arena-damage">-${lastHit.damage}</div>
              ${lastHit.booksAwarded > 0
                ? `<div class="arena-reward">📚 +${lastHit.booksAwarded}</div>`
                : ""}
            ` : ""}
          </div>

          <div class="arena-dummy-wrap">
            <div class="dummy-figure ${isAttacking ? "dummy-hit" : ""}">${dummyEmoji}</div>
          </div>
        </div>

        <!-- Підписи під бійцями -->
        <div class="arena-labels-row">
          <div class="arena-side-info">
            <span class="arena-label">${selectedHamster ? escapeHtml(selectedHamster.name) : "оберіть бійця"}</span>
            ${selectedHamster ? `<span class="arena-stat">⚔️ ${selectedStats.attack}</span>` : ""}
          </div>
          <div class="arena-side-info" style="align-items:flex-end">
            <span class="arena-label">Манекен</span>
            <span class="tag rarity-${rarityNames[dummy.level - 1]}" style="font-size:0.7rem">Рівень ${dummy.level}</span>
          </div>
        </div>
      </div>

      <div class="training-hp-wrap">
        <div class="training-hp-bar">
          <div class="training-hp-fill" style="width:${progressPercent}%"></div>
        </div>
        <span class="training-hp-text">${progress} / ${dummy.hpPerRound} · 📚 ×${dummy.rewardBooks}</span>
      </div>

      <div class="training-tabs">
        <button class="training-tab-btn ${activeTab === "fight" ? "active" : ""}"
          data-action="set-training-tab" data-tab="fight">⚔️ Бій</button>
        <button class="training-tab-btn ${activeTab === "dummy" ? "active" : ""}"
          data-action="set-training-tab" data-tab="dummy">🪆 Манекен</button>
        <button class="training-tab-btn ${activeTab === "stats" ? "active" : ""}"
          data-action="set-training-tab" data-tab="stats">📊 Стат</button>
      </div>

      <div class="training-tab-content">
        ${activeTab === "fight"
          ? renderTrainingFightTab(state, availableHamsters, selectedHamster, selectedId, selectedStats)
          : ""}
        ${activeTab === "dummy"
          ? renderTrainingDummyTab(state, dummy, nextDummy)
          : ""}
        ${activeTab === "stats"
          ? renderTrainingStatsTab(state, totalRounds)
          : ""}
      </div>
    </main>
  `;
}

function renderTrainingFightTab(state, availableHamsters, selectedHamster, selectedId, selectedStats) {
  return `
    <div class="auto-attack-badge ${selectedHamster ? "active" : ""}">
      ${selectedHamster
        ? `⚡ Авто-атака · 1.3с · ⚔️ ${selectedStats.attack} урону`
        : "Оберіть бійця щоб почати тренування"}
    </div>
    <div class="card" style="margin-top:10px">
      <div class="section-header">
        <span class="label">Боєць</span>
        <span class="tag">${selectedHamster ? escapeHtml(selectedHamster.name) : "—"}</span>
      </div>
      <div class="team-grid" style="margin-top:8px">
        ${availableHamsters.length
          ? availableHamsters.map((h) => {
              const hStats = getHamsterEffectiveStats(h, state);
              return `<button class="select-pill ${h.id === selectedId ? "active" : ""}"
                data-action="select-training-hamster" data-hamster-id="${h.id}">
                ${svgIcon(iconForClass(h.class), "svg-icon svg-icon-xs")} ${escapeHtml(h.name)} · ⚔️${hStats.attack}
              </button>`;
            }).join("")
          : `<p class="muted">Всі хом'яки відпочивають або поранені.</p>`}
      </div>
    </div>
  `;
}

function renderTrainingDummyTab(state, dummy, nextDummy) {
  return `
    <div class="card" style="margin-bottom:10px">
      <div class="card-row"><span>Поточний рівень</span><strong>${dummy.level}</strong></div>
      <div class="card-row"><span>HP за раунд</span><strong>${dummy.hpPerRound}</strong></div>
      <div class="card-row"><span>Нагорода</span><strong>📚 ${dummy.rewardBooks} схованок</strong></div>
    </div>
    ${nextDummy ? `
      <div class="card">
        <div class="section-header">
          <span class="label">⬆️ Поліпшити</span>
          <span class="tag">→ Рівень ${nextDummy.level}</span>
        </div>
        <p class="muted" style="font-size:0.82rem;margin:6px 0">
          ${nextDummy.hpPerRound} HP · 📚 ${nextDummy.rewardBooks} схованок
        </p>
        <div class="tag-row" style="margin:8px 0">
          ${Object.entries(nextDummy.upgradeCost)
            .map(([k, v]) => `<span class="tag">${resourceMeta[k]?.label ?? k}: ${v}</span>`)
            .join("")}
        </div>
        <button class="btn secondary" data-action="upgrade-dummy" ${canUpgradeDummy(state) ? "" : "disabled"}>
          🔨 Поліпшити манекен
        </button>
        ${!canUpgradeDummy(state)
          ? `<p class="muted" style="font-size:0.78rem;margin-top:4px">⚠️ Бракує ресурсів</p>`
          : ""}
      </div>
    ` : `
      <div class="card" style="text-align:center;padding:20px">
        <p style="font-size:2rem">🏆</p>
        <p><strong>Максимальний рівень!</strong></p>
        <p class="muted">Манекен нікуди далі не росте.</p>
      </div>
    `}
  `;
}

function renderTrainingStatsTab(state, totalRounds) {
  const xpBooks = state.resources?.xpBooks ?? 0;
  return `
    <div class="card">
      <div class="card-row"><span>Раундів завершено</span><strong>${totalRounds}</strong></div>
      <div class="card-row"><span>📚 Схованки в коморі</span><strong>${xpBooks}</strong></div>
      <div class="card-row"><span>Рівень манекена</span><strong>${state.training?.dummyLevel ?? 1}</strong></div>
    </div>
  `;
}

function renderResourceBar(state) {
  return `
    <div class="resource-bar" aria-label="Ресурси">
      ${["food", "gold", "xpBooks", "ore", "shiny"].map((key) => renderResourceChip(key, state.resources[key])).join("")}
    </div>
  `;
}

function renderResourceChip(key, value) {
  const meta = resourceMeta[key] ?? { label: key, icon: "item" };
  const label = compactResourceLabel(key, meta.label);
  return `
    <div class="resource-chip resource-${key}" title="${escapeHtml(meta.label)}">
      <span>${svgIcon(meta.icon, "svg-icon svg-icon-xs")} ${label}</span>
      <strong>${formatNumber(value ?? 0)}</strong>
    </div>
  `;
}

function compactResourceLabel(key, label) {
  return {
    xpBooks: "Схов.",
    shiny: "Світ.",
    food: "Їжа",
    gold: "Золото",
    ore: "Руда"
  }[key] ?? label;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Головна навігація">
      <div class="bottom-nav-inner">
        ${navItems.map((item) => `
          <button class="nav-button ${runtimeState.route === item.route ? "is-active" : ""}" data-action="nav" data-route="${item.route}">
            <span class="nav-icon">${svgIcon(item.icon)}</span>
            <span class="nav-label">${t(item.labelKey)}</span>
            <span class="nav-dot"></span>
          </button>
        `).join("")}
      </div>
    </nav>
  `;
}

function renderBuildingCard(building) {
  const disabled = building.level <= 0;
  const navRoute = { workshop: "colony", market: "inventory", map: "expeditions" }[building.id];
  return `
    <article class="building-card ${disabled ? "muted" : ""}">
      <div class="building-icon">${svgIcon(iconForBuilding(building.id))}</div>
      <div>
        <div class="card-row">
          <h3>${building.name}</h3>
          <span class="tag">Lv ${building.level}</span>
        </div>
        <p>${building.description}</p>
        ${navRoute ? `<button class="select-pill" data-action="nav" data-route="${navRoute}">Відкрити</button>` : ""}
      </div>
    </article>
  `;
}

function renderHamsterCard(state, hamster) {
  const stats = getHamsterEffectiveStats(hamster, state);
  const portraitSrc = getHamsterPortrait(hamster);
  return `
    <article class="hamster-card rarity-frame-${rarityClass(hamster.rarity)}" data-action="open-hamster-detail" data-hamster-id="${hamster.id}">
      <div class="hamster-portrait">
        ${portraitSrc
          ? `<img src="${escapeHtml(portraitSrc)}" alt="${escapeHtml(hamster.name)}"
               class="hamster-portrait-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">`
          : ""}
        <div class="hamster-portrait-fallback" style="${portraitSrc ? "display:none" : ""}">
          ${svgIcon(iconForClass(hamster.class), "svg-icon svg-icon-lg")}
          <span>арт скоро</span>
        </div>
      </div>
      <div>
        <div class="card-row">
          <h3>${escapeHtml(hamster.name)}</h3>
          <span class="tag rarity-${rarityClass(hamster.rarity)}">${renderStarRating(hamster.stars)}</span>
        </div>
        <div class="tag-row">
          <span class="tag">${hamster.class}</span>
          <span class="tag">Lv ${hamster.level}</span>
          <span class="tag">C${hamster.constellationLevel ?? 0}/6</span>
          <span class="tag status-${hamster.status}">${t(hamster.status)}</span>
        </div>
        <p>${escapeHtml(hamster.trait)}</p>
        <div class="stat-grid">
          <div class="stat"><span>HP</span><strong>${stats.hp}</strong></div>
          <div class="stat"><span>Урон</span><strong>${stats.attack}</strong></div>
          <div class="stat"><span>Захист</span><strong>${stats.defense}</strong></div>
          <div class="stat"><span>Сила</span><strong>${stats.power}</strong></div>
          <div class="stat"><span>Швидк.</span><strong>${stats.speed}</strong></div>
          <div class="stat"><span>Удача</span><strong>${stats.luck}</strong></div>
        </div>
      </div>
    </article>
  `;
}

function renderConstellationRow(hamster) {
  const level = hamster.constellationLevel ?? 0;
  return `
    <div class="constellation-row" aria-label="Сузір'я">
      ${(hamster.constellations ?? []).map((constellation) => `
        <span class="constellation-node ${constellation.level <= level ? "is-active" : ""}" title="${escapeHtml(constellation.name)}: ${escapeHtml(constellation.description)}">
          ${constellation.level}
        </span>
      `).join("")}
    </div>
  `;
}

function renderZoneCard(zone) {
  const active = runtimeState.selectedZoneId === zone.id;
  return `
    <article class="zone-card ${active ? "is-active" : ""}" data-action="select-zone" data-zone-id="${zone.id}">
      <div class="card-row">
        <h2>${zone.name}</h2>
        <span class="tag">Рівень ${zone.level}</span>
      </div>
      <p>${zone.description}</p>
      <div class="tag-row">
        <span class="tag">Небезпека ${zone.danger}</span>
        <span class="tag">Сила ${zone.requiredPower}</span>
        <span class="tag">Загін до ${zone.maxTeam ?? 3}</span>
        <span class="tag">Рідкісне ${zone.rareChance}%</span>
      </div>
    </article>
  `;
}

function renderDurationOptions(zone) {
  if (!zone) return "";
  const options = [
    zone.minDurationMs,
    Math.round((zone.minDurationMs + zone.maxDurationMs) / 2),
    zone.maxDurationMs
  ];
  return options.map((duration) => `
    <button class="select-pill ${duration === runtimeState.selectedDurationMs ? "is-active" : ""}" data-action="select-duration" data-duration="${duration}">
      ${formatDuration(duration)}
    </button>
  `).join("");
}

function renderTeamPill(hamster) {
  const selected = runtimeState.selectedHamsterIds.includes(hamster.id);
  const selectedZone = findZone(runtimeState.selectedZoneId);
  const maxTeam = selectedZone?.maxTeam ?? 3;
  const teamFull = runtimeState.selectedHamsterIds.length >= maxTeam;
  const unavailable = hamster.status !== "available";
  const disabled = unavailable || (!selected && teamFull);
  const statusClass = unavailable ? `pill-${hamster.status}` : "";
  return `
    <button class="select-pill ${selected ? "is-active" : ""} ${statusClass}" data-action="toggle-hamster" data-hamster-id="${hamster.id}" ${disabled ? "disabled" : ""}>
      ${escapeHtml(hamster.name)} · ${hamster.stars} зірк. · C${hamster.constellationLevel ?? 0}
    </button>
  `;
}

function renderExpeditionSlot(state, expedition) {
  const zone = findZone(expedition.zoneId);
  const progress = calculateProgress(expedition);
  const names = expedition.hamsterIds.map((id) => state.hamsters.find((hamster) => hamster.id === id)?.name).filter(Boolean).join(", ");
  return `
    <article class="expedition-slot" data-status="${expedition.status}" data-expedition-id="${expedition.id}">
      <div class="card-row">
        <h3>${zone?.name ?? expedition.zoneId}</h3>
        ${renderTimerBadge(expedition)}
      </div>
      <p>${names}</p>
      <div class="progress" aria-label="Прогрес експедиції"><span data-progress style="width: ${progress}%"></span></div>
      ${expedition.status === "completed" ? `<button class="btn" data-action="claim-expedition" data-expedition-id="${expedition.id}">${t("claim")}</button>` : ""}
    </article>
  `;
}

function renderUpgradeCard(state, upgrade) {
  const level = getUpgradeLevel(state, upgrade.id);
  const maxed = level >= upgrade.maxLevel;
  const cost = getUpgradeCost(state, upgrade);
  return `
    <article class="upgrade-card">
      <div class="card-row">
        <h3>${upgrade.name}</h3>
        <span class="tag">Lv ${level}/${upgrade.maxLevel}</span>
      </div>
      <p>${upgrade.description}</p>
      <div class="tag-row">
        ${Object.entries(cost).map(([resource, amount]) => `<span class="tag">${resourceMeta[resource]?.label ?? resource} ${amount}</span>`).join("")}
      </div>
      <button class="btn ${maxed ? "ghost" : ""}" data-action="upgrade-colony" data-upgrade-id="${upgrade.id}" ${!maxed && canAfford(state, cost) ? "" : "disabled"}>
        ${maxed ? "Максимум" : "Покращити"}
      </button>
    </article>
  `;
}

function renderEquipmentCard(state, equipment, options = {}) {
  const item = getEquipmentTemplate(equipment);
  if (!item) return "";
  const stats = getEquipmentStats(equipment);
  const owner = equipment.equippedBy ? state.hamsters.find((hamster) => hamster.id === equipment.equippedBy) : null;
  const cost = getEquipmentLevelCost(equipment);
  const requiresFodder = needsFodder(equipment);
  const fodder = requiresFodder ? findFodderEquipment(state, equipment) : null;
  return `
    <article class="inventory-card rarity-frame-${rarityClass(item.rarity)}">
      <div class="item-icon">${svgIcon(iconForItemType(item.type))}</div>
      <div>
        <div class="card-row">
          <h3>${item.name}</h3>
          <span class="tag">${renderStarRating(item.stars)}</span>
        </div>
        <div class="tag-row">
          <span class="tag">Lv ${equipment.level}/${equipment.maxLevel}</span>
          <span class="tag">${slotLabel(item.equipmentSlot)}</span>
          ${item.signatureFor ? `<span class="tag">Сигнатурна</span>` : ""}
          ${owner ? `<span class="tag">На ${escapeHtml(owner.name)}</span>` : ""}
        </div>
        <p>${Object.entries(stats).map(([stat, value]) => `${statLabel(stat)} +${value}`).join(" · ")}</p>
        <div class="tag-row">
          <span class="tag">Ціна: золото ${cost.gold}, руда ${cost.ore}</span>
          ${requiresFodder ? `<span class="tag">${fodder ? "Матеріал є" : "Потрібен предмет того ж слота"}</span>` : ""}
        </div>
        <div class="button-row">
          <button class="btn" data-action="upgrade-equipment" data-equipment-uid="${equipment.uid}" ${canUpgradeEquipment(state, equipment) ? "" : "disabled"}>Прокачати</button>
          ${owner || options.hideSalvage ? "" : `<button class="btn ghost" data-action="salvage-equipment" data-equipment-uid="${equipment.uid}">В руду</button>`}
        </div>
      </div>
    </article>
  `;
}

function renderInventoryItemCard(entry) {
  return `
    <article class="inventory-card rarity-frame-${rarityClass(entry.item.rarity)}">
      <div class="item-icon">${svgIcon(iconForItemType(entry.item.type))}</div>
      <div>
        <div class="card-row">
          <h3>${entry.item.name}</h3>
          <span class="tag">x${entry.quantity}</span>
        </div>
        <div class="tag-row">
          <span class="tag rarity-${rarityClass(entry.item.rarity)}">${renderStarRating(entry.item.stars ?? 1)}</span>
          <span class="tag">${entry.item.type}</span>
        </div>
        <p>${entry.item.description}</p>
      </div>
    </article>
  `;
}

function renderQuestCard(quest) {
  const progress = Math.round((quest.progress / quest.target) * 100);
  return `
    <article class="quest-card">
      <div class="card-row">
        <h3>${quest.title}</h3>
        <span class="tag">${quest.type}</span>
      </div>
      <div class="progress"><span style="width: ${progress}%"></span></div>
      <p>${quest.progress}/${quest.target}</p>
      <button class="btn ${quest.claimed ? "ghost" : ""}" data-action="claim-quest" data-quest-id="${quest.id}" ${quest.completed && !quest.claimed ? "" : "disabled"}>
        ${quest.claimed ? "Отримано" : "Забрати нагороду"}
      </button>
    </article>
  `;
}

function renderGachaResultCard(result) {
  const hamster = result.type === "hamster" ? dataStore.hamsters.find((candidate) => candidate.id === result.id) : null;
  const portraitSrc = hamster ? getHamsterPortrait(hamster) : null;
  const item = result.item ?? findItem(result.id);
  const fallbackIcon = hamster ? iconForClass(hamster.class) : iconForItemType(item?.type ?? "resource_pack");
  const extra = result.status === "constellation"
    ? `C${result.constellationLevel} · ${result.passive?.name ?? "пасив"}`
    : result.status === "refund"
      ? "Компенсація ресурсами"
      : result.status === "new"
        ? "Новий хом'як"
        : result.status === "equipment"
          ? "Екіпіровка"
          : "Предмет";
  return `
    <article class="gacha-result-card ${result.stars >= 5 ? "is-prize" : ""} rarity-frame-${rarityClass(result.rarity)}">
      <div class="gacha-result-art">
        ${portraitSrc
          ? `<img src="${escapeHtml(portraitSrc)}" alt="${escapeHtml(result.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'">`
          : ""}
        <span style="${portraitSrc ? "display:none" : ""}">${svgIcon(fallbackIcon, "svg-icon svg-icon-lg")}</span>
      </div>
      <div class="gacha-result-info">
        <div class="card-row">
          <h3>${escapeHtml(result.name)}</h3>
          <span class="tag">${renderStarRating(result.stars)}</span>
        </div>
        <p>${extra}</p>
      </div>
    </article>
  `;
}

function renderModal(state) {
  if (!runtimeState.modal) return "";
  const { type, payload } = runtimeState.modal;
  if (type === "export") return renderExportModal(payload.saveText);
  if (type === "import") return renderImportModal();
  return "";
}

function renderExportModal(saveText) {
  return modalShell("Експорт save", `
    <p>Скопіюйте цей код для перенесення прогресу.</p>
    <textarea class="save-text" readonly>${escapeHtml(saveText)}</textarea>
  `);
}

function renderImportModal() {
  return modalShell("Імпорт save", `
    <p>Вставте експортований код і підтвердьте імпорт.</p>
    <textarea class="save-text" data-role="import-save" placeholder="Save code"></textarea>
    <button class="btn" data-action="confirm-import">Імпортувати</button>
  `);
}

function renderResultModal(result) {
  if (!result) return "";
  const itemList = result.items.length
    ? result.items.map((entry) => {
        const item = findItem(entry.itemId);
        return `<span class="tag">${svgIcon(iconForItemType(item?.type), "svg-icon svg-icon-xs")} ${item?.name ?? entry.itemId} x${entry.quantity}</span>`;
      }).join("")
    : `<span class="tag">Без предметів</span>`;
  return modalShell(result.title, `
    <p>${result.text}</p>
    <div class="card">
      <h3>Ресурси</h3>
      <div class="tag-row">
        ${Object.entries(result.resources).length ? Object.entries(result.resources).map(([key, value]) => `<span class="tag">${resourceMeta[key]?.label ?? key} +${value}</span>`).join("") : `<span class="tag">Без ресурсів</span>`}
      </div>
    </div>
    <div class="card">
      <h3>Предмети</h3>
      <div class="tag-row">${itemList}</div>
    </div>
    <div class="card">
      <span class="tag">XP +${result.xp}</span>
      <span class="tag">${t(result.hamsterStatus)}</span>
    </div>
  `);
}

function renderGachaResultModal(results = []) {
  return modalShell("Результати гачі", `
    <div class="stack">
      ${results.map(renderGachaResultCard).join("")}
    </div>
  `);
}

function renderHamsterDetailModal(state, hamsterId) {
  const hamster = state.hamsters.find((candidate) => candidate.id === hamsterId);
  if (!hamster) return "";
  const stats = getHamsterEffectiveStats(hamster, state);
  const cost = getHamsterLevelCost(hamster);
  const equipment = getHamsterEquipment(state, hamster);
  const signatureOwned = state.equipment.some((entry) => entry.itemId === hamster.signatureWeaponId);
  const signatureEquipped = Object.values(equipment).some((entry) => entry?.itemId === hamster.signatureWeaponId);

  return modalShell(`${svgIcon(iconForClass(hamster.class))} ${escapeHtml(hamster.name)}`, `
    <div class="card">
      <div class="card-row">
        <div>
          <h3>Рівень ${hamster.level}/${hamster.maxLevel ?? 90}</h3>
          <p>${hamster.class} · C${hamster.constellationLevel ?? 0}/6 · ${renderStarRating(hamster.stars)}</p>
        </div>
        <span class="tag">${signatureEquipped ? "Сигнатурка активна" : signatureOwned ? "Сигнатурка є" : "Сигнатурка не випала"}</span>
      </div>
      <div class="stat-grid">
        <div class="stat"><span>HP</span><strong>${stats.hp}</strong></div>
        <div class="stat"><span>Урон</span><strong>${stats.attack}</strong></div>
        <div class="stat"><span>Захист</span><strong>${stats.defense}</strong></div>
        <div class="stat"><span>Сила</span><strong>${stats.power}</strong></div>
        <div class="stat"><span>Швидк.</span><strong>${stats.speed}</strong></div>
        <div class="stat"><span>Удача</span><strong>${stats.luck}</strong></div>
      </div>
      <div class="tag-row">
        <span class="tag">Прокачка: золото ${cost.gold}</span>
        <span class="tag">книги XP ${cost.xpBooks}</span>
      </div>
      <button class="btn" data-action="level-hamster" data-hamster-id="${hamster.id}" ${canLevelHamster(state, hamster) ? "" : "disabled"}>Прокачати рівень</button>
    </div>
    <div class="stack">
      ${EQUIPMENT_SLOTS.map((slot) => renderEquipmentSlot(state, hamster, slot, equipment[slot])).join("")}
    </div>
  `);
}

function renderEquipmentSlot(state, hamster, slot, equipment) {
  const available = getAvailableEquipmentForSlot(state, slot, hamster.id)
    .filter((entry) => entry.uid !== equipment?.uid)
    .slice(0, 4);
  const item = equipment ? getEquipmentTemplate(equipment) : null;
  return `
    <div class="card">
      <div class="card-row">
        <h3>${slotLabel(slot)}</h3>
        ${item ? `<span class="tag">${renderStarRating(item.stars)}</span>` : `<span class="tag">Порожньо</span>`}
      </div>
      ${equipment ? renderEquippedInline(equipment) : `<p>Слот вільний.</p>`}
      ${equipment ? `<button class="btn ghost" data-action="unequip-slot" data-hamster-id="${hamster.id}" data-slot="${slot}">Зняти</button>` : ""}
      <div class="tag-row">
        ${available.length ? available.map((entry) => {
          const candidate = getEquipmentTemplate(entry);
          return `<button class="select-pill" data-action="equip-item" data-hamster-id="${hamster.id}" data-equipment-uid="${entry.uid}">${candidate.name} · Lv ${entry.level}</button>`;
        }).join("") : `<span class="tag">Немає доступної екіпіровки</span>`}
      </div>
    </div>
  `;
}

function renderEquippedInline(equipment) {
  const item = getEquipmentTemplate(equipment);
  const stats = getEquipmentStats(equipment);
  return `
    <div class="equipment-inline">
      <div class="item-icon">${svgIcon(iconForItemType(item.type))}</div>
      <div>
        <strong>${item.name}</strong>
        <div class="tag-row">
          <span class="tag">Lv ${equipment.level}/${equipment.maxLevel}</span>
          <span class="tag">${renderStarRating(item.stars)}</span>
        </div>
        <p>${Object.entries(stats).map(([stat, value]) => `${statLabel(stat)} +${value}`).join(" · ")}</p>
      </div>
    </div>
  `;
}

function renderSimpleModal(title, body) {
  return modalShell(title, body);
}

function modalShell(title, body) {
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" data-stop-close>
        <header class="modal-header">
          <h2>${title}</h2>
          <button class="icon-btn" data-action="close-modal">${svgIcon("close")}</button>
        </header>
        <div class="modal-body">${body}</div>
      </section>
    </div>
  `;
}

function renderToasts() {
  if (!runtimeState.toasts.length) return "";
  return `<div class="toast-stack">${runtimeState.toasts.map((toast) => `<div class="toast">${escapeHtml(toast.message)}</div>`).join("")}</div>`;
}

function renderTimerBadge(expedition) {
  if (expedition.status === "completed") return `<span class="timer-badge" data-timer>Готово</span>`;
  return `<span class="timer-badge" data-timer>${formatRemaining(expedition.endTime - Date.now())}</span>`;
}

function calculateProgress(expedition) {
  const elapsed = Date.now() - expedition.startTime;
  return Math.round(Math.min(100, Math.max(0, (elapsed / expedition.durationMs) * 100)));
}

export function formatRemaining(ms) {
  if (ms <= 0) return "Готово";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}г ${minutes}хв`;
  if (minutes) return `${minutes}хв ${seconds}с`;
  return `${seconds}с`;
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}г ${rest}хв` : `${hours}г`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("uk-UA").format(value);
}

function renderStarRating(stars) {
  return `<span class="star-rating" aria-label="${stars} зірок">${Array.from({ length: stars }, () => svgIcon("gacha", "svg-icon svg-icon-star")).join("")}</span>`;
}

function slotLabel(slot) {
  return {
    weapon: "Зброя",
    armor: "Броня",
    backpack: "Рюкзак",
    tool: "Інструмент",
    charm: "Талісман"
  }[slot] ?? slot;
}

function statLabel(stat) {
  return {
    hp: "HP",
    attack: "урон",
    defense: "захист",
    power: "сила",
    speed: "швидкість",
    luck: "удача",
    carry: "вантаж",
    stamina: "витривалість",
    signatureDamageBonus: "сигн. урон"
  }[stat] ?? stat;
}

function rarityClass(rarity) {
  return String(rarity).toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

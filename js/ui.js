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
import { attachTrainingCanvas, detachTrainingCanvas, CANVAS_DISPLAY_H, attachDummyCanvas, detachDummyCanvas, CANVAS_DUMMY_H, attachPreviewCanvas, detachPreviewCanvas, CANVAS_PREVIEW_H } from "./sprite.js";

const navItems = [
  { route: "base",        icon: "base",      labelKey: "base" },
  { route: "hamsters",    icon: "hamster",   labelKey: "hamsters" },
  { route: "expeditions", icon: "map",       labelKey: "expeditions" },
  { route: "training",    icon: "power",     labelKey: "training" },
  { route: "gacha",       icon: "gacha",     labelKey: "gacha" },
];

const MARKET_SHINY_TRADE = Object.freeze({
  cost: { gold: 90 },
  reward: { shiny: 10 }
});

const buildingConfig = {
  storage: {
    role: "Запаси",
    upgradeIds: ["passive_income"],
    primary: { label: "Відкрити комору", action: "nav", attrs: `data-route="inventory"` },
    secondary: [{ label: "Зібрати дохід", action: "collect-passive" }]
  },
  kitchen: {
    role: "Пасивний дохід",
    upgradeIds: ["passive_income"],
    primary: { label: "Зібрати їжу", action: "collect-passive" },
    secondary: [{ label: "Покращити комірки", action: "upgrade-colony", upgradeId: "passive_income" }]
  },
  workshop: {
    role: "Спорядження",
    upgradeIds: [],
    primary: { label: "Відкрити спорядження", action: "nav", attrs: `data-route="inventory"` }
  },
  barracks: {
    role: "Тренування",
    upgradeIds: [],
    primary: { label: "До манекена", action: "nav", attrs: `data-route="training"` }
  },
  map: {
    role: "Вилазки",
    upgradeIds: ["expedition_speed", "multicast"],
    primary: { label: "Обрати маршрут", action: "nav", attrs: `data-route="expeditions"` },
    secondary: [
      { label: "Швидші тунелі", action: "upgrade-colony", upgradeId: "expedition_speed" },
      { label: "Більше загонів", action: "upgrade-colony", upgradeId: "multicast" }
    ]
  },
  lab: {
    role: "Гача-шанс",
    upgradeIds: ["gacha_luck"],
    primary: { label: "Покращити маяк", action: "upgrade-colony", upgradeId: "gacha_luck" },
    secondary: [{ label: "До гачі", action: "nav", attrs: `data-route="gacha"` }]
  },
  market: {
    role: "Обмін",
    upgradeIds: [],
    primary: { label: "Купити 10 світяшок", action: "trade-market-shiny" },
    secondary: [{ label: "Комора", action: "nav", attrs: `data-route="inventory"` }]
  },
  nest: {
    role: "Колекція",
    upgradeIds: [],
    primary: { label: "Дивитись хом'яків", action: "nav", attrs: `data-route="hamsters"` },
    secondary: [{ label: "Покликати листом", action: "nav", attrs: `data-route="gacha"` }]
  }
};

const onboardingSteps = [
  {
    icon: "hamster",
    kicker: "Швидкий старт",
    title: "Що тут робити",
    body: "Зараз я проведу тебе по грі, але клікати будеш ти. Навчання не скидає прогрес і працює поверх твого акаунта.",
    task: "Натисни «Почати», потім виконуй підсвічені дії.",
    align: "center",
    mode: "button"
  },
  {
    icon: "map",
    kicker: "Клік 1",
    title: "Відкрий вилазки",
    body: "Вилазки — головне джерело ресурсів, світяшок і предметів.",
    task: "Натисни кнопку «Вилазки» в нижньому меню.",
    align: "top",
    mode: "action"
  },
  {
    icon: "map",
    kicker: "Клік 2",
    title: "Обери маршрут",
    body: "Маршрут задає небезпеку, потрібну силу та шанс рідкісної здобичі.",
    task: "Натисни будь-яку картку маршруту. Активний маршрут підсвітиться.",
    align: "bottom"
  },
  {
    icon: "power",
    kicker: "Клік 3",
    title: "Вибери тривалість",
    body: "Довша вилазка займає більше часу, але дає більше трофеїв і світяшок.",
    task: "Натисни один із варіантів тривалості.",
    align: "top"
  },
  {
    icon: "hamster",
    kicker: "Клік 4",
    title: "Додай хом'яка в загін",
    body: "Вільні хом'яки можуть піти в дорогу. Поранені або зайняті тимчасово недоступні.",
    task: "Натисни хом'яка у блоці «Загін».",
    align: "top"
  },
  {
    icon: "check",
    kicker: "Клік 5",
    title: "Відправ загін",
    body: "Коли маршрут, час і хом'як вибрані, кнопка «Вирушати» стане активною.",
    task: "Натисни «Вирушати!». Якщо всі слоти зайняті, спершу забери готові трофеї.",
    align: "top"
  },
  {
    icon: "power",
    kicker: "Клік 6",
    title: "Відкрий тренування",
    body: "Поки один загін у дорозі, інші хом'яки можуть тренуватися на манекені.",
    task: "Натисни «Тренування» в нижньому меню.",
    align: "top"
  },
  {
    icon: "hamster",
    kicker: "Клік 7",
    title: "Обери бійця",
    body: "Обраний хом'як почне автоатакувати манекен і заробляти схованки XP.",
    task: "Натисни будь-якого вільного хом'яка у списку бійців.",
    align: "top"
  },
  {
    icon: "gacha",
    kicker: "Клік 8",
    title: "Відкрий гачу",
    body: "Світяшки з вилазок і доручень витрачаються на листи з хом'яками та спорядженням.",
    task: "Натисни «Гача» в нижньому меню.",
    align: "top"
  },
  {
    icon: "gacha",
    kicker: "Готово",
    title: "Ти пройшов основний цикл",
    body: "Тепер ти вручну відкрив вилазки, вибрав маршрут, відправив загін, зайшов у тренування і дійшов до гачі.",
    task: "Далі повторюй цикл: вилазка, трофеї, тренування, нові бійці.",
    align: "top",
    mode: "button",
    done: true
  }
];

export function renderApp(state) {
  const app = document.querySelector("#app");
  app.innerHTML = `
    ${renderScreen(state)}
    ${renderBottomNav()}
    ${renderOnboardingOverlay(state)}
    ${renderModal(state)}
    ${renderToasts()}
  `;
  _syncTrainingCanvases(state);
  _syncHamsterPreviewCanvas(state);
  _syncTutorialTarget();
}

function _syncHamsterPreviewCanvas(state) {
  const canvas = document.querySelector("#hamster-preview-canvas");
  if (!canvas) {
    detachPreviewCanvas();
    return;
  }

  const hamster = state?.hamsters?.find((h) => h.id === runtimeState.expandedHamsterId);
  const slug = getHamsterSlug(hamster);
  if (slug && getHamsterSpriteConfig(hamster)) {
    attachPreviewCanvas(canvas, slug);
    return;
  }

  detachPreviewCanvas();
}

function _syncTrainingCanvases(state) {
  // ── Hamster canvas ───────────────────────────────────────────────────────
  const canvas = document.querySelector("#training-sprite-canvas");
  if (!canvas) {
    detachTrainingCanvas();
  } else {
    const sid = runtimeState.trainingHamsterId;
    if (sid) {
      const ham = state?.hamsters?.find((h) => h.id === sid);
      if (ham) {
        const slug = getHamsterSlug(ham);
        if (slug && getHamsterSpriteConfig(ham)) {
          const isAttacking = !!(runtimeState.lastHitInfo?.timestamp && Date.now() - runtimeState.lastHitInfo.timestamp < 260);
          attachTrainingCanvas(canvas, slug, isAttacking);
        }
      }
    }
  }

  // ── Dummy canvas ─────────────────────────────────────────────────────────
  const dummyCanvas = document.querySelector("#training-dummy-canvas");
  if (!dummyCanvas) {
    detachDummyCanvas();
  } else {
    const isBeingHit = !!(runtimeState.lastHitInfo?.timestamp && Date.now() - runtimeState.lastHitInfo.timestamp < 450);
    dummyCanvas.classList.toggle("dummy-hit", isBeingHit);
    attachDummyCanvas(dummyCanvas, isBeingHit);
  }
}

function _syncTutorialTarget() {
  if (runtimeState.onboardingStep === null || runtimeState.onboardingStep === undefined) return;
  requestAnimationFrame(() => {
    const target = document.querySelector(".tutorial-target");
    if (!target || target.classList.contains("bottom-nav")) return;

    const rect = target.getBoundingClientRect();
    const safeTop = 96;
    const safeBottom = window.innerHeight - 150;
    if (rect.top < safeTop || rect.bottom > safeBottom) {
      target.scrollIntoView({ block: "center", behavior: "auto" });
    }
  });
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

function renderActionGuide(state) {
  const completed = state.expeditions.find((expedition) => expedition.status === "completed");
  if (completed) {
    const zone = findZone(completed.zoneId);
    return renderGuideCard({
      icon: "collect",
      title: "Забери готові трофеї",
      text: `${zone?.name ?? "Вилазка"} вже завершена. Натисни «Забрати», щоб отримати ресурси, XP і світяшки.`,
      action: "claim-expedition",
      actionAttrs: `data-expedition-id="${completed.id}"`,
      label: "Забрати трофеї",
      ready: true
    });
  }

  const active = state.expeditions.some((expedition) => expedition.status === "active");
  if (!active) {
    return renderGuideCard({
      icon: "map",
      title: "Почни з вилазки",
      text: "Обери маршрут, додай хом'яка в загін і відправ його по трофеї. Це головне джерело ресурсів.",
      action: "nav",
      actionAttrs: `data-route="expeditions"`,
      label: "Відкрити вилазки",
      ready: true
    });
  }

  const hasTraining = Boolean(runtimeState.trainingHamsterId || state.training?.activeHamsterId);
  if (!hasTraining) {
    return renderGuideCard({
      icon: "power",
      title: "Запусти тренування",
      text: "Поки загін у дорозі, вільний хом'як може бити манекен і приносити схованки XP.",
      action: "nav",
      actionAttrs: `data-route="training"`,
      label: "До тренування"
    });
  }

  const banner = getSelectedBanner(state);
  const singleCost = banner?.cost?.single?.shiny ?? banner?.cost?.single?.coins ?? Infinity;
  if ((state.resources.shiny ?? 0) >= singleCost) {
    return renderGuideCard({
      icon: "gacha",
      title: "Вистачає світяшок на лист",
      text: "Можна спробувати отримати нового хом'яка або спорядження для загону.",
      action: "nav",
      actionAttrs: `data-route="gacha"`,
      label: "Відкрити гачу",
      ready: true
    });
  }

  return renderGuideCard({
    icon: "colony",
    title: "Підсилюй нору",
    text: "Покращення колонії дають пасивний дохід, більше слотів загонів і швидші повернення.",
    action: "nav",
    actionAttrs: `data-route="colony"`,
    label: "Покращення"
  });
}

function renderGuideCard({ icon, title, text, action, actionAttrs = "", label, ready = false }) {
  return `
    <section class="guide-card ${ready ? "is-ready" : ""}">
      <div class="guide-icon">${svgIcon(icon)}</div>
      <div class="guide-copy">
        <p class="guide-kicker">Що робити зараз</p>
        <h2>${title}</h2>
        <p>${text}</p>
      </div>
      <button class="btn ${ready ? "is-ready-action" : "secondary"}" data-action="${action}" ${actionAttrs}>${label}</button>
    </section>
  `;
}

function renderExpeditionGuide(selectedCount, maxTeam, canLaunch, hasFreeSlot) {
  const status = !hasFreeSlot
    ? "Немає вільного слота. Дочекайся повернення загону або забери готові трофеї."
    : canLaunch
      ? "Загін готовий. Можна вирушати."
      : selectedCount > 0
        ? "Можна додати ще хом'яків або відправити поточний загін."
        : "Обери маршрут, тривалість і хоча б одного хом'яка.";

  return `
    <section class="guide-card expedition-guide">
      <div class="guide-copy">
        <p class="guide-kicker">Порядок дій</p>
        <div class="step-rail" aria-label="Кроки запуску вилазки">
          <span class="step-pill is-done">1 Маршрут</span>
          <span class="step-pill is-done">2 Час</span>
          <span class="step-pill ${selectedCount ? "is-done" : "is-current"}">3 Загін ${selectedCount}/${maxTeam}</span>
          <span class="step-pill ${canLaunch ? "is-current" : ""}">4 Вирушати</span>
        </div>
        <p>${status}</p>
      </div>
    </section>
  `;
}

function renderBaseScreen(state) {
  if (runtimeState.showSettings) return renderSettingsScreen(state);

  const active = state.expeditions.filter((expedition) => expedition.status === "active" || expedition.status === "completed");
  const slots = `${getUsedExpeditionSlots(state)}/${getMaxExpeditionSlots(state)}`;
  const result = runtimeState.expeditionResult;
  const guide = renderActionGuide(state);
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
          <button class="btn" data-action="nav" data-route="expeditions">${svgIcon("map")} ${t("expeditions")}</button>
          <button class="btn secondary" data-action="nav" data-route="colony">${svgIcon("colony")} ${t("colony")}</button>
        </div>
      </section>

      ${guide}

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
          ${dataStore.buildings.map((building) => renderBuildingCard(state, building)).join("")}
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
          <div class="card-row"><span>Навчання</span><strong>6 кроків</strong></div>
          <p class="muted">Повторити короткий тур по вилазках, тренуванню, ресурсах і гачі.</p>
          <button class="btn ghost" data-action="restart-onboarding">Показати навчання</button>
        </div>
        <div class="card">
          <div class="stack">
            <button class="btn ghost" data-action="toggle-setting" data-setting="sound">
              ${svgIcon("power")} Звук: ${state.settings.sound ? "увімкнено" : "вимкнено"}
            </button>
            <button class="btn ghost" data-action="toggle-setting" data-setting="music">
              ${svgIcon("settings")} Музика: ${state.settings.music ? "увімкнено" : "вимкнено"}
            </button>
            <button class="btn ghost" data-action="toggle-setting" data-setting="performanceMode">
              ${svgIcon("power")} Режим продуктивності: ${state.settings.performanceMode ? "увімкнено" : "вимкнено"}
            </button>
          </div>
        </div>
        <div class="card">
          <h3>Збереження</h3>
          <p class="muted">Перенеси прогрес на інший пристрій або завантаж резервну копію.</p>
          <div class="button-row">
            <button class="btn secondary" data-action="open-export">Вивантажити</button>
            <button class="btn secondary" data-action="open-import">Завантажити</button>
          </div>
        </div>
        <div class="card">
          <h3>Небезпечна зона</h3>
          <p class="muted">Скидання видалить весь прогрес нори. Без зворотного шляху.</p>
          <button class="btn danger-btn" data-action="reset-game">${svgIcon("danger")} Скинути прогрес</button>
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
  const hasSprite = !!getHamsterSpriteConfig(hamster);
  const portraitSrc = getHamsterPortrait(hamster);
  const signatureLabel = signatureEquipped ? "Сигнатурка активна" : signatureOwned ? "Сигнатурка є" : "Сигнатурка не знайдена";
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

      <section class="character-overview rarity-frame-${rarityClass(hamster.rarity)}">
        <aside class="character-constellation-panel">
          <p class="panel-label">Сузір'я</p>
          ${renderCharacterConstellations(hamster)}
        </aside>

        <div class="character-stage">
          <div class="character-stage-art">
            ${hasSprite
              ? `<canvas id="hamster-preview-canvas" class="character-preview-canvas" style="height:${CANVAS_PREVIEW_H}px;display:block;image-rendering:pixelated"></canvas>`
              : `
                <img class="character-preview-img" src="${escapeHtml(portraitSrc)}" alt="${escapeHtml(hamster.name)}"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'">
                <div class="character-preview-fallback" style="display:none">
                  ${svgIcon(iconForClass(hamster.class), "svg-icon svg-icon-lg")}
                </div>
              `}
          </div>
          <div class="character-stage-meta">
            <div>
              <p class="muted">Рівень ${hamster.level}/${hamster.maxLevel ?? 90}</p>
              <h3>${escapeHtml(hamster.trait)}</h3>
            </div>
            <span class="tag status-${hamster.status}">${t(hamster.status)}</span>
          </div>
          <div class="tag-row character-cost-row">
            <span class="tag">${svgIcon("seed", "svg-icon svg-icon-xs")} Насіння ${cost.gold}</span>
            <span class="tag">${svgIcon("quests", "svg-icon svg-icon-xs")} Схованки ${cost.xpBooks}</span>
          </div>
          <button class="btn" data-action="level-hamster" data-hamster-id="${hamster.id}" ${canLevelHamster(state, hamster) ? "" : "disabled"}>
            Підняти рівень
          </button>
        </div>

        <aside class="character-stats-panel">
          <p class="panel-label">Стати</p>
          <span class="tag">${signatureLabel}</span>
          ${renderCharacterStats(stats)}
        </aside>

        <div class="character-slot-row" aria-label="Слоти спорядження">
          ${EQUIPMENT_SLOTS.map((slot) => renderCharacterSlot(state, hamster, slot, equipment[slot])).join("")}
        </div>
      </section>

      <section class="section character-equipment-panel">
        <div class="section-header">
          <h2>Спорядження</h2>
          <span class="tag">Слотів ${EQUIPMENT_SLOTS.length}</span>
        </div>
        <div class="stack compact-stack">
          ${EQUIPMENT_SLOTS.map((slot) => renderCharacterEquipmentControls(state, hamster, slot, equipment[slot])).join("")}
        </div>
      </section>
    </main>
  `;
}

function renderCharacterConstellations(hamster) {
  const level = hamster.constellationLevel ?? 0;
  return `
    <div class="character-constellation-list">
      ${(hamster.constellations ?? []).map((constellation) => `
        <div class="character-constellation ${constellation.level <= level ? "is-active" : ""}">
          <span>C${constellation.level}</span>
          <strong>${escapeHtml(constellation.name)}</strong>
          <small>${escapeHtml(constellation.description)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCharacterStats(stats) {
  const entries = [
    ["HP", stats.hp],
    ["Урон", stats.attack],
    ["Захист", stats.defense],
    ["Сила", stats.power],
    ["Швидк.", stats.speed],
    ["Удача", stats.luck],
    ["Вантаж", stats.carry],
    ["Витрив.", stats.stamina]
  ];

  return `
    <div class="character-stat-list">
      ${entries.map(([label, value]) => `
        <div class="character-stat-row">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCharacterSlot(state, hamster, slot, equipment) {
  const item = equipment ? getEquipmentTemplate(equipment) : null;
  const quickEquip = !equipment ? getAvailableEquipmentForSlot(state, slot, hamster.id)[0] : null;
  const quickItem = quickEquip ? getEquipmentTemplate(quickEquip) : null;
  const attrs = equipment
    ? `data-action="unequip-slot" data-hamster-id="${hamster.id}" data-slot="${slot}"`
    : quickEquip
      ? `data-action="equip-item" data-hamster-id="${hamster.id}" data-equipment-uid="${quickEquip.uid}"`
      : "disabled";
  const icon = iconForItemType(item?.type ?? quickItem?.type ?? slot);
  return `
    <button class="character-slot ${equipment ? "is-filled" : ""}" ${attrs} title="${escapeHtml(item?.name ?? quickItem?.name ?? slotLabel(slot))}">
      ${svgIcon(icon, "svg-icon")}
      <span>${slotLabel(slot)}</span>
      <strong>${item ? `Lv ${equipment.level}` : quickItem ? "Одягти" : "Пусто"}</strong>
    </button>
  `;
}

function renderCharacterEquipmentControls(state, hamster, slot, equipment) {
  const available = getAvailableEquipmentForSlot(state, slot, hamster.id)
    .filter((entry) => entry.uid !== equipment?.uid)
    .slice(0, 3);
  const item = equipment ? getEquipmentTemplate(equipment) : null;

  return `
    <article class="character-equipment-row">
      <div>
        <p class="panel-label">${slotLabel(slot)}</p>
        <strong>${item ? escapeHtml(item.name) : "Слот вільний"}</strong>
      </div>
      <div class="character-equipment-actions">
        ${equipment ? `<button class="select-pill" data-action="unequip-slot" data-hamster-id="${hamster.id}" data-slot="${slot}">Зняти</button>` : ""}
        ${available.length ? available.map((entry) => {
          const candidate = getEquipmentTemplate(entry);
          return `<button class="select-pill" data-action="equip-item" data-hamster-id="${hamster.id}" data-equipment-uid="${entry.uid}">${escapeHtml(candidate.name)} · Lv ${entry.level}</button>`;
        }).join("") : `<span class="tag">Немає предметів</span>`}
      </div>
    </article>
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

      ${renderExpeditionGuide(selectedCount, maxTeam, canLaunch, hasFreeSlot)}

      <section class="section stack">
        ${dataStore.zones.filter((zone) => state.unlockedZones.includes(zone.id)).map((zone) => renderZoneCard(zone)).join("")}
      </section>

      <section class="section card ${isTutorialStep(3) ? "tutorial-target" : ""}">
        <div class="section-header">
          <h2>Тривалість</h2>
          <span class="tag">${formatDuration(runtimeState.selectedDurationMs)}</span>
        </div>
        <div class="duration-row">
          ${renderDurationOptions(selectedZone)}
        </div>
      </section>

      <section class="section card ${isTutorialStep(4) ? "tutorial-target" : ""}">
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
        <button class="btn ${canLaunch ? "is-ready-action" : ""} ${isTutorialStep(5) ? "tutorial-target" : ""}" data-action="launch-expedition" ${canLaunch ? "" : "disabled"}>${t("send")}</button>
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
          <div class="stat"><span>Крихти/хв</span><strong>${stats.passiveIncomePerMin.food ?? 0}</strong></div>
          <div class="stat"><span>Тріски/хв</span><strong>${stats.passiveIncomePerMin.wood ?? 0}</strong></div>
          <div class="stat"><span>Насіння/хв</span><strong>${stats.passiveIncomePerMin.gold ?? 0}</strong></div>
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
          <h2>Кузня</h2>
          <span class="tag">Скоро</span>
        </div>
        <div class="empty-state">
          <span class="empty-icon">${svgIcon("craft", "svg-icon svg-icon-lg")}</span>
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

      <section class="hero-panel hero-gacha ${isTutorialStep(9) ? "tutorial-target" : ""}">
        <div class="top-row">
          <div>
            <h1>${t("gacha")}</h1>
            <p class="muted">${banner.name}</p>
          </div>
          <span class="shiny-counter">${svgIcon("shiny", "svg-icon svg-icon-xs")} ${shiny}</span>
        </div>
        <p>${banner.description}</p>
        <div class="gacha-pity-bar">
          <div class="gacha-pity-fill" style="width:${pityPercent}%"></div>
        </div>
        <p class="gacha-pity-note">Гарант 5 зірок: ${state.gacha.pity5}/${banner.pity.fiveStarEvery} листів · м'який шанс з ${softPityStart}</p>
        <div class="gacha-economy-row">
          <span class="tag">Вилазка: світяшки 2-12+</span>
          <span class="tag">Блиск у щілині: світяшки 3+</span>
          <span class="tag">Щоденні: світяшки 8</span>
          <span class="tag">${pullsToTen ? `До 10 листів: ${pullsToTen}` : "10 листів готові"}</span>
        </div>
        <div class="button-row">
          <button class="btn" data-action="pull-gacha" data-count="1" ${canSingle ? "" : "disabled"}>
            ${svgIcon("shiny")} 1 лист · ${singleCost}
          </button>
          <button class="btn secondary" data-action="pull-gacha" data-count="10" ${canTen ? "" : "disabled"}>
            ${svgIcon("shiny")} 10 листів · ${tenCost}
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
          <span class="tag">${svgIcon("hamster", "svg-icon svg-icon-xs")} 4 зірки ${banner.hamsterStars["4"]}%</span>
          <span class="tag">${svgIcon("hamster", "svg-icon svg-icon-xs")} 5 зірок ${banner.hamsterStars["5"]}%</span>
          <span class="tag">${svgIcon("item", "svg-icon svg-icon-xs")} предмети 1-5 зірок</span>
          <span class="tag">Гарант кожні ${banner.pity.fiveStarEvery}</span>
          <span class="tag">М'який шанс ${softPityStart}+</span>
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
          <h2>Обмін</h2>
          <span class="tag">Скоро</span>
        </div>
        <div class="empty-state">
          <span class="empty-icon">${svgIcon("market", "svg-icon svg-icon-lg")}</span>
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
  const rarityNames = ["common", "uncommon", "rare", "epic", "legendary"];

  return `
    <main class="screen">
      ${renderResourceBar(state)}

      <div class="training-title-row">
        <h2>${t("training")}</h2>
        <span class="muted" style="font-size:0.8rem">${totalRounds} раундів</span>
      </div>

      <div class="training-arena">
        <!-- Один спільний контейнер: хом'як + манекен без розділення на колонки -->
        <div class="arena-stage ${selectedHamster ? "has-fighter" : ""} ${isAttacking ? "has-hit" : ""}">
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
              <span class="arena-empty-icon">${svgIcon("hamster", "svg-icon svg-icon-lg")}</span>
            </div>
          `}

          <div class="arena-center">
            ${lastHit && isAttacking ? `
              <div class="arena-damage">-${lastHit.damage}</div>
              ${lastHit.booksAwarded > 0
                ? `<div class="arena-reward">Схованки +${lastHit.booksAwarded}</div>`
                : ""}
            ` : ""}
          </div>

          <div class="arena-dummy-wrap">
            <canvas id="training-dummy-canvas"
              style="height:${CANVAS_DUMMY_H}px;display:block;image-rendering:pixelated"></canvas>
          </div>
        </div>

        <!-- Підписи під бійцями -->
        <div class="arena-labels-row">
          <div class="arena-side-info">
            <span class="arena-label">${selectedHamster ? escapeHtml(selectedHamster.name) : "оберіть бійця"}</span>
            ${selectedHamster ? `<span class="arena-stat">${svgIcon("weapon", "svg-icon svg-icon-xs")} ${selectedStats.attack}</span>` : ""}
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
        <span class="training-hp-text">${progress} / ${dummy.hpPerRound} · схованки x${dummy.rewardBooks}</span>
      </div>

      <div class="training-tabs">
        <button class="training-tab-btn ${activeTab === "fight" ? "active" : ""}"
          data-action="set-training-tab" data-tab="fight">${svgIcon("weapon", "svg-icon svg-icon-xs")} Бій</button>
        <button class="training-tab-btn ${activeTab === "dummy" ? "active" : ""}"
          data-action="set-training-tab" data-tab="dummy">${svgIcon("item", "svg-icon svg-icon-xs")} Манекен</button>
        <button class="training-tab-btn ${activeTab === "stats" ? "active" : ""}"
          data-action="set-training-tab" data-tab="stats">${svgIcon("quests", "svg-icon svg-icon-xs")} Стат</button>
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
        ? `Авто-атака · 1.3с · ${selectedStats.attack} урону`
        : "Оберіть бійця щоб почати тренування"}
    </div>
    <div class="card ${isTutorialStep(7) ? "tutorial-target" : ""}" style="margin-top:10px">
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
                ${svgIcon(iconForClass(h.class), "svg-icon svg-icon-xs")} ${escapeHtml(h.name)} · урон ${hStats.attack}
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
      <div class="card-row"><span>Нагорода</span><strong>Схованки ${dummy.rewardBooks}</strong></div>
    </div>
    ${nextDummy ? `
      <div class="card">
        <div class="section-header">
          <span class="label">Поліпшити</span>
          <span class="tag">Рівень ${nextDummy.level}</span>
        </div>
        <p class="muted" style="font-size:0.82rem;margin:6px 0">
          ${nextDummy.hpPerRound} HP · схованки ${nextDummy.rewardBooks}
        </p>
        <div class="tag-row" style="margin:8px 0">
          ${Object.entries(nextDummy.upgradeCost)
            .map(([k, v]) => `<span class="tag">${resourceMeta[k]?.label ?? k}: ${v}</span>`)
            .join("")}
        </div>
        <button class="btn secondary" data-action="upgrade-dummy" ${canUpgradeDummy(state) ? "" : "disabled"}>
          Поліпшити манекен
        </button>
        ${!canUpgradeDummy(state)
          ? `<p class="muted" style="font-size:0.78rem;margin-top:4px">Бракує ресурсів</p>`
          : ""}
      </div>
    ` : `
      <div class="card" style="text-align:center;padding:20px">
        <p><strong>Готово</strong></p>
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
      <div class="card-row"><span>Схованки в коморі</span><strong>${xpBooks}</strong></div>
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
    food: "Крих.",
    gold: "Нас.",
    ore: "Кам."
  }[key] ?? label;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav ${isTutorialStep(1) || isTutorialStep(6) || isTutorialStep(8) ? "tutorial-target" : ""}" aria-label="Головна навігація">
      <div class="bottom-nav-inner">
        ${navItems.map((item) => `
          <button class="nav-button ${runtimeState.route === item.route ? "is-active" : ""} ${isTutorialNavTarget(item.route) ? "tutorial-nav-target" : ""}" data-action="nav" data-route="${item.route}">
            <span class="nav-icon">${svgIcon(item.icon)}</span>
            <span class="nav-label">${t(item.labelKey)}</span>
            <span class="nav-dot"></span>
          </button>
        `).join("")}
      </div>
    </nav>
  `;
}

function renderBuildingCard(state, building) {
  const config = buildingConfig[building.id] ?? {};
  const level = getBuildingLevel(state, building);
  const tags = getBuildingTags(state, building.id);
  return `
    <article class="building-card is-active" data-building-id="${building.id}">
      <div class="building-icon">${svgIcon(iconForBuilding(building.id))}</div>
      <div class="building-content">
        <div class="card-row">
          <div>
            <p class="building-role">${config.role ?? "Споруда"}</p>
            <h3>${building.name}</h3>
          </div>
          <span class="tag">Lv ${level}</span>
        </div>
        <p>${building.description}</p>
        <div class="tag-row building-stat-row">
          ${tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
        </div>
        <div class="button-row building-actions">
          ${renderBuildingActionButton(state, config.primary, "btn")}
          ${(config.secondary ?? []).map((action) => renderBuildingActionButton(state, action, "select-pill")).join("")}
        </div>
      </div>
    </article>
  `;
}

function getBuildingLevel(state, building) {
  const config = buildingConfig[building.id] ?? {};
  const upgradeLevels = (config.upgradeIds ?? []).reduce((sum, upgradeId) => sum + getUpgradeLevel(state, upgradeId), 0);
  return Math.max(1, building.level ?? 1) + upgradeLevels;
}

function getBuildingTags(state, buildingId) {
  const stats = getColonyStats(state);
  const inventoryGroups = getInventoryGroups(state, dataStore);
  const availableHamsters = state.hamsters.filter((hamster) => hamster.status === "available").length;
  const activeTraining = runtimeState.trainingHamsterId || state.training?.activeHamsterId;

  return {
    storage: [
      `Ресурсів ${Object.keys(state.resources ?? {}).length}`,
      "Пасив до 8 год"
    ],
    kitchen: [
      `Крихти +${stats.passiveIncomePerMin.food ?? 0}/хв`,
      `Насіння +${stats.passiveIncomePerMin.gold ?? 0}/хв`
    ],
    workshop: [
      `Екіп. ${state.equipment?.length ?? 0}`,
      `Матеріали ${inventoryGroups.length}`
    ],
    barracks: [
      `Вільні ${availableHamsters}`,
      activeTraining ? "Автобій активний" : "Манекен готовий"
    ],
    map: [
      `Загони ${getUsedExpeditionSlots(state)}/${getMaxExpeditionSlots(state)}`,
      `Швидкість +${stats.expeditionSpeedPercent}%`
    ],
    lab: [
      `5 зірок +${stats.gachaLuckPercent}%`,
      `Маяк Lv ${getUpgradeLevel(state, "gacha_luck")}/${dataStore.colonyUpgrades.find((upgrade) => upgrade.id === "gacha_luck")?.maxLevel ?? 5}`
    ],
    market: [
      `${MARKET_SHINY_TRADE.cost.gold} насіння -> ${MARKET_SHINY_TRADE.reward.shiny} світяшок`,
      canAfford(state, MARKET_SHINY_TRADE.cost) ? "Обмін готовий" : "Бракує насіння"
    ],
    nest: [
      `${state.hamsters.length}/${dataStore.hamsters.length} у колекції`,
      `Лист ${getSelectedBanner(state)?.cost?.single?.shiny ?? 10} світяшок`
    ]
  }[buildingId] ?? [];
}

function renderBuildingActionButton(state, action, className) {
  if (!action) return "";
  const disabled = isBuildingActionDisabled(state, action);
  const attrs = getBuildingActionAttrs(action);
  const title = getBuildingActionTitle(state, action);
  const label = getBuildingActionLabel(state, action);
  return `
    <button class="${className}" data-action="${action.action}" ${attrs} ${title ? `title="${escapeHtml(title)}"` : ""} ${disabled ? "disabled" : ""}>
      ${label}
    </button>
  `;
}

function getBuildingActionAttrs(action) {
  if (action.attrs) return action.attrs;
  if (action.upgradeId) return `data-upgrade-id="${action.upgradeId}"`;
  return "";
}

function getBuildingActionLabel(state, action) {
  if (action.action === "upgrade-colony" && action.upgradeId) {
    const upgrade = dataStore.colonyUpgrades.find((candidate) => candidate.id === action.upgradeId);
    if (!upgrade) return action.label;
    const level = getUpgradeLevel(state, upgrade.id);
    if (level >= upgrade.maxLevel) return "Максимум";
    return action.label;
  }
  return action.label;
}

function getBuildingActionTitle(state, action) {
  if (action.action === "upgrade-colony" && action.upgradeId) {
    const upgrade = dataStore.colonyUpgrades.find((candidate) => candidate.id === action.upgradeId);
    if (!upgrade) return "";
    const level = getUpgradeLevel(state, upgrade.id);
    if (level >= upgrade.maxLevel) return `${upgrade.name}: максимум`;
    return `${upgrade.name}: ${formatCost(getUpgradeCost(state, upgrade), resourceMeta)}`;
  }

  if (action.action === "trade-market-shiny") {
    return `${formatCost(MARKET_SHINY_TRADE.cost, resourceMeta)} -> світяшки ${MARKET_SHINY_TRADE.reward.shiny}`;
  }

  return "";
}

function isBuildingActionDisabled(state, action) {
  if (action.action === "trade-market-shiny") {
    return !canAfford(state, MARKET_SHINY_TRADE.cost);
  }

  if (action.action === "upgrade-colony" && action.upgradeId) {
    const upgrade = dataStore.colonyUpgrades.find((candidate) => candidate.id === action.upgradeId);
    if (!upgrade) return true;
    const level = getUpgradeLevel(state, upgrade.id);
    return level >= upgrade.maxLevel || !canAfford(state, getUpgradeCost(state, upgrade));
  }

  return false;
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
    <article class="zone-card ${active ? "is-active" : ""} ${active && isTutorialStep(2) ? "tutorial-target" : ""}" data-action="select-zone" data-zone-id="${zone.id}">
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
          <span class="tag">Ціна: насіння ${cost.gold}, камінці ${cost.ore}</span>
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

function renderOnboardingOverlay(state) {
  if (state.onboarding?.completed) return "";
  const index = getOnboardingStepIndex(state);
  const step = onboardingSteps[index] ?? onboardingSteps[0];
  const progress = Math.round(((index + 1) / onboardingSteps.length) * 100);
  const primaryAction = step.done ? "tutorial-finish" : "tutorial-next";
  const primaryLabel = step.done ? "Завершити" : index === 0 ? "Почати" : "Далі";
  const waitsForPlayer = step.mode !== "button";
  return `
    <div class="tutorial-layer tutorial-align-${step.align}" aria-live="polite">
      <section class="tutorial-card" role="dialog" aria-modal="false" aria-label="Навчання: ${escapeHtml(step.title)}">
        <div class="tutorial-card-top">
          <span class="tutorial-icon">${svgIcon(step.icon)}</span>
          <span class="tutorial-count">Крок ${index + 1}/${onboardingSteps.length}</span>
        </div>
        <p class="tutorial-kicker">${step.kicker}</p>
        <h2>${step.title}</h2>
        <p>${step.body}</p>
        <div class="tutorial-task">
          <strong>Підказка</strong>
          <span>${step.task}</span>
        </div>
        <div class="tutorial-progress" aria-hidden="true">
          <span style="width:${progress}%"></span>
        </div>
        <div class="tutorial-actions">
          ${index > 0 ? `<button class="btn ghost" data-action="tutorial-prev">Назад</button>` : ""}
          <button class="btn ghost" data-action="tutorial-skip">Пропустити</button>
          ${waitsForPlayer
            ? `<span class="tutorial-waiting">Клікни підсвічений елемент</span>`
            : `<button class="btn is-ready-action" data-action="${primaryAction}">${primaryLabel}</button>`}
        </div>
      </section>
    </div>
  `;
}

function getOnboardingStepIndex(state) {
  const raw = runtimeState.onboardingStep ?? state.onboarding?.currentStep ?? 0;
  const numeric = Number.isFinite(Number(raw)) ? Number(raw) : 0;
  return Math.max(0, Math.min(onboardingSteps.length - 1, numeric));
}

function isTutorialStep(step) {
  return runtimeState.onboardingStep !== null && runtimeState.onboardingStep !== undefined && Number(runtimeState.onboardingStep) === step;
}

function isTutorialNavTarget(route) {
  return (
    (isTutorialStep(1) && route === "expeditions") ||
    (isTutorialStep(6) && route === "training") ||
    (isTutorialStep(8) && route === "gacha")
  );
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
        <span class="tag">Прокачка: насіння ${cost.gold}</span>
        <span class="tag">Схованки ${cost.xpBooks}</span>
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

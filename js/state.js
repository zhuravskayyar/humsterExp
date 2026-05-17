export const SAVE_VERSION = 6;

export const DEFAULT_EQUIPMENT_SLOTS = Object.freeze({
  weapon: null,
  armor: null,
  backpack: null,
  tool: null,
  charm: null
});

export let gameState = null;

export const runtimeState = {
  route: "base",
  selectedZoneId: "kitchen",
  selectedDurationMs: 300000,
  selectedHamsterIds: [],
  selectedRationId: "none",
  modal: null,
  toasts: [],
  expandedHamsterId: null,
  activeCharacterEquipmentSlot: "weapon",
  showSettings: false,
  gachaResults: [],
  expeditionResult: null,
  trainingHamsterId: null,
  lastHitInfo: null,
  trainingTab: "fight",
  onboardingStep: null
};

export function createDefaultState(data) {
  const now = Date.now();
  const stats = {
    expeditionsStarted: 0,
    foodCollected: 0,
    cleanReturns: 0,
    rareItemsFound: 0,
    gachaPulls: 0,
    fiveStarPulls: 0
  };

  return {
    version: SAVE_VERSION,
    player: {
      name: "Player",
      level: 1,
      xp: 0,
      baseLevel: 1
    },
    resources: {
      food: 120,
      wood: 80,
      metal: 20,
      fabric: 30,
      plastic: 10,
      shiny: 80,
      cheese: 0,
      gold: 220,
      xpBooks: 8,
      ore: 25,
      crystals: 0
    },
    hamsters: data.hamsters.filter((hamster) => hamster.starter).map((hamster) => normalizeHamster(hamster, {})),
    equipment: [
      createEquipmentInstance(data.items.find((item) => item.id === "toothpick_spear")),
      createEquipmentInstance(data.items.find((item) => item.id === "acorn_helmet"))
    ].filter(Boolean),
    inventory: [
      { itemId: "tiny_bandage", quantity: 2 },
      { itemId: "old_thread", quantity: 2 }
    ],
    expeditions: [],
    quests: structuredClone(data.quests).map((quest) => ({
      ...quest,
      completed: false,
      claimed: false
    })),
    questsLastResetAt: now,
    dailyQuestBaselines: createDailyQuestBaselines(data.quests, stats),
    unlockedZones: ["kitchen", "pantry", "basement"],
    stats,
    colony: {
      lastPassiveAt: now,
      upgrades: Object.fromEntries((data.colonyUpgrades ?? []).map((upgrade) => [upgrade.id, 0]))
    },
    gacha: {
      selectedBannerId: "standard",
      pity5: 0,
      lastResults: []
    },
    training: {
      dummyLevel: 1,
      damageProgress: 0,
      totalRounds: 0,
      activeHamsterId: null,
      offlineSince: null,
      offlineDps: null
    },
    onboarding: {
      version: 1,
      completed: false,
      currentStep: 0,
      completedAt: null
    },
    settings: {
      language: "ua",
      sound: true,
      music: true,
      performanceMode: false
    }
  };
}

export function setGameState(nextState) {
  gameState = nextState;
  if (typeof window !== "undefined") {
    window.hamsterGame = window.hamsterGame ?? {};
    window.hamsterGame.state = gameState;
  }
}

export function mergeWithDefaults(savedState, data) {
  const defaults = createDefaultState(data);
  const merged = {
    ...defaults,
    ...savedState,
    player: { ...defaults.player, ...savedState.player },
    resources: { ...defaults.resources, ...savedState.resources },
    settings: { ...defaults.settings, ...savedState.settings },
    stats: { ...defaults.stats, ...savedState.stats }
  };
  const legacyCoins = Number(savedState.resources?.coins ?? 0);
  if (legacyCoins > 0) {
    merged.resources.gold = (merged.resources.gold ?? 0) + legacyCoins;
  }
  delete merged.resources.coins;

  merged.hamsters = mergeHamsters(defaults.hamsters, savedState.hamsters, data.hamsters);
  merged.equipment = Array.isArray(savedState.equipment) ? mergeEquipment(savedState.equipment, data.items) : defaults.equipment;
  merged.inventory = Array.isArray(savedState.inventory) ? savedState.inventory : defaults.inventory;
  merged.expeditions = Array.isArray(savedState.expeditions) ? savedState.expeditions : [];
  merged.quests = mergeQuests(defaults.quests, savedState.quests);
  merged.questsLastResetAt = typeof savedState.questsLastResetAt === "number" ? savedState.questsLastResetAt : defaults.questsLastResetAt;
  merged.dailyQuestBaselines = {
    ...defaults.dailyQuestBaselines,
    ...(savedState.dailyQuestBaselines ?? {})
  };
  merged.unlockedZones = Array.isArray(savedState.unlockedZones) ? savedState.unlockedZones : defaults.unlockedZones;
  merged.colony = {
    ...defaults.colony,
    ...savedState.colony,
    upgrades: {
      ...defaults.colony.upgrades,
      ...(savedState.colony?.upgrades ?? {})
    }
  };
  merged.gacha = { ...defaults.gacha, ...savedState.gacha };
  merged.training = { ...defaults.training, ...(savedState.training ?? {}) };
  merged.onboarding = { ...defaults.onboarding, ...(savedState.onboarding ?? {}) };
  merged.version = SAVE_VERSION;

  return merged;
}

function createDailyQuestBaselines(quests = [], stats = {}) {
  return Object.fromEntries(
    (quests ?? [])
      .filter((quest) => quest.type === "daily")
      .map((quest) => [quest.metric, stats[quest.metric] ?? 0])
  );
}

function mergeHamsters(defaultHamsters, savedHamsters = [], allHamsters = []) {
  const saved = Array.isArray(savedHamsters) ? savedHamsters : [];
  const result = [];
  const used = new Set();

  for (const hamster of saved) {
    const template = allHamsters.find((candidate) => candidate.id === hamster.id) ?? hamster;
    result.push(normalizeHamster(template, hamster));
    used.add(hamster.id);
  }

  for (const hamster of defaultHamsters) {
    if (!used.has(hamster.id)) {
      result.push(normalizeHamster(hamster, {}));
    }
  }

  return result;
}

export function normalizeHamster(template, saved = {}) {
  const hasModernStars = typeof saved.stars === "number";
  const base = {
    ...structuredClone(template),
    ...saved
  };
  const level = Math.min(90, saved.level ?? template.level ?? 1);
  const slug = saved.slug ?? template.slug ?? deriveHamsterSlug(saved.portrait ?? template.portrait ?? saved.image ?? template.image);
  const portrait = saved.portrait ?? template.portrait ?? saved.image ?? template.image ?? (slug ? `assets/images/hamsters/${slug}/portret/${slug}.png` : null);
  return {
    ...base,
    slug,
    level,
    maxLevel: saved.maxLevel ?? template.maxLevel ?? 90,
    hp: saved.hp ?? template.hp ?? 80 + level * 8 + (template.stars ?? 4) * 18,
    attack: saved.attack ?? template.attack ?? 10 + Math.round((template.power ?? 5) * 1.2),
    defense: saved.defense ?? template.defense ?? 6 + Math.round((template.stamina ?? 5) * 0.8),
    stars: saved.stars ?? template.stars ?? 4,
    rarity: hasModernStars ? saved.rarity ?? template.rarity ?? "Epic" : template.rarity ?? saved.rarity ?? "Epic",
    signatureWeaponId: saved.signatureWeaponId ?? template.signatureWeaponId ?? `sig_${template.id}`,
    portrait,
    gachaImage: saved.gachaImage ?? template.gachaImage ?? portrait,
    image: portrait,
    equipmentSlots: {
      ...DEFAULT_EQUIPMENT_SLOTS,
      ...(saved.equipmentSlots ?? template.equipmentSlots ?? {})
    },
    constellationLevel: Math.min(6, saved.constellationLevel ?? template.constellationLevel ?? 0),
    constellations: structuredClone(template.constellations ?? saved.constellations ?? []),
    status: saved.status ?? template.status ?? "available"
  };
}

function deriveHamsterSlug(path) {
  if (typeof path !== "string" || !path) return null;
  const normalized = path.replace(/\\/g, "/");
  const nestedMatch = normalized.match(/\/hamsters\/([^/]+)\//);
  if (nestedMatch) return nestedMatch[1];
  return normalized.split("/").pop()?.replace(/\.[^.]+$/, "") ?? null;
}

function mergeEquipment(savedEquipment = [], itemTemplates = []) {
  return savedEquipment
    .map((equipment) => {
      const template = itemTemplates.find((item) => item.id === equipment.itemId);
      if (!template) return null;
      return {
        uid: equipment.uid ?? crypto.randomUUID(),
        itemId: equipment.itemId,
        level: Math.min(equipment.maxLevel ?? template.maxLevel ?? 90, equipment.level ?? 1),
        maxLevel: equipment.maxLevel ?? template.maxLevel ?? 90,
        copies: Math.max(0, Math.min(5, Number(equipment.copies ?? equipment.refine ?? 0) || 0)),
        equippedBy: equipment.equippedBy ?? null,
        locked: equipment.locked ?? false
      };
    })
    .filter(Boolean);
}

function createEquipmentInstance(template) {
  if (!template?.equipmentSlot) return null;
  return {
    uid: crypto.randomUUID(),
    itemId: template.id,
    level: 1,
    maxLevel: template.maxLevel ?? 90,
    copies: 0,
    equippedBy: null,
    locked: false
  };
}

function mergeQuests(defaultQuests, savedQuests = []) {
  return defaultQuests.map((quest) => {
    const saved = savedQuests.find((candidate) => candidate.id === quest.id);
    return saved ? { ...quest, ...saved } : quest;
  });
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

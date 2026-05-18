export const dataStore = {
  hamsters: [],
  zones: [],
  items: [],
  events: [],
  quests: [],
  buildings: [],
  gacha: { banners: [] },
  bosses: [],
  colonyUpgrades: []
};

export const resourceMeta = {
  food: { label: "Крихти", icon: "food" },
  wood: { label: "Тріски", icon: "wood" },
  metal: { label: "Скріпки", icon: "metal" },
  fabric: { label: "Нитки", icon: "fabric" },
  plastic: { label: "Кришечки", icon: "plastic" },
  shiny: { label: "Світяшки", icon: "shiny" },
  coins: { label: "Насіння", icon: "seed" },
  cheese: { label: "Сир", icon: "cheese" },
  gold: { label: "Насіння", icon: "seed" },
  xpBooks: { label: "Схованки", icon: "quests" },
  ore: { label: "Камінці", icon: "metal" },
  crystals: { label: "Скельця", icon: "shiny" }
};

export const i18n = {
  ua: {
    base: "Нора",
    hamsters: "Хом'яки",
    expeditions: "Вилазки",
    inventory: "Комора",
    backpack: "Рюкзак",
    quests: "Доручення",
    colony: "Колонія",
    battle: "Бос",
    gacha: "Гача",
    settings: "Налаштування",
    send: "Вирушати!",
    claim: "Забрати трофеї",
    training: "Тренування",
    available: "вільний",
    in_expedition: "у вилазці",
    in_battle: "у бою",
    injured: "поранений",
    resting: "відпочиває"
  },
  en: {
    base: "Base",
    hamsters: "Hamsters",
    expeditions: "Expeditions",
    inventory: "Inventory",
    backpack: "Backpack",
    quests: "Quests",
    colony: "Colony",
    battle: "Boss",
    gacha: "Gacha",
    settings: "Settings",
    send: "Send",
    claim: "Claim",
    available: "available",
    in_expedition: "in expedition",
    in_battle: "in battle",
    injured: "injured",
    resting: "resting"
  },
  de: {
    base: "Basis",
    hamsters: "Hamster",
    expeditions: "Expeditionen",
    inventory: "Inventar",
    backpack: "Rucksack",
    quests: "Aufgaben",
    colony: "Kolonie",
    battle: "Boss",
    gacha: "Gacha",
    settings: "Einstellungen",
    send: "Senden",
    claim: "Abholen",
    available: "frei",
    in_expedition: "auf Expedition",
    in_battle: "im Kampf",
    injured: "verletzt",
    resting: "ruht"
  }
};

const files = {
  hamsters: "./data/hamsters.json",
  zones: "./data/zones.json",
  items: "./data/items.json",
  events: "./data/events.json",
  quests: "./data/quests.json",
  buildings: "./data/buildings.json",
  gacha: "./data/gacha.json",
  bosses: "./data/bosses.json",
  colonyUpgrades: "./data/colony_upgrades.json"
};

export async function loadData() {
  const entries = await Promise.all(
    Object.entries(files).map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url}`);
      }
      return [key, await response.json()];
    })
  );

  for (const [key, value] of entries) {
    dataStore[key] = value;
  }

  return dataStore;
}

export function findZone(zoneId) {
  return dataStore.zones.find((zone) => zone.id === zoneId);
}

export function findItem(itemId) {
  return dataStore.items.find((item) => item.id === itemId);
}

export function findBoss(bossId) {
  return dataStore.bosses.find((boss) => boss.id === bossId);
}

export function t(key) {
  return i18n.ua[key] ?? key;
}

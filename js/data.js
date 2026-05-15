export const dataStore = {
  hamsters: [],
  zones: [],
  items: [],
  events: [],
  quests: [],
  buildings: [],
  gacha: { banners: [] },
  colonyUpgrades: []
};

export const resourceMeta = {
  food: { label: "Їжа", icon: "food" },
  wood: { label: "Дерево", icon: "wood" },
  metal: { label: "Метал", icon: "metal" },
  fabric: { label: "Тканина", icon: "fabric" },
  plastic: { label: "Пластик", icon: "plastic" },
  shiny: { label: "Світяшки", icon: "shiny" },
  coins: { label: "Монети", icon: "coins" },
  cheese: { label: "Преміум-сир", icon: "cheese" },
  gold: { label: "Золото", icon: "coins" },
  xpBooks: { label: "Схованки", icon: "quests" },
  ore: { label: "Руда", icon: "metal" },
  crystals: { label: "Кристал", icon: "gacha" }
};

export const i18n = {
  ua: {
    base: "Нора",
    hamsters: "Хом'яки",
    expeditions: "Вилазки",
    inventory: "Комора",
    quests: "Доручення",
    colony: "Колонія",
    gacha: "Гача",
    settings: "Налаштування",
    send: "Вирушати!",
    claim: "Забрати трофеї",
    training: "Тренування",
    available: "вільний",
    in_expedition: "у вилазці",
    injured: "поранений",
    resting: "відпочиває"
  },
  en: {
    base: "Base",
    hamsters: "Hamsters",
    expeditions: "Expeditions",
    inventory: "Inventory",
    quests: "Quests",
    colony: "Colony",
    gacha: "Gacha",
    settings: "Settings",
    send: "Send",
    claim: "Claim",
    available: "available",
    in_expedition: "in expedition",
    injured: "injured",
    resting: "resting"
  },
  de: {
    base: "Basis",
    hamsters: "Hamster",
    expeditions: "Expeditionen",
    inventory: "Inventar",
    quests: "Aufgaben",
    colony: "Kolonie",
    gacha: "Gacha",
    settings: "Einstellungen",
    send: "Senden",
    claim: "Abholen",
    available: "frei",
    in_expedition: "auf Expedition",
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

export function t(key) {
  return i18n.ua[key] ?? key;
}

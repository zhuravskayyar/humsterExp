const paths = {
  base: `<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V20h11v-9.5"/><path d="M10 20v-6h4v6"/>`,
  hamster: `<circle cx="12" cy="13" r="6"/><circle cx="7" cy="7" r="2.7"/><circle cx="17" cy="7" r="2.7"/><path d="M9 13h.01M15 13h.01"/><path d="M10 16c1.2.8 2.8.8 4 0"/>`,
  map: `<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z"/><path d="M9 4v14M15 6v14"/>`,
  colony: `<path d="M4 19h16"/><path d="M6 19v-8l6-5 6 5v8"/><path d="M9 19v-5h6v5"/><path d="M12 6V3"/>`,
  gacha: `<path d="M12 3.5 14.5 9l5.8.6-4.3 4 1.2 5.8-5.2-3-5.2 3 1.2-5.8-4.3-4 5.8-.6L12 3.5Z"/>`,
  inventory: `<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M8 12h8"/>`,
  quests: `<path d="M7 4h10v16H7z"/><path d="M9 8h6M9 12h6M9 16h4"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.7 4.7l2.1 2.1M17.2 17.2l2.1 2.1M2.5 12h3M18.5 12h3M4.7 19.3l2.1-2.1M17.2 6.8l2.1-2.1"/>`,
  collect: `<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/>`,
  close: `<path d="M6 6l12 12M18 6 6 18"/>`,
  alert: `<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>`,
  storage: `<path d="M4 8h16v12H4z"/><path d="M7 4h10v4"/><path d="M8 12h8"/>`,
  kitchen: `<path d="M7 3v18"/><path d="M5 3v5a2 2 0 0 0 4 0V3"/><path d="M15 3v18"/><path d="M15 3c3 2 3 6 0 8"/>`,
  workshop: `<path d="m5 19 7-7"/><path d="m14 5 5 5"/><path d="m12 7 5 5"/><path d="M4 6l4-2 2 2-4 4-2-4Z"/>`,
  barracks: `<path d="M5 20V5h11l-1.5 3L16 11H5"/><path d="M8 20h8"/>`,
  lab: `<path d="M10 3h4"/><path d="M11 3v5l-5 9a3 3 0 0 0 2.6 4.5h6.8A3 3 0 0 0 18 17l-5-9V3"/><path d="M8 16h8"/>`,
  market: `<path d="M4 9h16l-2 11H6L4 9Z"/><path d="M8 9a4 4 0 0 1 8 0"/><path d="M9 14h6"/>`,
  nest: `<path d="M5 16c2-5 12-5 14 0"/><path d="M6 16c0 4 12 4 12 0"/><ellipse cx="12" cy="13" rx="3" ry="4"/>`,
  food: `<path d="M6 19c6-1 10-5 12-14-8 2-13 6-12 14Z"/><path d="M6 19c3-5 6-8 12-14"/>`,
  wood: `<path d="M5 8h14v8H5z"/><path d="M8 8c2 2 2 6 0 8M16 8c-2 2-2 6 0 8"/><path d="M11 12h2"/>`,
  metal: `<path d="M12 3 21 8v8l-9 5-9-5V8l9-5Z"/><path d="M8 10h8M8 14h8"/>`,
  fabric: `<path d="M5 5h14v14H5z"/><path d="M5 10h14M10 5v14"/>`,
  plastic: `<path d="M8 4h8l1 16H7L8 4Z"/><path d="M9 8h6"/><path d="M10 12h4"/>`,
  shiny: `<path d="M12 3l2.2 6 6 2.2-6 2.2-2.2 6-2.2-6-6-2.2 6-2.2L12 3Z"/>`,
  coins: `<circle cx="12" cy="12" r="7"/><path d="M9 12h6M12 8v8"/>`,
  cheese: `<path d="M4 16 20 7v10H4v-1Z"/><circle cx="13" cy="13" r="1"/><circle cx="17" cy="11" r="1"/>`,
  power: `<path d="M13 3 5 14h6l-1 7 9-12h-6l0-6Z"/>`,
  danger: `<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>`,
  lock: `<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>`,
  check: `<path d="m4 12 5 5L20 6"/>`,
  item: `<path d="M5 8 12 4l7 4v8l-7 4-7-4V8Z"/><path d="M12 4v16M5 8l7 4 7-4"/>`,
  craft: `<path d="M5 18 18 5"/><path d="M14 5h4v4"/><path d="M6 6l4 4"/>`,
  weapon: `<path d="M4 20 20 4"/><path d="m14 4 6 6"/><path d="m5 15 4 4"/>`,
  armor: `<path d="M12 3 19 6v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z"/>`,
  backpack: `<path d="M6 9h12v11H6z"/><path d="M9 9a3 3 0 0 1 6 0"/><path d="M9 14h6"/>`,
  tool: `<path d="M14 4a4 4 0 0 0 5 5L9 19a3 3 0 0 1-4-4L15 5Z"/>`,
  artifact: `<path d="M12 3 20 12l-8 9-8-9 8-9Z"/><path d="M8 12h8"/>`,
  cosmetic: `<path d="M7 5h10l2 5-7 10-7-10 2-5Z"/><path d="M9 5l3 15 3-15"/>`,
  material: `<circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3"/><path d="M11 12h2"/>`
};

export function svgIcon(name, className = "svg-icon") {
  const path = paths[name] ?? paths.item;
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

export function iconForBuilding(id) {
  return {
    storage: "storage",
    kitchen: "kitchen",
    workshop: "workshop",
    barracks: "barracks",
    map: "map",
    lab: "lab",
    market: "market",
    nest: "nest"
  }[id] ?? "base";
}

export function iconForClass(hamsterClass) {
  return {
    Gatherer: "inventory",
    Scout: "map",
    Warrior: "armor",
    Engineer: "workshop",
    Medic: "material",
    Lucky: "shiny",
    Mutant: "lab"
  }[hamsterClass] ?? "hamster";
}

export function iconForItemType(type) {
  return {
    resource_pack: "food",
    craft: "craft",
    material: "material",
    weapon: "weapon",
    armor: "armor",
    backpack: "backpack",
    charm: "artifact",
    tool: "tool",
    artifact: "artifact",
    cosmetic: "cosmetic"
  }[type] ?? "item";
}

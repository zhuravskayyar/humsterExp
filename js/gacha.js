import { dataStore, findItem } from "./data.js";
import { getColonyStats } from "./colony.js";
import { createEquipmentFromItem } from "./equipment.js";
import { addItem, addResources } from "./inventory.js";
import { normalizeHamster } from "./state.js";

export function getSelectedBanner(state) {
  return dataStore.gacha.banners.find((banner) => banner.id === state.gacha.selectedBannerId) ?? dataStore.gacha.banners[0];
}

export function rollGacha(state, count = 1) {
  const banner = getSelectedBanner(state);
  const cost = count === 10 ? banner.cost.ten : banner.cost.single;
  assertCanPay(state, cost);
  spendCost(state, cost);

  const results = [];
  for (let i = 0; i < count; i += 1) {
    results.push(rollOne(state, banner));
  }

  state.gacha.lastResults = results.slice(-10);
  state.stats.gachaPulls += count;
  return results;
}

export function formatCost(cost, resourceMeta) {
  return Object.entries(cost)
    .map(([resource, amount]) => `${resourceMeta[resource]?.label ?? resource} ${amount}`)
    .join(", ");
}

function rollOne(state, banner) {
  state.gacha.pity5 += 1;
  const colonyLuck = getColonyStats(state).gachaLuckPercent;
  const pityReady = state.gacha.pity5 >= banner.pity.fiveStarEvery;
  const pityBoost = pityReady ? 0 : getSoftPityBoost(banner, state.gacha.pity5);
  const hamsterRoll = Math.random() * 100 <= banner.hamsterChance;

  let result;
  if (hamsterRoll) {
    const stars = pityReady ? 5 : Number(weightedPick(applyLuckToStarWeights(banner.hamsterStars, colonyLuck, pityBoost)));
    result = rollHamster(state, stars);
  } else {
    const stars = pityReady ? 5 : Number(weightedPick(applyLuckToStarWeights(banner.itemStars, colonyLuck, pityBoost)));
    result = rollItem(state, stars);
  }

  if (result.stars >= 5) {
    state.gacha.pity5 = 0;
    state.stats.fiveStarPulls += 1;
  }

  return result;
}

function rollHamster(state, stars) {
  const pool = dataStore.hamsters.filter((hamster) => hamster.stars === stars);
  const template = pool[Math.floor(Math.random() * pool.length)];
  const existing = state.hamsters.find((hamster) => hamster.id === template.id);

  if (!existing) {
    const hamster = normalizeHamster(template, {
      starter: false,
      status: "available",
      constellationLevel: 0
    });
    state.hamsters.push(hamster);
    return {
      type: "hamster",
      status: "new",
      id: hamster.id,
      name: hamster.name,
      stars: hamster.stars,
      rarity: hamster.rarity,
      message: "Новий хом'як приєднався до нори."
    };
  }

  if ((existing.constellationLevel ?? 0) < 6) {
    existing.constellationLevel = (existing.constellationLevel ?? 0) + 1;
    const passive = existing.constellations?.find((constellation) => constellation.level === existing.constellationLevel);
    return {
      type: "hamster",
      status: "constellation",
      id: existing.id,
      name: existing.name,
      stars: existing.stars,
      rarity: existing.rarity,
      constellationLevel: existing.constellationLevel,
      passive,
      message: `Дублікат відкрив сузір'я C${existing.constellationLevel}.`
    };
  }

  const refund = existing.stars === 5 ? { shiny: 8, coins: 160 } : { shiny: 4, coins: 90 };
  addResources(state, refund);
  return {
    type: "hamster",
    status: "refund",
    id: existing.id,
    name: existing.name,
    stars: existing.stars,
    rarity: existing.rarity,
    refund,
    message: "Сузір'я вже максимальне, дублікат став ресурсами."
  };
}

function rollItem(state, stars) {
  const pool = dataStore.items.filter((item) => item.stars === stars && item.gacha !== false);
  const item = pool[Math.floor(Math.random() * pool.length)];
  const equipment = createEquipmentFromItem(item);

  if (equipment) {
    state.equipment.push(equipment);
  } else if (item.type === "resource_pack") {
    addResourcePack(state, item);
  } else {
    addItem(state, item.id, 1);
  }

  return {
    type: equipment ? "equipment" : "item",
    status: equipment ? "equipment" : "item",
    id: item.id,
    name: item.name,
    stars: item.stars,
    rarity: item.rarity,
    item,
    equipmentUid: equipment?.uid,
    message: "Предмет додано в інвентар."
  };
}

function addResourcePack(state, item) {
  const rewards = {
    crumb_bag: { food: 30 },
    gold_pouch: { gold: 80 },
    ore_pouch: { ore: 18 },
    xp_book_small: { xpBooks: 3 }
  }[item.id];
  if (rewards) {
    addResources(state, rewards);
  } else {
    addItem(state, item.id, 1);
  }
}

function assertCanPay(state, cost) {
  const missing = Object.entries(cost).find(([resource, amount]) => (state.resources[resource] ?? 0) < amount);
  if (missing) {
    throw new Error(`Недостатньо ресурсу: ${missing[0]}`);
  }
}

function spendCost(state, cost) {
  for (const [resource, amount] of Object.entries(cost)) {
    state.resources[resource] -= amount;
  }
}

function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries.at(-1)[0];
}

function applyLuckToStarWeights(weights, luckPercent, pityBoost = 0) {
  const next = { ...weights };
  const totalBoost = (luckPercent ?? 0) + (pityBoost ?? 0);
  if (!totalBoost && !luckPercent) return next;

  if (next["5"]) {
    next["5"] += totalBoost;
  }
  if (next["1"]) {
    next["1"] = Math.max(1, next["1"] - Math.ceil(totalBoost / 2));
  }
  if (next["4"]) {
    next["4"] += Math.floor((luckPercent ?? 0) / 2);
  }
  return next;
}

function getSoftPityBoost(banner, pityCount) {
  const start = banner.pity?.softPityStart;
  const bonusPerPull = banner.pity?.softPityBonusPerPull ?? 0;
  if (!start || !bonusPerPull || pityCount < start) return 0;
  return (pityCount - start + 1) * bonusPerPull;
}

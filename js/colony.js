import { dataStore } from "./data.js";
import { getCollectionPassiveIncome } from "./hamsters.js";
import { addResources } from "./inventory.js";

const PASSIVE_CAP_MS = 8 * 60 * 60 * 1000;

export function getUpgradeLevel(state, upgradeId) {
  return state.colony?.upgrades?.[upgradeId] ?? 0;
}

export function getUpgradeCost(state, upgrade) {
  const level = getUpgradeLevel(state, upgrade.id);
  const cost = {};
  for (const [resource, amount] of Object.entries(upgrade.baseCost)) {
    cost[resource] = Math.ceil(amount * Math.pow(upgrade.costGrowth, level));
  }
  return cost;
}

export function canAfford(state, cost) {
  return Object.entries(cost).every(([resource, amount]) => (state.resources[resource] ?? 0) >= amount);
}

export function spendResources(state, cost) {
  for (const [resource, amount] of Object.entries(cost)) {
    state.resources[resource] -= amount;
  }
}

export function upgradeColony(state, upgradeId) {
  const upgrade = dataStore.colonyUpgrades.find((candidate) => candidate.id === upgradeId);
  if (!upgrade) throw new Error("Unknown colony upgrade");

  const level = getUpgradeLevel(state, upgradeId);
  if (level >= upgrade.maxLevel) throw new Error("Upgrade already maxed");

  const cost = getUpgradeCost(state, upgrade);
  if (!canAfford(state, cost)) throw new Error("Not enough resources");

  spendResources(state, cost);
  state.colony.upgrades[upgradeId] = level + 1;
  return upgrade;
}

export function getColonyStats(state) {
  const stats = {
    passiveIncomePerMin: { food: 0, wood: 0, gold: 0 },
    expeditionSpeedPercent: 0,
    expeditionSlots: 1,
    gachaLuckPercent: 0
  };

  for (const upgrade of dataStore.colonyUpgrades) {
    const level = getUpgradeLevel(state, upgrade.id);
    if (!level) continue;

    if (upgrade.effect.type === "passive_income") {
      stats.passiveIncomePerMin.food += (upgrade.effect.foodPerMin ?? 0) * level;
      stats.passiveIncomePerMin.wood += (upgrade.effect.woodPerMin ?? 0) * level;
      stats.passiveIncomePerMin.gold += ((upgrade.effect.goldPerMin ?? 0) + (upgrade.effect.coinsPerMin ?? 0)) * level;
    }

    if (upgrade.effect.type === "expedition_speed") {
      stats.expeditionSpeedPercent += upgrade.effect.percentPerLevel * level;
    }

    if (upgrade.effect.type === "expedition_slots") {
      stats.expeditionSlots += upgrade.effect.slotsPerLevel * level;
    }

    if (upgrade.effect.type === "gacha_luck") {
      stats.gachaLuckPercent += upgrade.effect.percentPerLevel * level;
    }
  }

  const collectionIncome = getCollectionPassiveIncome(state);
  for (const [resource, amount] of Object.entries(collectionIncome)) {
    const targetResource = resource === "coins" ? "gold" : resource;
    stats.passiveIncomePerMin[targetResource] = (stats.passiveIncomePerMin[targetResource] ?? 0) + amount;
  }

  return stats;
}

export function collectPassiveIncome(state, now = Date.now()) {
  if (!state.colony.lastPassiveAt) {
    state.colony.lastPassiveAt = now;
    return null;
  }

  const elapsed = Math.min(PASSIVE_CAP_MS, Math.max(0, now - state.colony.lastPassiveAt));
  if (elapsed < 60 * 1000) return null;

  const minutes = Math.floor(elapsed / 60000);
  const stats = getColonyStats(state);
  const rewards = {};

  for (const [resource, amountPerMin] of Object.entries(stats.passiveIncomePerMin)) {
    const amount = Math.floor(amountPerMin * minutes);
    if (amount > 0) rewards[resource] = amount;
  }

  state.colony.lastPassiveAt += minutes * 60000;
  if (Object.keys(rewards).length) {
    addResources(state, rewards);
    return rewards;
  }
  return null;
}

export function getUsedExpeditionSlots(state) {
  return state.expeditions.filter((expedition) => expedition.status === "active" || expedition.status === "completed").length;
}

export function getMaxExpeditionSlots(state) {
  return getColonyStats(state).expeditionSlots;
}

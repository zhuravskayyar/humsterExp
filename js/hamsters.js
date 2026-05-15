export function getHamster(state, hamsterId) {
  return state.hamsters.find((hamster) => hamster.id === hamsterId);
}

export function getHamsterTemplate(data, hamsterId) {
  return data.hamsters.find((hamster) => hamster.id === hamsterId);
}

export function getAvailableHamsters(state) {
  return state.hamsters.filter((hamster) => hamster.status === "available");
}

export function setHamsterStatus(state, hamsterIds, status) {
  for (const hamster of state.hamsters) {
    if (hamsterIds.includes(hamster.id)) {
      hamster.status = status;
      if (status === "injured") {
        hamster.recoverAt = Date.now() + 30 * 60 * 1000;
      }
      if (status === "resting") {
        hamster.recoverAt = Date.now() + 10 * 60 * 1000;
      }
      if (status === "available") {
        delete hamster.recoverAt;
      }
    }
  }
}

export function recoverHamsters(state) {
  const now = Date.now();
  let changed = false;

  for (const hamster of state.hamsters) {
    if ((hamster.status === "injured" || hamster.status === "resting") && hamster.recoverAt && now >= hamster.recoverAt) {
      hamster.status = "available";
      delete hamster.recoverAt;
      changed = true;
    }
  }

  return changed;
}

export function grantHamsterXp(state, hamsterIds, xp) {
  for (const hamster of state.hamsters) {
    if (!hamsterIds.includes(hamster.id)) continue;
    hamster.xp += xp;
    const needed = hamster.level * 100;
    if (hamster.xp >= needed && hamster.level < (hamster.maxLevel ?? 90)) {
      hamster.xp -= needed;
      applyHamsterLevel(hamster);
    }
  }
}

export function getHamsterLevelCost(hamster) {
  const level = hamster.level ?? 1;
  return {
    gold: 18 + level * 7,
    xpBooks: Math.ceil(level / 8) + 1
  };
}

export function canLevelHamster(state, hamster) {
  if (!hamster || hamster.level >= (hamster.maxLevel ?? 90)) return false;
  const cost = getHamsterLevelCost(hamster);
  return Object.entries(cost).every(([resource, amount]) => (state.resources[resource] ?? 0) >= amount);
}

export function levelUpHamster(state, hamsterId) {
  const hamster = getHamster(state, hamsterId);
  if (!hamster) throw new Error("Хом'яка не знайдено");
  if (hamster.level >= (hamster.maxLevel ?? 90)) throw new Error("Хом'як вже має максимальний рівень");

  const cost = getHamsterLevelCost(hamster);
  for (const [resource, amount] of Object.entries(cost)) {
    if ((state.resources[resource] ?? 0) < amount) throw new Error(`Недостатньо ресурсу: ${resource}`);
  }
  for (const [resource, amount] of Object.entries(cost)) {
    state.resources[resource] -= amount;
  }
  applyHamsterLevel(hamster);
  return hamster;
}

function applyHamsterLevel(hamster) {
  hamster.level += 1;
  hamster.hp = (hamster.hp ?? 80) + 8 + hamster.stars * 2;
  hamster.attack = (hamster.attack ?? 10) + 2 + (hamster.class === "Warrior" || hamster.class === "Mutant" ? 1 : 0);
  hamster.defense = (hamster.defense ?? 6) + 1 + (hamster.class === "Medic" ? 1 : 0);
  hamster.power += 1;
  hamster.speed += hamster.class === "Scout" ? 2 : 1;
  hamster.luck += hamster.class === "Lucky" ? 2 : 1;
  hamster.carry += hamster.class === "Gatherer" ? 2 : 1;
  hamster.stamina += hamster.class === "Warrior" || hamster.class === "Medic" ? 2 : 1;
}

export function getUnlockedConstellations(hamster) {
  const level = hamster.constellationLevel ?? 0;
  return (hamster.constellations ?? []).filter((constellation) => constellation.level <= level);
}

export function getHamsterEffectiveStats(hamster, state = null) {
  const stats = {
    hp: hamster.hp ?? 80,
    attack: hamster.attack ?? 10,
    defense: hamster.defense ?? 6,
    power: hamster.power,
    speed: hamster.speed,
    luck: hamster.luck,
    carry: hamster.carry,
    stamina: hamster.stamina,
    expeditionSpeedBonus: 0,
    lootBonus: 0,
    rareBonus: 0,
    injuryResist: 0,
    passiveIncome: {}
  };

  for (const constellation of getUnlockedConstellations(hamster)) {
    applyConstellationEffect(stats, constellation.effect);
  }

  if (state) {
    const equipmentBySlot = getHamsterEquipment(state, hamster);
    for (const equipment of Object.values(equipmentBySlot)) {
      if (!equipment) continue;
      addStats(stats, getEquipmentStats(equipment));
      addStats(stats, getSignatureBonus(hamster, equipment));
    }
  }

  return stats;
}

export function getCollectionPassiveIncome(state) {
  const income = {};
  for (const hamster of state.hamsters) {
    const stats = getHamsterEffectiveStats(hamster);
    for (const [resource, value] of Object.entries(stats.passiveIncome)) {
      income[resource] = (income[resource] ?? 0) + value;
    }
  }
  return income;
}

function applyConstellationEffect(stats, effect) {
  if (!effect) return;

  if (effect.type === "stat") {
    stats[effect.stat] += effect.value;
  }

  if (effect.type === "multi_stat") {
    for (const [stat, value] of Object.entries(effect.stats)) {
      stats[stat] += value;
    }
  }

  if (effect.type === "loot_bonus") {
    stats.lootBonus += effect.value;
  }

  if (effect.type === "rare_bonus") {
    stats.rareBonus += effect.value;
  }

  if (effect.type === "injury_resist") {
    stats.injuryResist += effect.value;
  }

  if (effect.type === "expedition_speed") {
    stats.expeditionSpeedBonus += effect.value;
  }

  if (effect.type === "passive_income") {
    stats.passiveIncome[effect.resource] = (stats.passiveIncome[effect.resource] ?? 0) + effect.value;
  }

  if (effect.type === "compound") {
    for (const nestedEffect of effect.effects) {
      applyConstellationEffect(stats, nestedEffect);
    }
  }
}

function addStats(stats, bonus) {
  for (const [stat, value] of Object.entries(bonus ?? {})) {
    stats[stat] = (stats[stat] ?? 0) + value;
  }
}
import { getEquipmentStats, getHamsterEquipment, getSignatureBonus } from "./equipment.js";

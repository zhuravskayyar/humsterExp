import { dataStore, findItem, findZone } from "./data.js";
import { createEquipmentFromItem } from "./equipment.js";
import { getHamster, getHamsterEffectiveStats, grantHamsterXp, setHamsterStatus } from "./hamsters.js";
import { addItem, addResources } from "./inventory.js";
import { clamp, randomInt } from "./state.js";
import { canAfford, getColonyStats, getMaxExpeditionSlots, getUsedExpeditionSlots, spendResources } from "./colony.js";

const resultLabels = {
  full_success: "Повний успіх",
  partial_success: "Частковий успіх",
  failure: "Провал",
  rare_find: "Велика знахідка",
  ambush: "Засідка",
  injury: "Травма",
  special_event: "Особлива подія"
};

export const EXPEDITION_RATIONS = Object.freeze([
  {
    id: "none",
    label: "Без пайка",
    foodPerHamster: 0,
    successBonus: 0,
    lootBonus: 0,
    injuryResist: 0,
    description: "Крихти лишаються в норі."
  },
  {
    id: "snack",
    label: "Легкий пайок",
    foodPerHamster: 18,
    successBonus: 4,
    lootBonus: 6,
    injuryResist: 4,
    description: "Трохи впевненості перед короткою вилазкою."
  },
  {
    id: "meal",
    label: "Ситний пайок",
    foodPerHamster: 38,
    successBonus: 8,
    lootBonus: 12,
    injuryResist: 8,
    description: "Добрий баланс шансу, луту і безпеки."
  },
  {
    id: "bundle",
    label: "Запас на дорогу",
    foodPerHamster: 70,
    successBonus: 12,
    lootBonus: 20,
    injuryResist: 14,
    description: "Дорого, але корисно для ризикових маршрутів."
  }
]);

export function getExpeditionRation(rationId = "none") {
  return EXPEDITION_RATIONS.find((ration) => ration.id === rationId) ?? EXPEDITION_RATIONS[0];
}

export function getExpeditionRationCost(rationOrId, teamSize = 1) {
  const ration = typeof rationOrId === "string" ? getExpeditionRation(rationOrId) : rationOrId;
  const food = (ration?.foodPerHamster ?? 0) * Math.max(1, Number(teamSize) || 1);
  return food > 0 ? { food } : {};
}

export function calculateTeam(state, hamsterIds) {
  const hamsters = hamsterIds.map((id) => getHamster(state, id)).filter(Boolean);
  const effective = hamsters.map((hamster) => getHamsterEffectiveStats(hamster, state));
  return {
    hamsters,
    hp: effective.reduce((sum, stats) => sum + stats.hp, 0),
    attack: effective.reduce((sum, stats) => sum + stats.attack, 0),
    defense: effective.reduce((sum, stats) => sum + stats.defense, 0),
    combat: effective.reduce((sum, stats) => sum + getExpectedAttack(stats) + stats.defense * 0.65 + stats.hp / 14 + (stats.signatureDamageBonus ?? 0), 0),
    power: effective.reduce((sum, stats) => sum + stats.power, 0),
    speed: effective.reduce((sum, stats) => sum + stats.speed, 0),
    luck: effective.reduce((sum, stats) => sum + stats.luck, 0),
    carry: effective.reduce((sum, stats) => sum + stats.carry, 0),
    stamina: effective.reduce((sum, stats) => sum + stats.stamina, 0),
    expeditionSpeedBonus: effective.reduce((sum, stats) => sum + stats.expeditionSpeedBonus, 0),
    lootBonus: effective.reduce((sum, stats) => sum + stats.lootBonus, 0),
    rareBonus: effective.reduce((sum, stats) => sum + stats.rareBonus, 0),
    injuryResist: effective.reduce((sum, stats) => sum + stats.injuryResist, 0)
  };
}

function getExpectedAttack(stats) {
  const critChance = Math.max(0, Math.min(75, stats.critChance ?? 0));
  const critDamage = Math.max(0, stats.critDamage ?? 0);
  return stats.attack * (1 + (critChance / 100) * (critDamage / 100));
}

export function calculateSuccessChance(state, zoneId, hamsterIds, rationId = "none") {
  const zone = findZone(zoneId);
  if (!zone || !hamsterIds.length) return 0;
  const team = calculateTeam(state, hamsterIds);
  const ration = getExpeditionRation(rationId);
  const combatBonus = (team.combat / Math.max(1, zone.requiredPower * 4)) * 14;
  const successChance = zone.baseChance + (team.power / zone.requiredPower) * 18 + combatBonus + team.luck * 0.2 + ration.successBonus - zone.danger;
  return Math.round(clamp(successChance, 5, 95));
}

export function launchExpedition(state, zoneId, hamsterIds, durationMs, rationId = "none") {
  const zone = findZone(zoneId);
  if (!zone) throw new Error("Unknown zone");
  if (!hamsterIds.length) throw new Error("Select at least one hamster");
  if (getUsedExpeditionSlots(state) >= getMaxExpeditionSlots(state)) {
    throw new Error("Немає вільного слота експедиції");
  }

  const selected = hamsterIds.map((id) => getHamster(state, id)).filter(Boolean);
  if (selected.length !== hamsterIds.length || selected.some((hamster) => hamster.status !== "available")) {
    throw new Error("Only available hamsters can join");
  }
  const maxTeam = zone.maxTeam ?? 3;
  if (selected.length > maxTeam) {
    throw new Error(`У цю зону можна взяти максимум ${maxTeam} хом'яків`);
  }

  const ration = getExpeditionRation(rationId);
  const rationCost = getExpeditionRationCost(ration, selected.length);
  if (!canAfford(state, rationCost)) {
    throw new Error("Бракує крихт на обраний пайок");
  }
  spendResources(state, rationCost);

  const now = Date.now();
  const team = calculateTeam(state, hamsterIds);
  const colonyStats = getColonyStats(state);
  const speedBonus = Math.min(0.55, team.speed / 300 + (team.expeditionSpeedBonus + colonyStats.expeditionSpeedPercent) / 100);
  const baseDuration = clamp(durationMs, zone.minDurationMs, zone.maxDurationMs);
  const adjustedDuration = Math.round(baseDuration * (1 - speedBonus));
  const expedition = {
    id: crypto.randomUUID(),
    zoneId,
    hamsterIds: [...hamsterIds],
    baseDurationMs: baseDuration,
    durationMs: adjustedDuration,
    startTime: now,
    endTime: now + adjustedDuration,
    status: "active",
    ration: ration.id === "none"
      ? null
      : {
          id: ration.id,
          label: ration.label,
          cost: rationCost,
          successBonus: ration.successBonus,
          lootBonus: ration.lootBonus,
          injuryResist: ration.injuryResist
        },
    result: null
  };

  state.expeditions.unshift(expedition);
  state.stats.expeditionsStarted += 1;
  setHamsterStatus(state, hamsterIds, "in_expedition");
  return expedition;
}

export function updateExpeditionStatuses(state) {
  const now = Date.now();
  const completed = [];

  for (const expedition of state.expeditions) {
    if (expedition.status === "active" && now >= expedition.endTime) {
      expedition.status = "completed";
      expedition.result = generateExpeditionResult(state, expedition);
      completed.push(expedition);
    }
  }

  return completed;
}

export function claimExpedition(state, expeditionId) {
  const expedition = state.expeditions.find((candidate) => candidate.id === expeditionId);
  if (!expedition || expedition.status !== "completed" || !expedition.result) {
    return null;
  }

  addResources(state, expedition.result.resources);
  for (const item of expedition.result.items) {
    const itemData = findItem(item.itemId);
    if (itemData?.equipmentSlot) {
      for (let i = 0; i < item.quantity; i += 1) {
        state.equipment.push(createEquipmentFromItem(itemData));
      }
    } else {
      addItem(state, item.itemId, item.quantity);
    }
    if ((itemData?.stars ?? 1) >= 4 || ["Rare", "Epic", "Legendary", "Mythic"].includes(itemData?.rarity)) {
      state.stats.rareItemsFound += 1;
    }
  }

  grantHamsterXp(state, expedition.hamsterIds, expedition.result.xp);
  if (expedition.result.injuredHamsterId) {
    const healthyIds = expedition.hamsterIds.filter((id) => id !== expedition.result.injuredHamsterId);
    setHamsterStatus(state, healthyIds, "available");
    setHamsterStatus(state, [expedition.result.injuredHamsterId], "injured");
  } else {
    setHamsterStatus(state, expedition.hamsterIds, expedition.result.hamsterStatus);
  }
  if (expedition.result.resources.food) {
    state.stats.foodCollected += expedition.result.resources.food;
  }
  if (!expedition.result.injuredHamsterId) {
    state.stats.cleanReturns += 1;
  }

  expedition.status = "claimed";
  return expedition.result;
}

function generateExpeditionResult(state, expedition) {
  const zone = findZone(expedition.zoneId);
  const team = calculateTeam(state, expedition.hamsterIds);
  const ration = getExpeditionRation(expedition.ration?.id);
  const chance = calculateSuccessChance(state, expedition.zoneId, expedition.hamsterIds, ration.id);
  const roll = randomInt(1, 100);
  const event = pickEvent(team, zone);
  const baseDuration = expedition.baseDurationMs ?? expedition.durationMs;
  const durationMultiplier = clamp(baseDuration / zone.minDurationMs, 1, 3);
  const carryMultiplier = 1 + team.carry / 80;
  const rareRoll = randomInt(1, 100);

  let resultType = "failure";
  let lootMultiplier = 0.25;
  let hamsterStatus = "available";
  let injuredHamsterId = null;

  if (roll <= Math.max(8, chance - 18) && rareRoll <= zone.rareChance + team.luck * 0.25 + team.rareBonus) {
    resultType = "rare_find";
    lootMultiplier = 1.55;
  } else if (roll <= chance) {
    resultType = "full_success";
    lootMultiplier = 1.1;
  } else if (roll <= chance + 22) {
    resultType = "partial_success";
    lootMultiplier = 0.68;
  } else {
    resultType = randomInt(1, 100) <= 45 ? "ambush" : "failure";
    lootMultiplier = resultType === "ambush" ? 0.35 : 0.2;
    if (randomInt(1, 100) > team.stamina + team.defense * 0.25 + team.injuryResist + ration.injuryResist) {
      hamsterStatus = "injured";
    }
  }

  if (event?.risk === "injury" && randomInt(1, 100) > team.injuryResist + team.defense * 0.2 + ration.injuryResist) {
    resultType = "injury";
    hamsterStatus = "injured";
  } else if (event?.risk === "minor_injury" && randomInt(1, 100) <= Math.max(5, 25 - team.injuryResist - ration.injuryResist)) {
    resultType = "injury";
    hamsterStatus = "injured";
  } else if (event?.risk === "rest" || event?.risk === "delay") {
    hamsterStatus = "resting";
  } else if (event?.id && resultType === "full_success") {
    resultType = "special_event";
  }

  if (hamsterStatus === "injured") {
    const injured = team.hamsters[randomInt(0, team.hamsters.length - 1)];
    injuredHamsterId = injured?.id ?? null;
  }

  const combatLootMultiplier = 1 + Math.min(0.25, team.combat / 900);
  const rationLootMultiplier = 1 + ration.lootBonus / 100;
  const resources = buildLoot(zone, event, durationMultiplier, carryMultiplier, lootMultiplier * combatLootMultiplier * rationLootMultiplier, team);
  const items = buildItems(zone, event, resultType, team);
  const xp = Math.round(22 * durationMultiplier + zone.level * 8 + (resultType === "rare_find" ? 18 : 0));

  return {
    type: resultType,
    title: resultLabels[resultType],
    zoneName: zone.name,
    chance,
    roll,
    durationMultiplier,
    event,
    ration: expedition.ration ?? null,
    resources,
    items,
    xp,
    hamsterStatus,
    injuredHamsterId,
    text: buildResultText(resultType, zone, event)
  };
}

function pickEvent(team, zone) {
  const candidates = dataStore.events.filter((event) => {
    if (!event.bonusClass) return true;
    return team.hamsters.some((hamster) => hamster.class === event.bonusClass) || randomInt(1, 100) <= 55 + zone.level * 5;
  });
  return candidates[randomInt(0, candidates.length - 1)] ?? dataStore.events[0];
}

function buildLoot(zone, event, durationMultiplier, carryMultiplier, lootMultiplier, team) {
  const resources = {};
  const constellationMultiplier = 1 + team.lootBonus / 100;
  for (const resource of zone.resources) {
    const base = resource === "shiny" ? randomInt(1, 3) : resource === "xpBooks" ? randomInt(1, 3) : resource === "ore" ? randomInt(3, 8) : resource === "gold" ? randomInt(10, 24) : randomInt(12, 28);
    const amount = resource === "shiny"
      ? Math.max(1, Math.round(base * durationMultiplier * lootMultiplier * constellationMultiplier))
      : Math.floor(base * durationMultiplier * carryMultiplier * lootMultiplier * constellationMultiplier);
    if (amount > 0) resources[resource] = (resources[resource] ?? 0) + amount;
  }

  if (event?.resources) {
    for (const [resource, amount] of Object.entries(event.resources)) {
      resources[resource] = (resources[resource] ?? 0) + Math.ceil(amount * lootMultiplier * constellationMultiplier);
    }
  }

  return resources;
}

function buildItems(zone, event, resultType, team) {
  const items = [];
  const itemChance = (event?.itemChance ?? 8) + zone.rareChance + team.luck * 0.3 + team.rareBonus + (resultType === "rare_find" ? 35 : 0);
  if (randomInt(1, 100) > itemChance) return items;

  const pool = dataStore.items.filter((item) => {
    if (resultType === "rare_find") return ["Rare", "Epic", "Legendary", "Mythic"].includes(item.rarity);
    return ["Common", "Uncommon", "Rare"].includes(item.rarity);
  });
  const item = pool[randomInt(0, pool.length - 1)];
  if (item) items.push({ itemId: item.id, quantity: 1 });
  return items;
}

function buildResultText(resultType, zone, event) {
  const intro = {
    full_success: `Загін повернувся з ${zone.name} з повними лапками луту.`,
    partial_success: `Маршрут у ${zone.name} був складним, але частину здобичі вдалося винести.`,
    failure: `Експедиція в ${zone.name} зірвалася. Хом'яки повернулися з пилом у вусах.`,
    rare_find: `У ${zone.name} загін знайшов щось значно цінніше за звичайні крихти.`,
    ambush: `У ${zone.name} загін натрапив на небезпеку і відступив під шум труб.`,
    injury: `Експедиція принесла здобич, але один хом'як потребує лікування.`,
    special_event: `Маленька історія з ${zone.name} стала новою легендою нори.`
  }[resultType];
  return `${intro} ${event?.text ?? ""}`.trim();
}

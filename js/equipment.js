import { findItem } from "./data.js";
import { addResources } from "./inventory.js";

export const EQUIPMENT_SLOTS = ["weapon", "armor", "backpack", "tool", "charm"];

export function createEquipmentFromItem(item) {
  if (!item?.equipmentSlot) return null;
  return {
    uid: crypto.randomUUID(),
    itemId: item.id,
    level: 1,
    maxLevel: item.maxLevel ?? 90,
    equippedBy: null,
    locked: false
  };
}

export function getEquipmentTemplate(equipment) {
  return findItem(equipment.itemId);
}

export function getEquipmentByUid(state, uid) {
  return state.equipment.find((equipment) => equipment.uid === uid);
}

export function getHamsterEquipment(state, hamster) {
  const slots = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const uid = hamster.equipmentSlots?.[slot];
    slots[slot] = uid ? getEquipmentByUid(state, uid) ?? null : null;
  }
  return slots;
}

export function getAvailableEquipmentForSlot(state, slot, hamsterId = null) {
  return state.equipment.filter((equipment) => {
    const item = getEquipmentTemplate(equipment);
    if (item?.equipmentSlot !== slot) return false;
    return !equipment.equippedBy || equipment.equippedBy === hamsterId;
  });
}

export function equipItem(state, hamsterId, equipmentUid) {
  const hamster = state.hamsters.find((candidate) => candidate.id === hamsterId);
  const equipment = getEquipmentByUid(state, equipmentUid);
  const item = equipment ? getEquipmentTemplate(equipment) : null;
  if (!hamster || !equipment || !item?.equipmentSlot) throw new Error("Неможливо екіпірувати предмет");

  const slot = item.equipmentSlot;
  if (equipment.equippedBy && equipment.equippedBy !== hamsterId) {
    const previousOwner = state.hamsters.find((candidate) => candidate.id === equipment.equippedBy);
    if (previousOwner?.equipmentSlots?.[slot] === equipment.uid) {
      previousOwner.equipmentSlots[slot] = null;
    }
  }

  const previousUid = hamster.equipmentSlots?.[slot];
  if (previousUid) {
    const previous = getEquipmentByUid(state, previousUid);
    if (previous) previous.equippedBy = null;
  }

  hamster.equipmentSlots[slot] = equipment.uid;
  equipment.equippedBy = hamsterId;
}

export function unequipSlot(state, hamsterId, slot) {
  const hamster = state.hamsters.find((candidate) => candidate.id === hamsterId);
  if (!hamster?.equipmentSlots?.[slot]) return;
  const equipment = getEquipmentByUid(state, hamster.equipmentSlots[slot]);
  if (equipment) equipment.equippedBy = null;
  hamster.equipmentSlots[slot] = null;
}

export function getEquipmentLevelCost(equipment) {
  const item = getEquipmentTemplate(equipment);
  const level = equipment.level ?? 1;
  const stars = item?.stars ?? 1;
  return {
    gold: 12 + level * 4 * stars,
    ore: Math.ceil(level / 4) + stars
  };
}

export function needsFodder(equipment) {
  return equipment.level > 0 && equipment.level % 10 === 0;
}

export function findFodderEquipment(state, targetEquipment) {
  const targetItem = getEquipmentTemplate(targetEquipment);
  return state.equipment.find((equipment) => {
    if (equipment.uid === targetEquipment.uid || equipment.equippedBy || equipment.locked) return false;
    const item = getEquipmentTemplate(equipment);
    return item?.equipmentSlot === targetItem?.equipmentSlot;
  });
}

export function canUpgradeEquipment(state, equipment) {
  if (!equipment || equipment.level >= equipment.maxLevel) return false;
  const cost = getEquipmentLevelCost(equipment);
  const hasResources = Object.entries(cost).every(([resource, amount]) => (state.resources[resource] ?? 0) >= amount);
  if (!hasResources) return false;
  return !needsFodder(equipment) || Boolean(findFodderEquipment(state, equipment));
}

export function upgradeEquipment(state, uid) {
  const equipment = getEquipmentByUid(state, uid);
  if (!equipment) throw new Error("Предмет не знайдено");
  if (equipment.level >= equipment.maxLevel) throw new Error("Предмет вже має максимальний рівень");

  const cost = getEquipmentLevelCost(equipment);
  for (const [resource, amount] of Object.entries(cost)) {
    if ((state.resources[resource] ?? 0) < amount) throw new Error(`Недостатньо ресурсу: ${resource}`);
  }

  let fodder = null;
  if (needsFodder(equipment)) {
    fodder = findFodderEquipment(state, equipment);
    if (!fodder) throw new Error("Потрібна зайва зброя/екіпіровка того ж слота як матеріал");
  }

  for (const [resource, amount] of Object.entries(cost)) {
    state.resources[resource] -= amount;
  }
  if (fodder) {
    state.equipment = state.equipment.filter((candidate) => candidate.uid !== fodder.uid);
  }
  equipment.level += 1;
  return equipment;
}

export function salvageEquipment(state, uid) {
  const equipment = getEquipmentByUid(state, uid);
  if (!equipment) throw new Error("Предмет не знайдено");
  if (equipment.equippedBy) throw new Error("Спочатку зніміть предмет");
  if (equipment.locked) throw new Error("Заблокований предмет не можна розібрати");

  const item = getEquipmentTemplate(equipment);
  const reward = {
    ore: Math.max(2, (item?.stars ?? 1) * 3 + Math.floor((equipment.level ?? 1) / 3)),
    gold: Math.max(5, (item?.stars ?? 1) * 8)
  };
  state.equipment = state.equipment.filter((candidate) => candidate.uid !== uid);
  addResources(state, reward);
  return reward;
}

export function getEquipmentStats(equipment) {
  const item = getEquipmentTemplate(equipment);
  if (!item) return {};
  const level = equipment.level ?? 1;
  const scale = 1 + (level - 1) * 0.075;
  return Object.fromEntries(
    Object.entries(item.stats ?? {}).map(([stat, value]) => [stat, Math.round(value * scale)])
  );
}

export function getSignatureBonus(hamster, equipment) {
  const item = equipment ? getEquipmentTemplate(equipment) : null;
  if (!item?.signatureFor || item.signatureFor !== hamster.id) return {};
  return {
    attack: Math.max(4, item.stars * 2),
    hp: item.stars * 12,
    signatureDamageBonus: 10
  };
}

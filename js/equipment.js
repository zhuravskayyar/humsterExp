import { findItem } from "./data.js";
import { addResources } from "./inventory.js";

export const EQUIPMENT_SLOTS = ["weapon", "armor", "backpack", "tool", "charm"];
export const WEAPON_COPY_MAX = 5;

const SIGNATURE_PASSIVES = {
  ham_1: { carry: 4, lootBonus: 4 },
  ham_2: { speed: 4, expeditionSpeedBonus: 3 },
  ham_3: { attack: 5, defense: 3 },
  ham_4: { luck: 5, rareBonus: 3 },
  ham_5: { speed: 3, defense: 3, expeditionSpeedBonus: 2 },
  ham_6: { hp: 34, injuryResist: 4 },
  ham_7: { attack: 6, critChance: 3 },
  ham_8: { speed: 5, critDamage: 22 }
};

const RARITY_RANK = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
  Mythic: 6
};

export function createEquipmentFromItem(item) {
  if (!item?.equipmentSlot) return null;
  return {
    uid: crypto.randomUUID(),
    itemId: item.id,
    level: 1,
    maxLevel: item.maxLevel ?? 90,
    copies: 0,
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

export function getEquipmentQualityScore(equipment) {
  const item = getEquipmentTemplate(equipment);
  if (!item) return 0;
  return (item.stars ?? 1) * 10 + (RARITY_RANK[item.rarity] ?? 0);
}

function isValidMaterial(candidate, targetEquipment, allowEqualQuality = false) {
  if (!candidate || !targetEquipment) return false;
  if (candidate.uid === targetEquipment.uid || candidate.equippedBy || candidate.locked) return false;

  const candidateItem = getEquipmentTemplate(candidate);
  const targetItem = getEquipmentTemplate(targetEquipment);
  if (!candidateItem || !targetItem || candidateItem.equipmentSlot !== targetItem.equipmentSlot) return false;

  const candidateQuality = getEquipmentQualityScore(candidate);
  const targetQuality = getEquipmentQualityScore(targetEquipment);
  return allowEqualQuality ? candidateQuality <= targetQuality : candidateQuality < targetQuality;
}

export function needsFodder(equipment) {
  return equipment.level > 0 && equipment.level % 10 === 0;
}

export function findFodderEquipment(state, targetEquipment) {
  return state.equipment
    .filter((equipment) => isValidMaterial(equipment, targetEquipment, true))
    .sort((a, b) => getEquipmentQualityScore(a) - getEquipmentQualityScore(b) || (a.level ?? 1) - (b.level ?? 1))[0] ?? null;
}

export function findInferiorFodderEquipment(state, targetEquipment) {
  return state.equipment
    .filter((equipment) => isValidMaterial(equipment, targetEquipment, false))
    .sort((a, b) => getEquipmentQualityScore(a) - getEquipmentQualityScore(b) || (a.level ?? 1) - (b.level ?? 1))[0] ?? null;
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
    if (!fodder) throw new Error("Потрібен вільний предмет того ж слота не кращої якості");
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

export function canUpgradeEquipmentWithFodder(state, equipment) {
  if (!equipment || equipment.level >= equipment.maxLevel) return false;
  return Boolean(findInferiorFodderEquipment(state, equipment));
}

export function upgradeEquipmentWithFodder(state, uid) {
  const equipment = getEquipmentByUid(state, uid);
  if (!equipment) throw new Error("Предмет не знайдено");
  if (equipment.level >= equipment.maxLevel) throw new Error("Предмет вже має максимальний рівень");

  const fodder = findInferiorFodderEquipment(state, equipment);
  if (!fodder) throw new Error("Потрібен вільний предмет гіршої якості того ж слота");

  const levelsGained = Math.min(
    equipment.maxLevel - equipment.level,
    Math.max(1, Math.min(5, 1 + Math.floor(((fodder.level ?? 1) - 1) / 10)))
  );
  state.equipment = state.equipment.filter((candidate) => candidate.uid !== fodder.uid);
  equipment.level += levelsGained;
  return { equipment, fodder, levelsGained };
}

export function getWeaponCopies(equipment) {
  return Math.max(0, Math.min(WEAPON_COPY_MAX, Number(equipment?.copies ?? equipment?.refine ?? 0) || 0));
}

export function getWeaponCopyStats(equipment) {
  const item = getEquipmentTemplate(equipment);
  const copies = getWeaponCopies(equipment);
  if (item?.equipmentSlot !== "weapon" || copies <= 0) return {};

  return {
    critChance: copies * 5,
    critDamage: 50 + copies * 10
  };
}

function isValidWeaponCopy(candidate, targetEquipment) {
  if (!candidate || !targetEquipment) return false;
  if (candidate.uid === targetEquipment.uid || candidate.equippedBy || candidate.locked) return false;
  const candidateItem = getEquipmentTemplate(candidate);
  const targetItem = getEquipmentTemplate(targetEquipment);
  return Boolean(
    candidateItem &&
    targetItem &&
    targetItem.equipmentSlot === "weapon" &&
    candidateItem.equipmentSlot === "weapon" &&
    candidate.itemId === targetEquipment.itemId
  );
}

export function findWeaponCopyEquipment(state, targetEquipment) {
  return state.equipment
    .filter((equipment) => isValidWeaponCopy(equipment, targetEquipment))
    .sort((a, b) => getWeaponCopies(a) - getWeaponCopies(b) || (a.level ?? 1) - (b.level ?? 1))[0] ?? null;
}

export function canRefineWeapon(state, equipment) {
  const item = getEquipmentTemplate(equipment);
  return Boolean(item?.equipmentSlot === "weapon" && getWeaponCopies(equipment) < WEAPON_COPY_MAX && findWeaponCopyEquipment(state, equipment));
}

export function refineWeapon(state, uid) {
  const equipment = getEquipmentByUid(state, uid);
  if (!equipment) throw new Error("Предмет не знайдено");
  const item = getEquipmentTemplate(equipment);
  if (item?.equipmentSlot !== "weapon") throw new Error("Зливати копії можна тільки в зброю");
  if (getWeaponCopies(equipment) >= WEAPON_COPY_MAX) throw new Error("Зброя вже має максимум копій");

  const copy = findWeaponCopyEquipment(state, equipment);
  if (!copy) throw new Error("Потрібна вільна копія тієї самої зброї");

  equipment.copies = getWeaponCopies(equipment) + 1;
  state.equipment = state.equipment.filter((candidate) => candidate.uid !== copy.uid);
  return { equipment, copy };
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
  return {
    ...Object.fromEntries(
    Object.entries(item.stats ?? {}).map(([stat, value]) => [stat, Math.round(value * scale)])
    ),
    ...getWeaponCopyStats(equipment)
  };
}

export function getSignatureBonus(hamster, equipment) {
  const item = equipment ? getEquipmentTemplate(equipment) : null;
  if (!item?.signatureFor || item.signatureFor !== hamster.id) return {};
  const copies = getWeaponCopies(equipment);
  const passive = SIGNATURE_PASSIVES[item.signatureFor] ?? {};
  const bonus = {
    attack: Math.max(4, item.stars * 2) + copies * 2,
    hp: item.stars * 12 + copies * 8,
    signatureDamageBonus: 10 + copies * 4
  };

  for (const [stat, value] of Object.entries(passive)) {
    const scale = stat === "hp" || stat === "critDamage" ? copies * 8 : copies * 2;
    bonus[stat] = (bonus[stat] ?? 0) + value + scale;
  }

  return bonus;
}

export function getSignaturePassiveText(equipment) {
  const item = equipment ? getEquipmentTemplate(equipment) : null;
  if (!item?.signatureFor) return "";
  const passive = getSignatureBonus({ id: item.signatureFor }, equipment);
  const readable = Object.entries(passive)
    .filter(([stat]) => stat !== "signatureDamageBonus")
    .map(([stat, value]) => `${signatureStatLabel(stat)} +${value}`)
    .join(" · ");
  return readable ? `Сигн. пасив: ${readable}` : "Сигн. пасив активується власником";
}

function signatureStatLabel(stat) {
  return {
    hp: "HP",
    attack: "урон",
    defense: "захист",
    power: "сила",
    speed: "швидк.",
    luck: "удача",
    carry: "вантаж",
    stamina: "витрив.",
    lootBonus: "лут",
    rareBonus: "рідк.",
    injuryResist: "травмост.",
    expeditionSpeedBonus: "маршрут",
    critChance: "крит шанс",
    critDamage: "крит урон"
  }[stat] ?? stat;
}

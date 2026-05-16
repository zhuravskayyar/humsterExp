import { getHamsterEffectiveStats } from "./hamsters.js";
import { canAfford, spendResources } from "./colony.js";

// Рівні манекена. Пропорція: 4 схованки за кожні 1000 HP (як і казав).
export const DUMMY_LEVELS = [
  { level: 1, hpPerRound: 500,   rewardBooks: 2,  upgradeCost: null },
  { level: 2, hpPerRound: 1000,  rewardBooks: 4,  upgradeCost: { gold: 100,  ore: 8 } },
  { level: 3, hpPerRound: 2500,  rewardBooks: 10, upgradeCost: { gold: 250,  ore: 20 } },
  { level: 4, hpPerRound: 6000,  rewardBooks: 24, upgradeCost: { gold: 600,  ore: 50 } },
  { level: 5, hpPerRound: 15000, rewardBooks: 60, upgradeCost: { gold: 1400, ore: 120 } },
];

export function getDummyConfig(state) {
  return DUMMY_LEVELS.find((d) => d.level === (state.training?.dummyLevel ?? 1)) ?? DUMMY_LEVELS[0];
}

export function getNextDummyConfig(state) {
  const curr = getDummyConfig(state);
  return DUMMY_LEVELS.find((d) => d.level === curr.level + 1) ?? null;
}

export function canUpgradeDummy(state) {
  const next = getNextDummyConfig(state);
  if (!next?.upgradeCost) return false;
  return canAfford(state, next.upgradeCost);
}

/**
 * Хом'як б'є манекен один раз.
 * Повертає { damage, booksAwarded, goldAwarded, foodAwarded, oreAwarded } або null.
 * Тренування доступне лише вільним хом'якам.
 */
export function hitDummy(state, hamsterId) {
  if (!hamsterId) return null;
  const hamster = state.hamsters.find((h) => h.id === hamsterId);
  if (!hamster || hamster.status !== "available") return null;

  const dummy = getDummyConfig(state);
  const stats = getHamsterEffectiveStats(hamster, state);
  const damage = Math.max(1, stats.attack);

  if (!state.training) {
    state.training = { dummyLevel: 1, damageProgress: 0, totalRounds: 0 };
  }

  state.training.damageProgress = (state.training.damageProgress ?? 0) + damage;

  let booksAwarded = 0;
  let goldAwarded = 0;
  let foodAwarded = 0;
  let oreAwarded = 0;

  if (state.training.damageProgress >= dummy.hpPerRound) {
    booksAwarded = dummy.rewardBooks;
    state.resources.xpBooks = (state.resources.xpBooks ?? 0) + booksAwarded;
    state.training.damageProgress -= dummy.hpPerRound;
    state.training.totalRounds = (state.training.totalRounds ?? 0) + 1;

    // Насіння гарантовано кожного раунду.
    goldAwarded = Math.floor(Math.random() * 5) + 2;
    state.resources.gold = (state.resources.gold ?? 0) + goldAwarded;
    // 10% шанс на їжу
    if (Math.random() < 0.1) {
      foodAwarded = Math.floor(Math.random() * 3) + 1;
      state.resources.food = (state.resources.food ?? 0) + foodAwarded;
    }
    // 10% шанс на руду
    if (Math.random() < 0.1) {
      oreAwarded = Math.floor(Math.random() * 2) + 1;
      state.resources.ore = (state.resources.ore ?? 0) + oreAwarded;
    }
  }

  return { damage, booksAwarded, goldAwarded, foodAwarded, oreAwarded };
}

/**
 * Покращити манекен до наступного рівня.
 * Повертає true якщо успішно.
 */
export function upgradeDummy(state) {
  const next = getNextDummyConfig(state);
  if (!next?.upgradeCost) return false;
  if (!canAfford(state, next.upgradeCost)) return false;

  spendResources(state, next.upgradeCost);
  if (!state.training) state.training = { dummyLevel: 1, damageProgress: 0, totalRounds: 0 };
  state.training.dummyLevel = next.level;
  state.training.damageProgress = 0;
  return true;
}

// ── Авто-атака ───────────────────────────────────────
let _autoAttackTimer = null;

export function startAutoAttack(callback) {
  stopAutoAttack();
  _autoAttackTimer = setInterval(callback, 1300);
}

export function stopAutoAttack() {
  if (_autoAttackTimer !== null) {
    clearInterval(_autoAttackTimer);
    _autoAttackTimer = null;
  }
}

export function isAutoAttackRunning() {
  return _autoAttackTimer !== null;
}

// ── Офлайн-тренування ────────────────────────────────
/**
 * Обчислює нагороди за тренування, що тривало поки гравець був відсутній.
 * Повертає { rounds, booksAwarded, goldAwarded, elapsed } або null.
 */
export function processOfflineTraining(state) {
  const t = state.training;
  if (!t?.activeHamsterId || !t?.offlineSince || !t?.offlineDps) return null;

  const hamster = state.hamsters?.find((h) => h.id === t.activeHamsterId);
  if (!hamster || hamster.status !== "available") {
    t.offlineSince = null;
    t.offlineDps = null;
    return null;
  }

  const elapsed = Date.now() - t.offlineSince;
  t.offlineSince = null;
  t.offlineDps = null;

  if (elapsed < 2000) return null; // менше 2 с — ігнорувати

  const dummy = getDummyConfig(state);
  const totalDamage = elapsed * (t.offlineDps ?? 0);
  const rawProgress = (t.damageProgress ?? 0) + totalDamage;
  const rounds = Math.floor(rawProgress / dummy.hpPerRound);

  t.damageProgress = rawProgress % dummy.hpPerRound;

  if (rounds <= 0) return null;

  const booksAwarded = rounds * dummy.rewardBooks;
  // Для офлайн-фарму використовуємо середнє значення насіння за раунд.
  const goldAwarded = rounds * 4;

  state.resources.xpBooks = (state.resources.xpBooks ?? 0) + booksAwarded;
  state.resources.gold = (state.resources.gold ?? 0) + goldAwarded;
  t.totalRounds = (t.totalRounds ?? 0) + rounds;

  return { rounds, booksAwarded, goldAwarded, elapsed };
}

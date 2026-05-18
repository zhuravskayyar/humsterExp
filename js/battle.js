import { findBoss } from "./data.js";
import { getHamster, getHamsterEffectiveStats, grantHamsterXp, setHamsterStatus } from "./hamsters.js";
import { addResources } from "./inventory.js";
import { clamp, randomInt } from "./state.js";

const MAX_LOG_LINES = 5;

export function getAvailableBosses() {
  return ["rat_keeper"].map((id) => findBoss(id)).filter(Boolean);
}

export function startBossBattle(state, bossId, hamsterIds) {
  const boss = findBoss(bossId);
  if (!boss) throw new Error("Боса не знайдено");
  if (state.battle?.active?.status === "active") throw new Error("Бій уже триває");

  const teamIds = [...new Set(hamsterIds)].slice(0, boss.maxTeam ?? 3);
  if (!teamIds.length) throw new Error("Обери хоча б одного хом'яка");

  const team = teamIds.map((id) => getHamster(state, id)).filter(Boolean);
  if (team.length !== teamIds.length || team.some((hamster) => hamster.status !== "available")) {
    throw new Error("У бій можна взяти тільки вільних хом'яків");
  }

  const hamsterHp = {};
  for (const hamster of team) {
    const stats = getHamsterEffectiveStats(hamster, state);
    hamsterHp[hamster.id] = Math.max(1, stats.hp);
  }

  setHamsterStatus(state, teamIds, "in_battle");
  state.battle = {
    ...(state.battle ?? {}),
    active: {
      id: crypto.randomUUID(),
      bossId,
      status: "active",
      round: 1,
      hamsterIds: teamIds,
      actedHamsterIds: [],
      currentHamsterId: teamIds[0],
      hamsterHp,
      guard: {},
      bossHp: boss.hp,
      bossMaxHp: boss.hp,
      bossIntent: "attack",
      bossPose: "idle",
      lastHamsterAction: null,
      log: [`${boss.name} виходить на бій.`]
    },
    attempts: (state.battle?.attempts ?? 0) + 1,
    lastResult: null
  };

  return state.battle.active;
}

export function performBattleAction(state, action) {
  const battle = state.battle?.active;
  if (!battle || battle.status !== "active") return null;

  const boss = findBoss(battle.bossId);
  const hamster = getHamster(state, battle.currentHamsterId);
  if (!boss || !hamster || getAliveHamsterIds(battle).length === 0) return null;

  if (action === "guard") {
    battle.guard[hamster.id] = true;
    battle.lastHamsterAction = { hamsterId: hamster.id, type: "guard", at: Date.now() };
    battle.bossPose = "idle";
    addLog(battle, `${hamster.name}: захист.`);
  } else {
    const hit = rollHamsterHit(state, hamster, boss);
    battle.bossHp = Math.max(0, battle.bossHp - hit.damage);
    battle.lastHamsterAction = { hamsterId: hamster.id, type: "attack", at: Date.now() };
    battle.bossPose = "damage";
    addLog(battle, `${hamster.name}: -${hit.damage}${hit.critical ? " крит" : ""}.`);
  }

  if (battle.bossHp <= 0) {
    return finishBattleWin(state, battle, boss);
  }

  battle.actedHamsterIds.push(hamster.id);
  advancePlayerTurnOrBoss(state, battle, boss);
  return battle;
}

export function abandonBossBattle(state) {
  const battle = state.battle?.active;
  if (!battle || battle.status !== "active") return null;

  const ids = battle.hamsterIds ?? [];
  setHamsterStatus(state, ids, "resting");
  battle.status = "lost";
  addLog(battle, "Загін відступив.");
  state.battle.lastResult = {
    status: "lost",
    title: "Відступ",
    rewards: {}
  };
  state.battle.active = null;
  return state.battle.lastResult;
}

function advancePlayerTurnOrBoss(state, battle, boss) {
  const nextHamsterId = getAliveHamsterIds(battle).find((id) => !battle.actedHamsterIds.includes(id));
  if (nextHamsterId) {
    battle.currentHamsterId = nextHamsterId;
    return;
  }

  const bossTurnIntent = battle.bossIntent;
  resolveBossTurn(state, battle, boss);
  if (battle.status !== "active") return;

  const alive = getAliveHamsterIds(battle);
  battle.round += 1;
  battle.actedHamsterIds = [];
  battle.guard = {};
  battle.currentHamsterId = alive[0] ?? null;
  battle.bossIntent = bossTurnIntent === "charge" ? "slam" : chooseBossIntent(battle);
}

function resolveBossTurn(state, battle, boss) {
  const alive = getAliveHamsterIds(battle);
  if (!alive.length) {
    finishBattleLoss(state, battle);
    return;
  }

  if (battle.bossIntent === "charge") {
    battle.bossPose = "idle";
    addLog(battle, `${boss.name} заряджає ривок.`);
    battle.bossIntent = "slam";
    return;
  }

  if (battle.bossIntent === "slam") {
    battle.bossPose = "attack";
    for (const hamsterId of alive) {
      const damage = rollBossDamage(state, battle, boss, hamsterId, 1.45);
      battle.hamsterHp[hamsterId] = Math.max(0, battle.hamsterHp[hamsterId] - damage);
    }
    addLog(battle, `${boss.name}: удар по загону.`);
  } else {
    battle.bossPose = "attack";
    const targetId = pickBossTarget(state, battle, alive);
    const target = getHamster(state, targetId);
    const damage = rollBossDamage(state, battle, boss, targetId, 1);
    battle.hamsterHp[targetId] = Math.max(0, battle.hamsterHp[targetId] - damage);
    addLog(battle, `${boss.name} б'є ${target?.name ?? "ціль"}: -${damage}.`);
  }

  if (!getAliveHamsterIds(battle).length) {
    finishBattleLoss(state, battle);
  }
}

function finishBattleWin(state, battle, boss) {
  addResources(state, boss.reward ?? {});
  grantHamsterXp(state, battle.hamsterIds, boss.xp ?? 0);
  setHamsterStatus(state, battle.hamsterIds, "available");
  battle.status = "won";
  battle.bossPose = "damage";
  addLog(battle, `${boss.name} переможений.`);

  state.stats.bossesDefeated = (state.stats.bossesDefeated ?? 0) + 1;
  state.battle.wins[boss.id] = (state.battle.wins?.[boss.id] ?? 0) + 1;
  state.battle.lastResult = {
    status: "won",
    title: "Боса переможено",
    bossName: boss.name,
    rewards: boss.reward ?? {},
    xp: boss.xp ?? 0
  };
  state.battle.active = null;
  return state.battle.lastResult;
}

function finishBattleLoss(state, battle) {
  setHamsterStatus(state, battle.hamsterIds, "injured");
  battle.status = "lost";
  battle.bossPose = "idle";
  addLog(battle, "Загін вибито з бою.");
  state.battle.lastResult = {
    status: "lost",
    title: "Поразка",
    rewards: {}
  };
  state.battle.active = null;
  return state.battle.lastResult;
}

function rollHamsterHit(state, hamster, boss) {
  const stats = getHamsterEffectiveStats(hamster, state);
  const critChance = clamp(stats.critChance ?? 0, 0, 75);
  const critical = critChance > 0 && randomInt(1, 100) <= critChance;
  const critMultiplier = critical ? 1 + (stats.critDamage ?? 0) / 100 : 1;
  const base = stats.attack + stats.power * 1.15 + stats.luck * 0.16 - boss.defense * 0.7;
  const damage = Math.max(1, Math.round((base + randomInt(-4, 5)) * critMultiplier));
  return { damage, critical };
}

function rollBossDamage(state, battle, boss, hamsterId, multiplier) {
  const hamster = getHamster(state, hamsterId);
  const stats = getHamsterEffectiveStats(hamster, state);
  const guarded = Boolean(battle.guard?.[hamsterId]);
  const defense = stats.defense * 0.55 + stats.stamina * 0.12;
  const guardMultiplier = guarded ? 0.48 : 1;
  return Math.max(1, Math.round((boss.attack * multiplier + randomInt(-3, 4) - defense) * guardMultiplier));
}

function pickBossTarget(state, battle, aliveIds) {
  return aliveIds
    .map((id) => ({ id, hp: battle.hamsterHp[id] ?? 0, stamina: getHamsterEffectiveStats(getHamster(state, id), state).stamina ?? 0 }))
    .sort((left, right) => left.hp + left.stamina * 0.2 - (right.hp + right.stamina * 0.2))[0]?.id ?? aliveIds[0];
}

function chooseBossIntent(battle) {
  if ((battle.round + 1) % 3 === 0) return "charge";
  return "attack";
}

function getAliveHamsterIds(battle) {
  return (battle.hamsterIds ?? []).filter((id) => (battle.hamsterHp?.[id] ?? 0) > 0);
}

function addLog(battle, line) {
  battle.log = [line, ...(battle.log ?? [])].slice(0, MAX_LOG_LINES);
}

import { addResources } from "./inventory.js";

export function syncQuestProgress(state) {
  ensureDailyQuestState(state);

  for (const quest of state.quests) {
    const statValue = state.stats[quest.metric] ?? 0;
    const baseline = quest.type === "daily" ? state.dailyQuestBaselines?.[quest.metric] ?? 0 : 0;
    const effectiveValue = quest.type === "daily" ? Math.max(0, statValue - baseline) : statValue;
    quest.progress = Math.min(quest.target, effectiveValue);
    quest.completed = quest.progress >= quest.target;
  }
}

export function resetDailyQuestsIfNeeded(state, now = Date.now()) {
  ensureDailyQuestState(state, now);
  if (!isNewDay(state.questsLastResetAt, now)) {
    return false;
  }
  resetDailyQuests(state, now);
  return true;
}

export function resetDailyQuests(state, now = Date.now()) {
  ensureDailyQuestState(state, now);

  for (const quest of state.quests) {
    if (quest.type !== "daily") continue;
    quest.progress = 0;
    quest.completed = false;
    quest.claimed = false;
    state.dailyQuestBaselines[quest.metric] = state.stats[quest.metric] ?? 0;
  }

  state.questsLastResetAt = now;
}

export function isNewDay(previousTimestamp, now = Date.now()) {
  if (typeof previousTimestamp !== "number") return true;
  const previous = new Date(previousTimestamp);
  const current = new Date(now);
  return previous.getFullYear() !== current.getFullYear()
    || previous.getMonth() !== current.getMonth()
    || previous.getDate() !== current.getDate();
}

export function claimQuest(state, questId) {
  const quest = state.quests.find((candidate) => candidate.id === questId);
  if (!quest || !quest.completed || quest.claimed) {
    return false;
  }
  addResources(state, quest.reward);
  quest.claimed = true;
  return true;
}

function ensureDailyQuestState(state, now = Date.now()) {
  if (!state.dailyQuestBaselines || typeof state.dailyQuestBaselines !== "object") {
    state.dailyQuestBaselines = {};
  }

  for (const quest of state.quests ?? []) {
    if (quest.type !== "daily") continue;
    if (state.dailyQuestBaselines[quest.metric] === undefined) {
      state.dailyQuestBaselines[quest.metric] = state.stats?.[quest.metric] ?? 0;
    }
  }

  if (typeof state.questsLastResetAt !== "number") {
    state.questsLastResetAt = now;
  }
}

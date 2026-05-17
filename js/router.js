import { runtimeState } from "./state.js";

export const routes = ["base", "hamsters", "expeditions", "backpack", "colony", "gacha", "inventory", "quests", "training"];

export function navigate(route) {
  if (!routes.includes(route)) return;
  runtimeState.route = route;
}

export function getRoute() {
  return runtimeState.route;
}

import { createDefaultState, mergeWithDefaults, setGameState } from "./state.js";

export const SAVE_KEY = "hamsterExpeditionsSave_v1";

export function saveGame(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGame(data) {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    const fresh = createDefaultState(data);
    setGameState(fresh);
    saveGame(fresh);
    return fresh;
  }

  try {
    const parsed = JSON.parse(raw);
    const merged = mergeWithDefaults(parsed, data);
    setGameState(merged);
    return merged;
  } catch (error) {
    console.warn("Save was invalid, starting fresh.", error);
    const fresh = createDefaultState(data);
    setGameState(fresh);
    saveGame(fresh);
    return fresh;
  }
}

export function resetGame(data) {
  localStorage.removeItem(SAVE_KEY);
  const fresh = createDefaultState(data);
  setGameState(fresh);
  saveGame(fresh);
  return fresh;
}

export function exportSave(state) {
  const json = JSON.stringify(state, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function importSave(encoded, data) {
  const binary = atob(encoded.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const decoded = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(decoded);
  const merged = mergeWithDefaults(parsed, data);
  setGameState(merged);
  saveGame(merged);
  return merged;
}

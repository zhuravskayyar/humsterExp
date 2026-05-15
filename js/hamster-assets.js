import { SPRITE_CONFIG } from "./sprite.js";

export function getHamsterSlug(hamster) {
  if (!hamster) return null;
  return hamster.slug ?? extractSlugFromPath(hamster.portrait) ?? extractSlugFromPath(hamster.image);
}

export function getHamsterPortrait(hamster) {
  if (!hamster) return null;
  return hamster.portrait ?? hamster.image ?? buildPortraitPath(getHamsterSlug(hamster));
}

export function getHamsterGachaImage(hamster) {
  if (!hamster) return null;
  return hamster.gachaImage ?? hamster.portrait ?? hamster.image ?? buildPortraitPath(getHamsterSlug(hamster));
}

export function getHamsterSpriteConfig(hamster) {
  const slug = getHamsterSlug(hamster);
  return slug ? SPRITE_CONFIG[slug] ?? null : null;
}

function buildPortraitPath(slug) {
  return slug ? `assets/images/hamsters/${slug}/portret/${slug}.png` : null;
}

function extractSlugFromPath(path) {
  if (typeof path !== "string" || !path) return null;
  const normalized = path.replace(/\\/g, "/");
  const nestedMatch = normalized.match(/\/hamsters\/([^/]+)\//);
  if (nestedMatch) return nestedMatch[1];
  return normalized.split("/").pop()?.replace(/\.[^.]+$/, "") ?? null;
}
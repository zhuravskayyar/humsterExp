import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SPRITE_CONFIG } from "../js/sprite.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const hamsters = JSON.parse(fs.readFileSync(path.join(rootDir, "data", "hamsters.json"), "utf8"));

const errors = [];
const warnings = [];

for (const hamster of hamsters) {
  if (hamster.portrait) validateFile(`portrait:${hamster.id}`, hamster.portrait);
  if (hamster.gachaImage) validateFile(`gachaImage:${hamster.id}`, hamster.gachaImage);
}

for (const [slug, states] of Object.entries(SPRITE_CONFIG)) {
  for (const [mode, config] of Object.entries(states)) {
    const filePath = validateFile(`sprite:${slug}.${mode}`, config.src);
    if (!filePath) continue;

    const size = readPngSize(filePath);
    if (!size) continue;

    if (size.width !== config.totalW || size.height !== config.h) {
      errors.push(
        `Sprite size mismatch for ${slug}.${mode}: config ${config.totalW}x${config.h}, actual ${size.width}x${size.height}`
      );
    }

    const cols = config.cols ?? config.frames;
    const rows = config.rows ?? 1;
    if (config.totalW % cols !== 0) {
      warnings.push(`Non-even frame width for ${slug}.${mode}: totalW ${config.totalW}, cols ${cols}`);
    }
    if (config.h % rows !== 0) {
      warnings.push(`Non-even frame height for ${slug}.${mode}: h ${config.h}, rows ${rows}`);
    }
    if (config.frames > cols * rows) {
      errors.push(`Frame count overflow for ${slug}.${mode}: frames ${config.frames}, cells ${cols * rows}`);
    }
  }
}

if (warnings.length) {
  console.warn("Asset validation warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Asset validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Asset validation passed: ${hamsters.length} hamsters, ${Object.keys(SPRITE_CONFIG).length} sprite configs.`);

function validateFile(label, relativePath) {
  const cleanPath = relativePath.split(/[?#]/, 1)[0];
  const filePath = path.join(rootDir, cleanPath);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing ${label}: ${relativePath}`);
    return null;
  }
  return filePath;
}

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  const isPng = buffer.length >= 24
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47;

  if (!isPng) {
    errors.push(`Not a PNG file: ${path.relative(rootDir, filePath)}`);
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

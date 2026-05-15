/**
 * sprite.js — Canvas-based sprite sheet animator for training screen.
 * Lives across DOM rebuilds by cancelling & restarting the RAF loop on each re-attach.
 * Images are cached in memory after the first load.
 */

// ── Sprite configurations ──────────────────────────────────────────────────
export const SPRITE_CONFIG = {
  pixel: {
    idle: {
      src: "assets/images/hamsters/pixel/idle/pixel_idle_normalized.png",
      frames: 4,
      totalW: 1536,
      h: 256,
      anchorX: 192,
      fps: 7,          // full loop ≈ 571 ms
    },
    attack: {
      src: "assets/images/hamsters/pixel/attack/pixel_attack_normalized.png",
      frames: 6,
      totalW: 2304,
      h: 256,
      anchorX: 192,
      fps: 10,         // full attack ≈ 500 ms
    },
  },
  shurup: {
    idle: {
      src: "assets/images/hamsters/shurup/idle/shurup_idle_normalized.png",
      frames: 4,
      totalW: 1536,
      h: 256,
      anchorX: 192,
      fps: 7,
    },
    attack: {
      src: "assets/images/hamsters/shurup/attack/shurup_attack_normalized.png",
      frames: 6,
      totalW: 2304,
      h: 256,
      anchorX: 192,
      fps: 12,         // full attack ≈ 500 ms, same feel as pixel
    },
  },
  pliushka: {
    idle: {
      src: "assets/images/hamsters/pliushka/idle/pliushka_idle_normalized.png",
      frames: 4,
      totalW: 1536,
      h: 256,
      anchorX: 192,
      fps: 7,
    },
    attack: {
      src: "assets/images/hamsters/pliushka/attack/pliushka_attack_normalized.png",
      frames: 4,
      totalW: 1536,
      h: 256,
      anchorX: 192,
      fps: 8,          // full attack ≈ 500 ms
    },
  },
  bublyk: {
    idle: {
      src: "assets/images/hamsters/bublyk/idle/bublyk_idle_normalized.png",
      frames: 4,
      totalW: 1536,
      h: 256,
      anchorX: 192,
      fps: 7,
    },
    attack: {
      src: "assets/images/hamsters/bublyk/attack/bublyk_attack_normalized.png",
      frames: 6,
      totalW: 2304,
      h: 256,
      anchorX: 192,
      fps: 12,         // full attack ≈ 500 ms
    },
  },
  hryzun: {
    idle: {
      src: "assets/images/hamsters/hryzun/idle/hryzun_idle_normalized.png",
      frames: 4,
      totalW: 1536,
      h: 256,
      anchorX: 192,
      fps: 7,
    },
    attack: {
      src: "assets/images/hamsters/hryzun/attack/hryzun_attack_normalized.png",
      frames: 6,
      totalW: 2304,
      h: 256,
      anchorX: 192,
      fps: 12,         // full attack ≈ 500 ms
    },
  },
};

export const CANVAS_DISPLAY_H = 78; // px – display height of the canvas

// ── Image cache ────────────────────────────────────────────────────────────
const _imgCache = new Map();

function _loadImg(src) {
  if (_imgCache.has(src)) return Promise.resolve(_imgCache.get(src));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { _imgCache.set(src, img); resolve(img); };
    img.onerror = () => reject(new Error("sprite: failed to load " + src));
    img.src = src;
  });
}

// ── Persistent animation state (survives DOM rebuilds) ─────────────────────
let _attachVer = 0;          // incremented on each attachTrainingCanvas call
let _raf       = null;       // current requestAnimationFrame handle
let _ctx       = null;       // current canvas 2d context
let _dW        = 0;          // current canvas display width (px)
let _dH        = CANVAS_DISPLAY_H;
let _anchorX   = 0;          // shared destination pivot (px)
let _idleImg   = null;
let _attackImg = null;
let _cfg       = null;       // current SPRITE_CONFIG[slug] entry

function _getFrameMetrics(cfg, displayH = CANVAS_DISPLAY_H) {
  const cols        = cfg.cols ?? cfg.frames;
  const rows        = cfg.rows ?? 1;
  const fw          = cfg.totalW / cols;
  const fh          = cfg.h / rows;
  const scale       = displayH / fh;
  const drawW       = fw * scale;
  const anchorSrcX  = cfg.anchorX ?? (fw / 2);
  const anchorDrawX = anchorSrcX * scale;
  return { fw, fh, cols, rows, scale, drawW, anchorDrawX };
}

// Persisted across attaches for the same slug:
let _anim = { mode: "idle", frame: 0, lastTs: 0, slug: null };

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Attach (or re-attach) the animator to a new canvas element.
 * Call this every time renderApp produces a fresh canvas element.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} slug        – hamster slug, must match a key in SPRITE_CONFIG
 * @param {boolean} startAttacking – if true, begin with the attack animation
 */
export async function attachTrainingCanvas(canvas, slug, startAttacking = false) {
  const myVer = ++_attachVer;

  // Stop any running loop immediately
  if (_raf !== null) { cancelAnimationFrame(_raf); _raf = null; }

  const config = SPRITE_CONFIG[slug];
  if (!config) return;

  // Load both atlases (resolves instantly from cache on subsequent calls)
  let idleImg, attackImg;
  try {
    [idleImg, attackImg] = await Promise.all([
      _loadImg(config.idle.src),
      _loadImg(config.attack.src),
    ]);
  } catch (e) {
    console.warn(e.message);
    return;
  }

  // Bail if a newer attach call already took over, or canvas left the DOM
  if (myVer !== _attachVer || !canvas.isConnected) return;

  // ── Canvas sizing ──────────────────────────────────────────────────────
  // Base canvas on a shared pivot so idle/attack stay locked in place.
  const idleMetrics   = _getFrameMetrics(config.idle);
  const attackMetrics = _getFrameMetrics(config.attack);
  const maxLeft       = Math.max(idleMetrics.anchorDrawX, attackMetrics.anchorDrawX);
  const maxRight      = Math.max(
    idleMetrics.drawW - idleMetrics.anchorDrawX,
    attackMetrics.drawW - attackMetrics.anchorDrawX,
  );

  _dH = CANVAS_DISPLAY_H;
  _anchorX = Math.ceil(maxLeft);
  _dW = Math.ceil(maxLeft + maxRight);

  const dpr = window.devicePixelRatio || 1;
  canvas.style.width  = _dW + "px";
  canvas.style.height = _dH + "px";
  canvas.width  = Math.round(_dW * dpr);
  canvas.height = Math.round(_dH * dpr);

  _ctx = canvas.getContext("2d");
  _ctx.scale(dpr, dpr);
  _ctx.imageSmoothingEnabled = false;

  _idleImg   = idleImg;
  _attackImg = attackImg;
  _cfg       = config;

  // ── Restore or reset animation state ──────────────────────────────────
  if (_anim.slug !== slug) {
    // Different hamster – full reset
    _anim = { mode: "idle", frame: 0, lastTs: 0, slug };
  } else {
    // Same hamster – keep frame position but reset timing so we don't skip
    _anim.lastTs = 0;
  }

  if (startAttacking) {
    _anim.mode  = "attack";
    _anim.frame = 0;
    _anim.lastTs = 0;
  }

  // Draw first frame immediately (no blank flash)
  _draw();

  _raf = requestAnimationFrame(_tick);
}

/** Stop animation and release canvas reference (call when leaving training). */
export function detachTrainingCanvas() {
  if (_raf !== null) { cancelAnimationFrame(_raf); _raf = null; }
  _ctx = null;
}

// ── Animation loop ──────────────────────────────────────────────────────────

function _tick(ts) {
  if (!_ctx || !_cfg) return;

  const modeCfg  = _anim.mode === "idle" ? _cfg.idle : _cfg.attack;
  const frameDur = 1000 / modeCfg.fps;

  // First tick or after long pause – anchor timing
  if (_anim.lastTs === 0 || ts - _anim.lastTs > frameDur * modeCfg.frames * 3) {
    _anim.lastTs = ts;
  }

  if (ts - _anim.lastTs >= frameDur) {
    const steps    = Math.floor((ts - _anim.lastTs) / frameDur);
    _anim.frame   += steps;
    _anim.lastTs  += steps * frameDur;

    if (_anim.mode === "attack" && _anim.frame >= _cfg.attack.frames) {
      // Attack finished → return to idle
      _anim.mode  = "idle";
      _anim.frame = 0;
      _anim.lastTs = ts;
    } else if (_anim.mode === "idle") {
      _anim.frame = _anim.frame % _cfg.idle.frames;
    }

    _draw();
  }

  _raf = requestAnimationFrame(_tick);
}

function _draw() {
  if (!_ctx || !_cfg) return;
  _ctx.clearRect(0, 0, _dW, _dH);

  const isIdle = _anim.mode === "idle";
  const cfg    = isIdle ? _cfg.idle   : _cfg.attack;
  const img    = isIdle ? _idleImg    : _attackImg;

  const { fw, fh, cols, drawW, anchorDrawX } = _getFrameMetrics(cfg, _dH);
  const dx = Math.round(_anchorX - anchorDrawX);

  const frameIndex = _anim.frame % cfg.frames;
  const sx = (frameIndex % cols) * fw;
  const sy = Math.floor(frameIndex / cols) * fh;

  _ctx.drawImage(img, sx, sy, fw, fh, dx, 0, drawW, _dH);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Dummy (mannequin) canvas animator ────────────────────────────────────────
// Single spritesheet: 4 frames in a row (idle, windup, impact, recovery).
// idle  → show frame 0 (static)
// hit   → play frames 0→1→2→3 once at 10 fps, then return to idle
// ══════════════════════════════════════════════════════════════════════════════

export const DUMMY_SPRITE_CONFIG = {
  src:    "assets/images/maneken/maneken.png",
  totalW: 2509,
  h:      732,
  frames: 4,
  fps:    10,   // hit animation: 4 frames × 100 ms ≈ 400 ms
};

export const CANVAS_DUMMY_H = 90; // px – display height

// ── Private dummy state ───────────────────────────────────────────────────────
let _dummyVer  = 0;
let _dummyRaf  = null;
let _dummyCtx  = null;
let _dummyDW   = 0;
let _dummyImg  = null;
let _dummyAnim = { mode: "idle", frame: 0, lastTs: 0 };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attach (or re-attach) the mannequin canvas animator.
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} triggerHit – start/continue the hit animation
 */
export async function attachDummyCanvas(canvas, triggerHit = false) {
  const myVer = ++_dummyVer;
  if (_dummyRaf !== null) { cancelAnimationFrame(_dummyRaf); _dummyRaf = null; }

  let img;
  try {
    img = await _loadImg(DUMMY_SPRITE_CONFIG.src);
  } catch (e) {
    console.warn(e.message);
    return;
  }

  if (myVer !== _dummyVer || !canvas.isConnected) return;

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  const fw    = DUMMY_SPRITE_CONFIG.totalW / DUMMY_SPRITE_CONFIG.frames; // 627.25
  const scale = CANVAS_DUMMY_H / DUMMY_SPRITE_CONFIG.h;
  const drawW = Math.ceil(fw * scale);

  _dummyDW  = drawW;
  _dummyImg = img;

  const dpr = window.devicePixelRatio || 1;
  canvas.style.width  = drawW + "px";
  canvas.style.height = CANVAS_DUMMY_H + "px";
  canvas.width  = Math.round(drawW * dpr);
  canvas.height = Math.round(CANVAS_DUMMY_H * dpr);

  _dummyCtx = canvas.getContext("2d");
  _dummyCtx.scale(dpr, dpr);
  _dummyCtx.imageSmoothingEnabled = false;

  // ── Trigger hit if requested and not already playing ──────────────────────
  if (triggerHit && _dummyAnim.mode !== "hit") {
    _dummyAnim = { mode: "hit", frame: 0, lastTs: 0 };
  }

  _dummyDraw();

  if (_dummyAnim.mode === "hit") {
    _dummyRaf = requestAnimationFrame(_dummyTick);
  }
}

/** Stop and release the mannequin canvas. */
export function detachDummyCanvas() {
  if (_dummyRaf !== null) { cancelAnimationFrame(_dummyRaf); _dummyRaf = null; }
  _dummyCtx = null;
}

// ── Dummy animation loop ──────────────────────────────────────────────────────

function _dummyTick(ts) {
  if (!_dummyCtx || !_dummyImg) return;

  const frameDur = 1000 / DUMMY_SPRITE_CONFIG.fps;
  if (_dummyAnim.lastTs === 0) _dummyAnim.lastTs = ts;

  if (ts - _dummyAnim.lastTs >= frameDur) {
    const steps = Math.floor((ts - _dummyAnim.lastTs) / frameDur);
    _dummyAnim.frame  += steps;
    _dummyAnim.lastTs += steps * frameDur;

    if (_dummyAnim.frame >= DUMMY_SPRITE_CONFIG.frames) {
      // Hit animation finished → back to idle, stop RAF
      _dummyAnim = { mode: "idle", frame: 0, lastTs: 0 };
      _dummyDraw();
      _dummyRaf = null;
      return;
    }

    _dummyDraw();
  }

  _dummyRaf = requestAnimationFrame(_dummyTick);
}

function _dummyDraw() {
  if (!_dummyCtx || !_dummyImg) return;

  const fw    = DUMMY_SPRITE_CONFIG.totalW / DUMMY_SPRITE_CONFIG.frames;
  const fh    = DUMMY_SPRITE_CONFIG.h;
  const scale = CANVAS_DUMMY_H / fh;
  const drawW = fw * scale;

  const frame = _dummyAnim.mode === "idle" ? 0 : Math.min(_dummyAnim.frame, DUMMY_SPRITE_CONFIG.frames - 1);

  _dummyCtx.clearRect(0, 0, _dummyDW, CANVAS_DUMMY_H);
  _dummyCtx.drawImage(
    _dummyImg,
    frame * fw, 0,           // source x, y
    fw,         fh,           // source w, h
    0,          0,            // dest x, y
    drawW,      CANVAS_DUMMY_H, // dest w, h
  );
}

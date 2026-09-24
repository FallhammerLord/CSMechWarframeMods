/**
 * Card frames ("mod textures"): top and bottom cap images on the small and large cards,
 * chosen by skill training level, set by the GM for the whole world.
 *
 * Caps are drawn with CSS border-image 3-slice: each cap image's two ends are drawn at a
 * fixed aspect ratio, and its middle stretches to the card width. So one image fits both the
 * ~150px small card and the 360px large card without distorting the corners.
 *
 * The rules are generated into one <style> element from the world setting, so changing frames
 * restyles every open sheet without re-rendering anything.
 */

import {MODULE_ID, MODULE_PATH} from "../constants.js";

export const FRAME_SETTING = "cardFrames";

/** Frame keys, in rarity order. "none" covers items with no training (equipment, cyphers…). */
export const FRAME_KEYS = ["none", "inability", "practiced", "trained", "specialized"];

export const FRAME_EFFECTS = ["none", "glow", "shimmer"];

const DEFAULT_EFFECTS = {none: "none", inability: "none", practiced: "none", trained: "glow", specialized: "shimmer"};

/** Recommended cap canvas: 512 x 64, with 96px ends. */
export const RECOMMENDED = {width: 512, height: 64, slice: 96};

export function defaultFrames() {
  return {
    enabled: true,
    sets: Object.fromEntries(FRAME_KEYS.map(key => [key, {
      top: `${MODULE_PATH}/assets/frames/${key}-top.svg`,
      bottom: `${MODULE_PATH}/assets/frames/${key}-bottom.svg`,
      slice: RECOMMENDED.slice,
      height: RECOMMENDED.height,
      effect: DEFAULT_EFFECTS[key]
    }]))
  };
}

/** Coerce any stored or submitted value into a complete, valid frame config. */
export function normalizeFrames(value) {
  const defaults = defaultFrames();
  const input = value && typeof value === "object" ? value : {};
  const number = (v, fallback, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const sets = {};
  for (const key of FRAME_KEYS) {
    const d = defaults.sets[key];
    const s = input.sets?.[key] ?? {};
    sets[key] = {
      top: typeof s.top === "string" ? s.top.trim() : d.top,
      bottom: typeof s.bottom === "string" ? s.bottom.trim() : d.bottom,
      slice: number(s.slice, d.slice, 0, 4096),
      height: number(s.height, d.height, 1, 4096),
      effect: FRAME_EFFECTS.includes(s.effect) ? s.effect : d.effect
    };
  }
  return {enabled: input.enabled === undefined ? defaults.enabled : !!input.enabled, sets};
}

export function getFrames() {
  try {
    return normalizeFrames(game.settings.get(MODULE_ID, FRAME_SETTING));
  } catch {
    return defaultFrames();
  }
}

const cssUrl = path => `url("${String(path).replace(/["\\\n\r]/g, c => `\\${c}`)}")`;

/**
 * Build the frame CSS.
 * @param {object} frames   normalized frame config
 * @param {string} [scope]  selector prefix (the config window's preview uses one to override the live rules)
 */
export function buildFrameCss(frames, scope = "") {
  const rules = [];
  const prefix = scope ? `${scope} ` : "";
  if (!frames.enabled) {
    if (scope) rules.push(`${prefix}.ccs-cap { display: none; }`, `${prefix}.ccs-card::after { content: none; }`);
    return rules.join("\n");
  }
  for (const key of FRAME_KEYS) {
    const set = frames.sets[key];
    const ratio = set.height ? set.slice / set.height : 1.5;
    for (const part of ["top", "bottom"]) {
      const selector = `${prefix}.ccs-cap.ccs-cap-${part}.frame-${key}`;
      if (!set[part]) {
        if (scope) rules.push(`${selector} { display: none; }`);
        continue;
      }
      rules.push(`${selector} {
  display: block;
  --cap-ratio: ${ratio};
  border-image-source: ${cssUrl(set[part])};
  border-image-slice: 0 ${set.slice} fill;
}`);
    }
    const card = `${prefix}.ccs-card.frame-${key}`;
    if (set.effect === "glow") {
      rules.push(`${card} { box-shadow: 0 0 10px color-mix(in srgb, var(--frame) 60%, transparent), 0 2px 6px var(--ccs-shadow); }`);
    } else if (set.effect === "shimmer") {
      rules.push(`${card}::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(115deg, transparent 38%, rgba(255, 255, 255, 0.18) 50%, transparent 62%) 0 0 / 260% 100% no-repeat;
  animation: ccs-shimmer 5.5s linear infinite;
}`);
    } else if (scope) {
      rules.push(`${card} { box-shadow: 0 2px 6px var(--ccs-shadow); }`, `${card}::after { content: none; }`);
    }
  }
  return rules.join("\n");
}

const STYLE_ID = "ccs-card-frames";

/** Write the live frame rules into the page. Called at ready and whenever the setting changes. */
export function applyFrameStyles() {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = buildFrameCss(getFrames());
}

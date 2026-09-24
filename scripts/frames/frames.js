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

/**
 * Two suites of frame sets. "standard" is the Warframe-style bronze/silver/gold ladder;
 * "contrast" is a colour-blind-friendly red/orange/green/sky-blue ladder, chosen per actor
 * (the "ccs-hc" class on the sheet and its popover).
 */
export const FRAME_SUITES = ["standard", "contrast"];
const SUITE_FILE_PREFIX = {standard: "", contrast: "hc-"};
const SUITE_SCOPE = {standard: "", contrast: ".ccs-hc"};

const DEFAULT_EFFECTS = {none: "none", inability: "none", practiced: "none", trained: "glow", specialized: "shimmer"};

/** Recommended cap canvas: 512 x 64, with 96px ends. */
export const RECOMMENDED = {width: 512, height: 64, slice: 96};

function defaultSets(suite) {
  return Object.fromEntries(FRAME_KEYS.map(key => [key, {
    top: `${MODULE_PATH}/assets/frames/${SUITE_FILE_PREFIX[suite]}${key}-top.svg`,
    bottom: `${MODULE_PATH}/assets/frames/${SUITE_FILE_PREFIX[suite]}${key}-bottom.svg`,
    slice: RECOMMENDED.slice,
    height: RECOMMENDED.height,
    effect: DEFAULT_EFFECTS[key]
  }]));
}

export function defaultFrames() {
  return {enabled: true, suites: Object.fromEntries(FRAME_SUITES.map(suite => [suite, {sets: defaultSets(suite)}]))};
}

/** Coerce any stored or submitted value into a complete, valid frame config. */
export function normalizeFrames(value) {
  const defaults = defaultFrames();
  const input = value && typeof value === "object" ? value : {};
  // 0.3.0-alpha.1 stored a single `sets`; treat it as the standard suite.
  const inputSuites = input.suites ?? (input.sets ? {standard: {sets: input.sets}} : {});
  const number = (v, fallback, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const suites = {};
  for (const suite of FRAME_SUITES) {
    const sets = {};
    for (const key of FRAME_KEYS) {
      const d = defaults.suites[suite].sets[key];
      const s = inputSuites[suite]?.sets?.[key] ?? {};
      sets[key] = {
        top: typeof s.top === "string" ? s.top.trim() : d.top,
        bottom: typeof s.bottom === "string" ? s.bottom.trim() : d.bottom,
        slice: number(s.slice, d.slice, 0, 4096),
        height: number(s.height, d.height, 1, 4096),
        effect: FRAME_EFFECTS.includes(s.effect) ? s.effect : d.effect
      };
    }
    suites[suite] = {sets};
  }
  return {enabled: input.enabled === undefined ? defaults.enabled : !!input.enabled, suites};
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
 * Rules for one suite. `prefix` scopes them (".ccs-hc " for the contrast suite, plus the
 * preview scope in the settings window). `explicit` also writes rules that switch things
 * off, so a scoped suite fully overrides whatever the unscoped suite set.
 */
function suiteCss(sets, prefix, explicit) {
  const rules = [];
  for (const key of FRAME_KEYS) {
    const set = sets[key];
    const ratio = set.height ? set.slice / set.height : 1.5;
    for (const part of ["top", "bottom"]) {
      const selector = `${prefix}.ccs-cap.ccs-cap-${part}.frame-${key}`;
      if (!set[part]) {
        if (explicit) rules.push(`${selector} { display: none; }`);
        continue;
      }
      rules.push(`${selector} {
  display: block;
  --cap-ratio: ${ratio};
  border-image-source: ${cssUrl(set[part])};
  border-image-slice: 0 ${set.slice} fill;
}`);
    }
    // Effects apply to the small card and the large card (popover) alike.
    const targets = [`${prefix}.ccs-card.frame-${key}`, `${prefix}.ccs-popover.frame-${key}`];
    const after = targets.map(t => `${t}::after`).join(", ");
    const box = targets.join(", ");
    if (set.effect === "glow") {
      rules.push(`${box} { box-shadow: 0 0 10px color-mix(in srgb, var(--frame, var(--ccs-accent)) 60%, transparent), 0 2px 6px var(--ccs-shadow); }`);
      if (explicit) rules.push(`${after} { content: none; }`);
    } else if (set.effect === "shimmer") {
      rules.push(`${after} {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(115deg, transparent 38%, rgba(255, 255, 255, 0.18) 50%, transparent 62%) 0 0 / 260% 100% no-repeat;
  animation: ccs-shimmer 5.5s linear infinite;
}`);
      if (explicit) rules.push(`${prefix}.ccs-card.frame-${key} { box-shadow: 0 2px 6px var(--ccs-shadow); }`);
    } else if (explicit) {
      rules.push(`${prefix}.ccs-card.frame-${key} { box-shadow: 0 2px 6px var(--ccs-shadow); }`, `${after} { content: none; }`);
    }
  }
  return rules;
}

/**
 * Build the frame CSS.
 * @param {object} frames   normalized frame config
 * @param {string} [scope]  selector prefix (the settings window's preview uses one to override the live rules)
 */
export function buildFrameCss(frames, scope = "") {
  const base = scope ? `${scope} ` : "";
  if (!frames.enabled) {
    return scope ? `${base}.ccs-cap { display: none; }\n${base}.ccs-card::after { content: none; }` : "";
  }
  const rules = [];
  for (const suite of FRAME_SUITES) {
    const suiteScope = SUITE_SCOPE[suite];
    // In the preview each suite has its own container; live, the contrast suite needs a .ccs-hc ancestor.
    const prefix = scope
      ? `${scope}${suiteScope ? suiteScope : ":not(.ccs-hc)"} `
      : (suiteScope ? `${suiteScope} ` : "");
    rules.push(...suiteCss(frames.suites[suite].sets, prefix, !!(scope || suiteScope)));
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

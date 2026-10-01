/**
 * Dark theme for the Cypher System's own windows (AppV1): actor and item sheets, the All-in-One
 * roll dialog and the system's small forms. The system paints them with !important light
 * backgrounds, which Foundry's dark mode doesn't reach. Baseline: cyphersystem v3.5.2.
 */

import {MODULE_ID} from "../constants.js";

export const DARK_SETTING = "systemDark";

/** Whether Foundry's application theme is dark: its setting, else the page, else the browser. */
export function foundryIsDark(doc = document) {
  let scheme;
  try {
    const colors = game.settings.get("core", "uiConfig")?.colorScheme;
    scheme = colors?.applications || colors?.interface;
  } catch {
    scheme = undefined;
  }
  if (scheme) return scheme === "dark";
  if (doc.body?.classList.contains("theme-dark")) return true;
  if (doc.body?.classList.contains("theme-light")) return false;
  return !!doc.defaultView?.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

/** Whether this player wants system windows dark ("foundry", "always" or "off"). */
export function systemDarkWanted(doc = document) {
  let mode = "foundry";
  try {
    mode = game.settings.get(MODULE_ID, DARK_SETTING);
  } catch {
    mode = "foundry";
  }
  return mode === "always" || (mode === "foundry" && foundryIsDark(doc));
}

/**
 * Put a system window into the dark theme, or take it out. `classes` mark its kind for the
 * stylesheet. Backgrounds are set inline with priority, since the system's are !important.
 */
export function applySystemDark(root, dark, ...classes) {
  root.classList.add("ccs-sys", ...classes);
  root.classList.toggle("ccs-sys-dark", dark);
  if (dark) {
    root.classList.remove("theme-light");
    root.classList.add("themed", "theme-dark");
  }
  const surfaces = [root, root.querySelector(".window-content"), root.querySelector(".window-content > form"),
    root.querySelector(".sheet-body")].filter(Boolean);
  for (const el of surfaces) {
    if (dark) {
      el.style.setProperty("background", "#0f131a", "important");
      el.style.setProperty("background-image", "none", "important");
    } else {
      el.style.removeProperty("background");
      el.style.removeProperty("background-image");
    }
  }
}

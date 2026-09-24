/** Helpers shared by the adapter files. */

import {SYSTEM_ID, t} from "../constants.js";

export const L = key => game.i18n.localize(`CYPHERSYSTEM.${key}`);
export const get = foundry.utils.getProperty;
export const capitalize = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export const STAT_POOLS = ["might", "speed", "intellect"];

// Alt state for the click being handled. The click's own `altKey` wins, because Foundry's
// keyboard tracker can miss Alt when the OS or browser takes the key first.
let lastClick = {alt: false, at: 0};

export function noteClick(event) {
  if (event && "altKey" in event) lastClick = {alt: !!event.altKey, at: Date.now()};
}

export const alt = () => (Date.now() - lastClick.at < 1500 ? lastClick.alt : false) || game.keyboard.isModifierActive("Alt");

/** A Cypher System world setting, or undefined if it was renamed. */
export function systemSetting(key) {
  try {
    return game.settings.get(SYSTEM_ID, key);
  } catch {
    return undefined;
  }
}

/** Call a `game.cyphersystem` function, with an error notice if the system API moved. */
export function callApi(name, ...args) {
  const f = game.cyphersystem?.[name];
  if (typeof f !== "function") {
    ui.notifications.error(t("Error.MissingApi", {name}));
    return undefined;
  }
  return f(...args);
}

export function isTeen(actor) {
  return actor.system.basic.unmaskedForm === "Teen";
}

export function poolBase(actor) {
  return isTeen(actor) ? "system.teen.pools" : "system.pools";
}

export function count(value, fallback, min, max) {
  const n = Number(value);
  return Math.clamp(Number.isFinite(n) ? n : fallback, min, max);
}

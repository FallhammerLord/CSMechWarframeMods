/**
 * Direct imports of Cypher System functions that are not exposed on `game.cyphersystem`.
 *
 * This is the highest-risk coupling in the module: these paths are internal to the system
 * and may move between releases. Every import is lazy, cached, and fails soft with a console
 * warning so a moved file disables one feature instead of the whole sheet.
 *
 * Baseline: cyphersystem v3.5.2.
 */

// Resolved relative to this file: modules/<id>/scripts/adapter/ -> web root.
const SYSTEM_ROOT = new URL("../../../../systems/cyphersystem/module/", import.meta.url);

const PATHS = {
  tagging: "utilities/tagging-engine/tagging-engine-computation.js",
  actorUtils: "utilities/actor-utilities.js",
  rollDialog: "forms/roll-engine-dialog-sheet.js"
};

const cache = new Map();

async function load(key) {
  if (cache.has(key)) return cache.get(key);
  let mod = null;
  try {
    mod = await import(new URL(PATHS[key], SYSTEM_ROOT).href);
  } catch (err) {
    console.warn(`cypher-card-sheet | Could not import cyphersystem/${PATHS[key]}`, err);
  }
  cache.set(key, mod);
  return mod;
}

async function fn(key, name) {
  const mod = await load(key);
  const f = mod?.[name];
  if (typeof f !== "function") {
    ui.notifications.error(`Cypher Card Sheet: system function "${name}" not found. The Cypher System may have been updated.`);
    return null;
  }
  return f;
}

/** Warm the cache at ready so the first click doesn't wait on a network fetch. */
export async function preloadSystemImports() {
  await Promise.all(Object.keys(PATHS).map(load));
}

export async function changeTagStats(actor, statChanges) {
  return (await fn("tagging", "changeTagStats"))?.(actor, statChanges);
}

export async function removeTagFromItem(actor, tagId) {
  return (await fn("tagging", "removeTagFromItem"))?.(actor, tagId);
}

export async function useRecoveries(actor, spell) {
  const f = await fn("actorUtils", "useRecoveries");
  return f ? f(actor, spell) : undefined;
}

export async function disableMultiRoll(actor) {
  return (await fn("rollDialog", "disableMultiRoll"))?.(actor);
}

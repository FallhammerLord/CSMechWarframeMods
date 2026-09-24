/**
 * Cypher sockets on artifacts (spec §16). Each cypher records its artifact and slot; the
 * artifact holds only its settings. So a deleted or transferred cypher simply leaves its socket
 * empty, and a cypher that no longer fits (socket count lowered, artifact gone) is unsocketed.
 */

import {MODULE_ID, t} from "../constants.js";
import {get} from "./shared.js";
import {displayName} from "./items.js";

export const MAX_SOCKETS = 3;

const norm = s => String(s ?? "").trim().toLowerCase();

/** An artifact's socket settings. */
export function socketSettings(artifact) {
  const s = get(artifact, `flags.${MODULE_ID}.sockets`) ?? {};
  return {enabled: !!s.enabled, count: Math.clamp(Number(s.count) || 1, 1, MAX_SOCKETS), key: String(s.key ?? "").trim()};
}

/** A cypher's socket settings and placement. */
export function cypherSocket(cypher) {
  const s = get(cypher, `flags.${MODULE_ID}.socket`) ?? {};
  return {
    enabled: !!s.enabled,
    key: String(s.key ?? "").trim(),
    artifactId: s.artifactId ?? null,
    slot: Number.isInteger(s.slot) ? s.slot : null,
    reusable: !!s.reusable,
    spent: !!s.spent
  };
}

/** Map of artifact id → slot array (cypher or null) for the actor's socketed artifacts. */
export function socketLayout(actor) {
  const layout = new Map();
  for (const item of actor.items) {
    if (item.type !== "artifact") continue;
    const s = socketSettings(item);
    if (s.enabled) layout.set(item.id, Array(s.count).fill(null));
  }
  const placed = actor.items
    .filter(i => i.type === "cypher" && layout.has(cypherSocket(i).artifactId))
    .sort((a, b) => (cypherSocket(a).slot ?? MAX_SOCKETS) - (cypherSocket(b).slot ?? MAX_SOCKETS) || a.name.localeCompare(b.name));
  for (const cypher of placed) {
    const {artifactId, slot} = cypherSocket(cypher);
    const slots = layout.get(artifactId);
    const index = slot !== null && slot < slots.length && !slots[slot] ? slot : slots.indexOf(null);
    if (index >= 0) slots[index] = cypher;
  }
  return layout;
}

/** Ids of cyphers sitting in a socket. They leave the Cyphers group and the cypher count. */
export function socketedIds(actor) {
  const ids = new Set();
  for (const slots of socketLayout(actor).values()) for (const c of slots) if (c) ids.add(c.id);
  return ids;
}

/** Unsocketed, identified cyphers whose identifier matches the artifact's. */
export function eligibleCyphers(actor, artifact) {
  const key = norm(socketSettings(artifact).key);
  if (!key) return [];
  const taken = socketedIds(actor);
  return actor.items
    .filter(i => i.type === "cypher" && !taken.has(i.id) && !i.system.archived && i.system.basic?.identified !== false)
    .filter(i => cypherSocket(i).enabled && norm(cypherSocket(i).key) === key)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Sockets for display, or null. Hidden on unidentified artifacts. */
export function socketView(actor, artifact) {
  const s = socketSettings(artifact);
  if (artifact.type !== "artifact" || !s.enabled || artifact.system.basic?.identified === false) return null;
  const slots = (socketLayout(actor).get(artifact.id) ?? []).map((c, index) => {
    if (!c) return {index};
    const {spent, reusable} = cypherSocket(c);
    return {index, id: c.id, name: displayName(c), img: c.img, imgIsIcon: /\.svg(?:$|\?)/i.test(c.img ?? ""), spent, reusable};
  });
  const summary = slots.map(slot => (slot.id ? `${slot.name}${slot.spent ? ` (${t("Socket.Spent")})` : ""}` : t("Socket.Empty"))).join(", ");
  return {key: s.key, slots, anySpent: slots.some(slot => slot.spent), summary: `${t("Socket.Title")}: ${summary}`};
}

export async function socketCypher(cypher, artifact, slot) {
  return cypher.update({[`flags.${MODULE_ID}.socket`]: {artifactId: artifact.id, slot, spent: false}});
}

export async function unsocketCypher(cypher) {
  return cypher.update({[`flags.${MODULE_ID}.socket`]: {artifactId: null, slot: null, spent: false}});
}

/** Clear the spent marks on an artifact's reusable cyphers. */
export async function refreshSockets(actor, artifact) {
  const updates = (socketLayout(actor).get(artifact.id) ?? [])
    .filter(c => c && cypherSocket(c).spent)
    .map(c => ({_id: c.id, [`flags.${MODULE_ID}.socket.spent`]: false}));
  if (updates.length) return actor.updateEmbeddedDocuments("Item", updates);
}

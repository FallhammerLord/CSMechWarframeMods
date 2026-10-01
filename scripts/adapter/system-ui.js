/**
 * The system's UI, adjusted at render time; the system's code and stored messages are unchanged.
 * - The system's windows (actor and item sheets, roll dialog, forms) can be dark (system-dark.js):
 *   a card-sheet actor's follow that sheet's theme, the rest follow the player's setting.
 * - The roll dialog and roll chat cards show custom pool names.
 * - The roll dialog can pay from XP.
 * - A roll's minor or major effect is marked on the actor for the portrait indicators.
 * - Item sheets get the resource, socket and artifact-link fields (spec §15-17).
 * - Chat cards open with item text and roll details collapsed or expanded, per player.
 * Baseline: cyphersystem v3.5.2.
 */

import {MODULE_ID, t} from "../constants.js";
import {LINKABLE_TYPES, applyPoolNames, itemPool, setRollEffect} from "./cypher.js";
import {applyChatDisclosure} from "./chat-cards.js";
import {CypherCardSheet} from "../sheet/card-sheet.js";
import {effectiveTheme} from "../sheet/theme.js";
import {applySystemDark, systemDarkWanted} from "./system-dark.js";

function usesCardSheet(actor) {
  try {
    return actor?.sheet instanceof CypherCardSheet;
  } catch {
    return false;
  }
}

const rootOf = (app, html) => {
  const root = app.element?.[0] ?? app.element ?? html?.[0] ?? html;
  return root instanceof HTMLElement ? root : null;
};

/** Dark for a card-sheet actor's windows: that sheet's theme. Otherwise the player's setting. */
const darkFor = (actor, root) => (usesCardSheet(actor)
  ? effectiveTheme(actor.sheet) !== "theme-light"
  : systemDarkWanted(root.ownerDocument));

function onRenderRollDialog(app, html) {
  const actor = fromUuidSync(app.object?.actorUuid ?? "");
  const root = rootOf(app, html);
  if (!root) return;
  applySystemDark(root, darkFor(actor, root), "ccs-aio");
  if (!usesCardSheet(actor)) return;
  enableXpPool(app, root, actor);
  applyPoolNames(root.querySelector(".window-content") ?? root, actor, {skip: null});
}

/**
 * Let the dialog pay from XP: add XP to its pool choices (the system defines the choice but
 * doesn't offer it). An XP-cost item arrives as "Any pool" (item-actions.js poolOverride) and is
 * switched to XP once, through the form's own change handling so the summary recalculates.
 */
function enableXpPool(app, root, actor) {
  const select = root.querySelector('select[name="pool"]');
  if (!select) return;
  if (!select.querySelector('option[value="XP"]')) select.add(new Option(game.i18n.localize("CYPHERSYSTEM.XP"), "XP"));
  if (app.object.pool === "XP") select.value = "XP";
  const item = app.object.itemID ? actor.items.get(app.object.itemID) : null;
  if (!app._ccsXpApplied && item && itemPool(item) === "XP" && app.object.pool === "Pool") {
    app._ccsXpApplied = true;
    select.value = "XP";
    select.dispatchEvent(new Event("change", {bubbles: true}));
  }
}

/** Item sheets (every type) of items owned by a card-sheet actor follow that sheet's theme. */
function onRenderItemSheet(app, html) {
  const item = app.document ?? app.object;
  const root = rootOf(app, html);
  if (!root || !item) return;
  addSheetFields(root, item, app.isEditable);
  applySystemDark(root, darkFor(item.parent, root), "ccs-item-sheet", "ccs-sys-sheet");
}

/** The system's actor sheets (every type, the default PC sheet included) and Sheet Customization. */
function onRenderSystemWindow(kind) {
  return (app, html) => {
    const root = rootOf(app, html);
    if (root) applySystemDark(root, darkFor(app.actor, root), kind, "ccs-sys-sheet");
  };
}

/* Fields added to the system's item sheets, in its Settings tab and markup. Inputs are named by
   flag path, so the system's own form submit saves them. */

const esc = v => Handlebars.escapeExpression(String(v ?? ""));
const flagPath = key => `flags.${MODULE_ID}.${key}`;
const settingsRow = (label, input) =>
  `<li class="item flexrow item-settings"><div class="settings-list">${label}</div><div class="item-quantity">${input}</div></li>`;
const textInput = (key, value, placeholder, off) =>
  `<input class="auto-margin settings-input" type="text" name="${flagPath(key)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${off}>`;
const numberInput = (key, value, off) =>
  `<input class="auto-margin settings-input" type="number" data-dtype="Number" min="0" name="${flagPath(key)}" value="${esc(value ?? 0)}"${off}>`;
const checkbox = (key, value, off) => `<input type="checkbox" name="${flagPath(key)}"${value ? " checked" : ""}${off}>`;

function fieldsSection(title, rows, note = "") {
  return `<div class="flexrow ccs-sheet-fields"><ol class="items-list">
    <li class="item flexrow item-header"><div class="item-name">${title}</div></li>
    ${rows.join("")}${note ? `<li class="item flexrow"><div class="settings-list ccs-muted">${note}</div></li>` : ""}
  </ol></div>`;
}

/** Artifact resource (spec §15). */
export function resourceFieldsHtml(item, editable = true) {
  const r = item.flags?.[MODULE_ID]?.resource ?? {};
  const off = editable ? "" : " disabled";
  return fieldsSection(t("Resource.Title"), [
    settingsRow(t("Resource.Name"), textInput("resource.label", r.label, t("Resource.NameHint"), off)),
    settingsRow(t("Resource.Value"), numberInput("resource.value", r.value, off)),
    settingsRow(t("Resource.Max"), numberInput("resource.max", r.max, off)),
    settingsRow(t("Resource.DepleteAtZero"), checkbox("resource.depleteAtZero", r.depleteAtZero, off))
  ]);
}

/** Socket settings (spec §16): sockets on an artifact, socketability on a cypher. GM-only. */
export function socketFieldsHtml(item, editable = true) {
  const gm = editable && game.user.isGM;
  const off = gm ? "" : " disabled";
  const note = editable && !gm ? t("Socket.GmOnly") : "";
  if (item.type === "artifact") {
    const s = item.flags?.[MODULE_ID]?.sockets ?? {};
    const rows = [settingsRow(t("Socket.HasSockets"), checkbox("sockets.enabled", s.enabled, off))];
    if (s.enabled) {
      const count = Number(s.count) || 1;
      const options = [1, 2, 3].map(n => `<option value="${n}"${n === count ? " selected" : ""}>${n}</option>`).join("");
      rows.push(
        settingsRow(t("Socket.Count"), `<select class="auto-margin settings-input" name="${flagPath("sockets.count")}" data-dtype="Number"${off}>${options}</select>`),
        settingsRow(t("Socket.Key"), textInput("sockets.key", s.key, t("Socket.KeyHint"), off))
      );
    }
    return fieldsSection(t("Socket.ArtifactTitle"), rows, note);
  }
  const s = item.flags?.[MODULE_ID]?.socket ?? {};
  const rows = [settingsRow(t("Socket.Socketable"), checkbox("socket.enabled", s.enabled, off))];
  if (s.enabled) {
    rows.push(
      settingsRow(t("Socket.Key"), textInput("socket.key", s.key, t("Socket.KeyHint"), off)),
      settingsRow(t("Socket.Reusable"), checkbox("socket.reusable", s.reusable, off))
    );
  }
  return fieldsSection(t("Socket.CypherTitle"), rows, note);
}

/** An item's link to the artifact whose charges and sockets it shares (spec §17). GM-only. */
export function linkFieldsHtml(item, editable = true) {
  const gm = editable && game.user.isGM;
  const off = gm ? "" : " disabled";
  if (!item.parent) return fieldsSection(t("Link.Title"), [], t("Link.Unowned"));
  const artifacts = item.parent.items.filter(i => i.type === "artifact");
  const current = item.flags?.[MODULE_ID]?.linkedArtifact ?? "";
  const options = [`<option value="">${t("Link.None")}</option>`]
    .concat(artifacts.map(a => `<option value="${a.id}"${a.id === current ? " selected" : ""}>${esc(a.name)}</option>`)).join("");
  return fieldsSection(t("Link.Title"), [
    settingsRow(t("Link.Artifact"), `<select class="auto-margin settings-input" name="${flagPath("linkedArtifact")}"${off}>${options}</select>`)
  ], editable && !gm ? t("Socket.GmOnly") : t("Link.Hint"));
}

function addSheetFields(root, item, editable) {
  const tab = root.querySelector('.tab[data-tab="settings"]');
  if (!tab || tab.querySelector(".ccs-sheet-fields")) return;
  let html = "";
  if (item.type === "artifact") html = resourceFieldsHtml(item, editable) + socketFieldsHtml(item, editable);
  if (item.type === "cypher") html += socketFieldsHtml(item, editable);
  if (LINKABLE_TYPES.has(item.type)) html += linkFieldsHtml(item, editable);
  if (!html) return;
  tab.insertAdjacentHTML("afterbegin", html);
}

function onRenderChatMessage(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  applyChatDisclosure(root);
  const uuid = message.flags?.data?.actorUuid;
  if (!uuid) return;
  const actor = fromUuidSync(uuid);
  if (!actor?.getFlag(MODULE_ID, "poolLabels")) return;
  applyPoolNames(root.querySelector(".roll-flavor") ?? root, actor);
}

/**
 * Roll effects: a natural 19 (minor) or 20 (major), when not impaired, lights that star on the
 * actor. Rolls never clear a star (effects can be banked). Written once, by the rolling client.
 */
function onCreateChatMessage(message) {
  const data = message.flags?.data;
  if (!data?.actorUuid || data.skipRoll || message.author?.id !== game.user.id) return;
  const actor = fromUuidSync(data.actorUuid);
  if (!usesCardSheet(actor) || !actor.isOwner) return;
  const natural = data.roll?.total ?? message.rolls?.[0]?.total;
  const kind = data.impairedStatus ? null : {19: "minor", 20: "major"}[natural];
  if (kind && !actor.getFlag(MODULE_ID, "effects")?.[kind]) return setRollEffect(actor, kind, true);
}

export function registerSystemUi() {
  Hooks.on("createChatMessage", onCreateChatMessage);
  Hooks.on("renderRollEngineDialogSheet", onRenderRollDialog);
  Hooks.on("renderCypherItemSheet", onRenderItemSheet);
  Hooks.on("renderCypherActorSheet", onRenderSystemWindow("ccs-actor-sheet"));
  // The difficulty and GM intrusion forms are translucent panels with light text already.
  Hooks.on("renderSheetCustomization", onRenderSystemWindow("ccs-sys-form"));
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
}

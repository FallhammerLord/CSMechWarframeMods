/**
 * System UI for actors using the card sheet, adjusted at render time; the system's code and
 * stored messages are unchanged.
 * - All-in-One roll dialog and item sheets follow the sheet's dark theme.
 * - The roll dialog and roll chat cards show custom pool names.
 * - Artifact item sheets get the resource fields (spec §15), for every artifact.
 * Baseline: cyphersystem v3.5.2.
 */

import {MODULE_ID, t} from "../constants.js";
import {applyPoolNames} from "./cypher.js";
import {CypherCardSheet} from "../sheet/card-sheet.js";
import {effectiveTheme} from "../sheet/theme.js";

function usesCardSheet(actor) {
  try {
    return actor?.sheet instanceof CypherCardSheet;
  } catch {
    return false;
  }
}

/**
 * Put a system (AppV1) window into the sheet's dark theme, or take it out. Backgrounds are set
 * inline with priority, since the system paints its forms with an !important gradient.
 */
function applySystemDark(root, dark, cls) {
  root.classList.add(cls);
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

const rootOf = (app, html) => {
  const root = app.element?.[0] ?? app.element ?? html?.[0] ?? html;
  return root instanceof HTMLElement ? root : null;
};

function onRenderRollDialog(app, html) {
  const actor = fromUuidSync(app.object?.actorUuid ?? "");
  if (!usesCardSheet(actor)) return;
  const root = rootOf(app, html);
  if (!root) return;
  const dark = effectiveTheme(actor.sheet) !== "theme-light";
  applySystemDark(root, dark, "ccs-aio");
  applyPoolNames(root.querySelector(".window-content") ?? root, actor, {skip: null});
}

/** Item sheets (every type) of items owned by a card-sheet actor follow that sheet's theme. */
function onRenderItemSheet(app, html) {
  const item = app.document ?? app.object;
  const root = rootOf(app, html);
  if (!root || !item) return;
  if (item.type === "artifact") addResourceFields(root, item, app.isEditable);
  const actor = item.parent;
  if (usesCardSheet(actor)) applySystemDark(root, effectiveTheme(actor.sheet) !== "theme-light", "ccs-item-sheet");
}

/**
 * The artifact resource fields (spec §15), in the system sheet's settings tab and markup. The
 * inputs are named by flag path, so the system's own form submit saves them.
 */
export function resourceFieldsHtml(item, editable = true) {
  const r = item.flags?.[MODULE_ID]?.resource ?? {};
  const esc = v => Handlebars.escapeExpression(String(v ?? ""));
  const path = key => `flags.${MODULE_ID}.resource.${key}`;
  const off = editable ? "" : " disabled";
  const row = (label, input) => `<li class="item flexrow item-settings"><div class="settings-list">${label}</div><div class="item-quantity">${input}</div></li>`;
  return `<div class="flexrow ccs-resource-fields"><ol class="items-list">
    <li class="item flexrow item-header"><div class="item-name">${t("Resource.Title")}</div></li>
    ${row(t("Resource.Name"), `<input class="auto-margin settings-input" type="text" name="${path("label")}" value="${esc(r.label)}" placeholder="${esc(t("Resource.NameHint"))}"${off}>`)}
    ${row(t("Resource.Value"), `<input class="auto-margin settings-input" type="number" data-dtype="Number" min="0" name="${path("value")}" value="${esc(r.value ?? 0)}"${off}>`)}
    ${row(t("Resource.Max"), `<input class="auto-margin settings-input" type="number" data-dtype="Number" min="0" name="${path("max")}" value="${esc(r.max ?? 0)}"${off}>`)}
    ${row(t("Resource.DepleteAtZero"), `<input type="checkbox" name="${path("depleteAtZero")}"${r.depleteAtZero ? " checked" : ""}${off}>`)}
  </ol></div>`;
}

function addResourceFields(root, item, editable) {
  const tab = root.querySelector('.tab[data-tab="settings"]');
  if (!tab || tab.querySelector(".ccs-resource-fields")) return;
  tab.insertAdjacentHTML("afterbegin", resourceFieldsHtml(item, editable));
}

function onRenderChatMessage(message, html) {
  const uuid = message.flags?.data?.actorUuid;
  if (!uuid) return;
  const actor = fromUuidSync(uuid);
  if (!actor?.getFlag(MODULE_ID, "poolLabels")) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  applyPoolNames(root?.querySelector(".roll-flavor") ?? root, actor);
}

export function registerSystemUi() {
  Hooks.on("renderRollEngineDialogSheet", onRenderRollDialog);
  Hooks.on("renderCypherItemSheet", onRenderItemSheet);
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
}

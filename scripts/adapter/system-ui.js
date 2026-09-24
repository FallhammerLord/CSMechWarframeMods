/**
 * Adjustments to Cypher System UI for actors using the card sheet, applied from the outside:
 * the system's roll dialog and chat cards are never modified at the source.
 *
 * - All-in-One roll dialog: follows the card sheet's dark theme, and shows custom pool names.
 * - Item sheets of the actor's items: follow the card sheet's dark theme.
 * - Roll chat cards: show the rolling actor's custom pool names at display time. The stored
 *   message keeps the system's wording, so other sheets and modules see the original text.
 *
 * Baseline: cyphersystem v3.5.2 (forms/roll-engine-dialog-sheet.js, roll-engine-output.js).
 */

import {MODULE_ID} from "../constants.js";
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
 * Put a system (AppV1) window into the card sheet's dark theme, or take it out again.
 * Backgrounds are set inline with priority: the system paints its forms with an !important
 * gradient and core themes paint the window, so stylesheet rules alone were not enough.
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
  root.classList.toggle("ccs-aio-dark", dark);
  applySystemDark(root, dark, "ccs-aio");
  applyPoolNames(root.querySelector(".window-content") ?? root, actor, {skip: null});
}

/**
 * Item sheets (the system's AppV1 CypherItemSheet, every item type) of items owned by an actor
 * using the card sheet follow that sheet's theme, so opening a card's editor stays dark.
 */
function onRenderItemSheet(app, html) {
  const actor = app.document?.parent ?? app.object?.parent;
  if (!usesCardSheet(actor)) return;
  const root = rootOf(app, html);
  if (!root) return;
  applySystemDark(root, effectiveTheme(actor.sheet) !== "theme-light", "ccs-item-sheet");
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

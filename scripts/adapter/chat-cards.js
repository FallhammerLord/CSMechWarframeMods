/**
 * Chat cards open with item text and roll details collapsed or expanded, per player. Applied
 * at render time, so stored messages are unchanged and older cards follow the setting too.
 * Baseline: cyphersystem v3.5.2 roll card markup (roll-engine-output.js).
 */

import {MODULE_ID} from "../constants.js";
import {systemSetting} from "./shared.js";

/** The system's collapsible blocks on roll cards; its own click handlers open and close them. */
const ITEM_TEXT = ".chat-card-item-description";
const ROLL_DETAILS = ".roll-result-difficulty-details, .roll-result-damage-details, .roll-result-cost-details";

/** A player's chat setting: true (expanded), false (collapsed) or null (game default). */
function chatPreference(key) {
  const value = game.settings.get(MODULE_ID, key);
  return value === "expanded" ? true : value === "collapsed" ? false : null;
}

/** Set a system block's starting state the way its click handler expects (class + display). */
function setSystemBlock(el, open) {
  el.classList.toggle("expanded", open);
  el.style.display = open ? "" : "none";
}

function setItemBody(card, open) {
  card.querySelector(".ccs-chat-body").hidden = !open;
  card.querySelector(".ccs-chat-toggle").setAttribute("aria-expanded", String(open));
}

export function applyChatDisclosure(root) {
  const itemText = chatPreference("chatItemText");
  const details = chatPreference("chatRollDetails");
  if (itemText !== null) for (const el of root.querySelectorAll(ITEM_TEXT)) setSystemBlock(el, itemText);
  if (details !== null) {
    for (const el of root.querySelectorAll(ROLL_DETAILS)) setSystemBlock(el, details);
    for (const el of root.querySelectorAll(".dice-tooltip")) el.classList.toggle("expanded", details);
  }
  // Cards sent from this sheet: game default follows the system's "always show description".
  const open = itemText ?? !!systemSetting("alwaysShowDescriptionOnRoll");
  for (const card of root.querySelectorAll(".ccs-chat-item")) {
    if (!card.querySelector(".ccs-chat-body")) continue;
    setItemBody(card, open);
    const toggle = card.querySelector(".ccs-chat-toggle");
    const flip = event => {
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setItemBody(card, toggle.getAttribute("aria-expanded") !== "true");
    };
    toggle.addEventListener("click", flip);
    toggle.addEventListener("keydown", flip);
  }
}

/** Item actions (rolls, chat, toggles, depletion), the large card's content, creation and drops. */

import {MODULE_ID, t} from "../constants.js";
import * as sys from "./system-imports.js";
import {L, alt, callApi, capitalize} from "./shared.js";
import {CARD_TYPES, ROLL_TYPES, cardData, cypherType, isFormula, isZeroCost, itemRollsEnabled, resourceOf} from "./items.js";

/** d20: the default sheet's exact call (actor-sheet.js `.item-roll`), else post to chat. */
export function rollItem(actor, item) {
  if (!itemRollsEnabled() || !ROLL_TYPES.has(item.type)) return sendToChat(actor, item);
  const macroUuid = item.system.settings.rollButton.macroUuid;
  return callApi("itemRollMacro", actor, item.id, "", "", "", "", "", "", "", "", "", "", "", "", false, "", macroUuid, "");
}

/** Pay pool points without rolling (actor-sheet.js `.item-pay`). */
export function payItem(actor, item) {
  const macroUuid = item.system.settings.rollButton.macroUuid;
  return callApi("itemRollMacro", actor, item.id, "", "", "", "", "", "", "", "", "", "", "", "", true, "", macroUuid, "");
}

/** Post the item to chat (actor-sheet.js Alt-click on `.item-description`). */
export async function sendToChat(actor, item) {
  const b = item.system.basic ?? {};
  if (b.identified === false) return ui.notifications.warn(L("WarnSentUnidentifiedToChat"));
  const notes = b.notes ? `, ${b.notes}` : "";
  let brackets = "";
  if (item.type === "skill") {
    brackets = ` (${b.rating})`;
  } else if (item.type === "power-shift") {
    brackets = ` (${b.shifts} ${L("Shifts")})`;
  } else if (item.type === "ability") {
    const points = b.cost == "1" ? L("point") : L("points");
    if (!isZeroCost(b.cost)) brackets = ` (${b.cost} ${b.pool} ${points})`;
  } else if (item.type === "attack") {
    const points = b.damage == 1 ? L("PointOfDamage") : L("PointsOfDamage");
    const range = b.range ? `, ${b.range}` : "";
    brackets = ` (${b.type}, ${b.damage} ${points}${range}${notes})`;
  } else if (item.type === "armor") {
    brackets = ` (${b.type}${notes})`;
  } else if (item.type === "lasting-damage") {
    const permanent = b.type === "Permanent" ? `, ${L("permanent")}` : "";
    brackets = ` (${b.pool}${permanent})`;
  } else if (b.level) {
    brackets = ` (${L("level")} ${b.level})`;
  }
  const description = `<hr style="margin:3px 0;"><img class="description-image-chat" src="${item.img}" width="50" height="50"/>${item.system.description ?? ""}`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: `<b>${capitalize(item.type)}: ${item.name}</b>${brackets}${description}`
  });
}

export async function toggleArchive(item) {
  return item.update({"system.archived": !item.system.archived});
}

export async function toggleFavorite(item) {
  return item.update({"system.favorite": !item.system.favorite});
}

/** Delete, with the default sheet's tag cleanup (actor-sheet.js `.item-delete`). */
export async function deleteItem(actor, item) {
  if (["tag", "recursion"].includes(item.type)) {
    if (item.system.active) {
      const m = item.system.settings.statModifiers;
      await sys.changeTagStats(actor, {
        mightModifier: m.might.value,
        mightEdgeModifier: m.might.edge,
        speedModifier: m.speed.value,
        speedEdgeModifier: m.speed.edge,
        intellectModifier: m.intellect.value,
        intellectEdgeModifier: m.intellect.edge,
        itemActive: item.system.active
      });
    }
    await sys.removeTagFromItem(actor, item.id);
  }
  return item.delete();
}

export async function adjustQuantity(item, direction) {
  const amount = (alt() ? 10 : 1) * direction;
  return item.update({"system.basic.quantity": (item.system.basic.quantity ?? 0) + amount});
}

export async function adjustLastingDamage(item, direction) {
  const amount = (alt() ? 10 : 1) * direction;
  return item.update({"system.basic.damage": item.system.basic.damage + amount});
}

export async function toggleArmorActive(item) {
  return item.update({"system.active": !item.system.active});
}

export async function toggleTemporary(item) {
  return item.update({"system.basic.temporary": !item.system.basic.temporary});
}

export async function identify(actor, item) {
  if (game.user.isGM) return item.update({"system.basic.identified": true});
  const content = callApi("chatCardMarkItemIdentified", actor, item);
  if (!content) return;
  return ChatMessage.create({content, whisper: ChatMessage.getWhisperRecipients("GM"), blind: true});
}

/** Click cycles the type; Alt toggles fantastic (actor-sheet.js `.toggle-cypher-type`). */
export async function cycleCypherType(item) {
  let [kind, fantastic] = item.system.basic.type ?? [0, 0];
  if (alt()) fantastic = fantastic === 1 ? 0 : 1;
  else kind = kind === 2 ? 0 : kind + 1;
  return item.update({"system.basic.type": [kind, fantastic]});
}

export async function rollForLevel(item) {
  const roll = await new Roll(String(item.system.basic.level)).evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker(),
    flavor: game.i18n.format("CYPHERSYSTEM.RollForLevel", {item: item.name})
  });
  return item.update({"system.basic.level": roll.total});
}

export async function castSpell(actor, item) {
  const recoveryUsed = await sys.useRecoveries(actor, true);
  if (!recoveryUsed) return;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: game.i18n.format("CYPHERSYSTEM.CastingASpell", {name: actor.name, recoveryUsed, spellName: item.name}),
    flags: {itemID: item.id}
  });
}

/** Depletion text ("1 in d6", "1-2 in d10", "1 in [[/r d20]]", HTML allowed) → {low, high, die}. */
export function parseDepletion(text) {
  const plain = String(text ?? "").replace(/<[^>]*>/g, " ");
  const m = plain.match(/(\d+)\s*(?:[-–]\s*(\d+))?\s*in\s*(?:\[\[\s*\/r(?:oll)?\s*)?(\d*d\d+)/i);
  if (!m) return null;
  const low = Number(m[1]);
  const high = Number(m[2] ?? m[1]);
  const die = m[3].toLowerCase().startsWith("d") ? `1${m[3]}` : m[3];
  return {low: Math.min(low, high), high: Math.max(low, high), die};
}

export async function rollDepletion(actor, item) {
  const text = item.system.basic?.depletion ?? "";
  const parsed = parseDepletion(text);
  if (!parsed) return ui.notifications.warn(t("Depletion.Unreadable", {name: item.name}));
  const roll = await new Roll(parsed.die).evaluate();
  const depleted = roll.total >= parsed.low && roll.total <= parsed.high;
  const range = parsed.low === parsed.high ? `${parsed.low}` : `${parsed.low}–${parsed.high}`;
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({actor}),
    flavor: `<b>${Handlebars.escapeExpression(item.name)}</b><br>${t("Depletion.Flavor", {range, die: parsed.die})}<br>`
      + `<b>${t(depleted ? "Depletion.Depleted" : "Depletion.Holds")}</b>`
  });
}

/** Spend or refill an artifact's resource, within 0 to max. Optionally rolls depletion at 0. */
export async function adjustResource(actor, item, direction) {
  const r = resourceOf(item);
  if (!r) return;
  const value = Math.clamp(r.value + (alt() ? 10 : 1) * direction, 0, r.max);
  if (value === r.value) return;
  await item.update({[`flags.${MODULE_ID}.resource.value`]: value});
  if (value === 0 && r.depleteAtZero && item.system.basic?.depletion) return rollDepletion(actor, item);
}

/** The large card's action bar (spec §5). `label` is the short text, `title` the tooltip. */
export function itemControls(actor, item) {
  const b = item.system.basic ?? {};
  const gm = game.user.isGM;
  const identified = b.identified !== false;
  const c = [];
  const add = (action, icon, label, title = label, extra = {}) => c.push({action, icon, label, title, ...extra});

  if (item.type === "ability" && itemRollsEnabled()) add("payItem", "fa-solid fa-coins", t("Action.Pay"), L("PayItem"));
  if (item.type === "ability" && item.system.settings.general.sorting === "Spell") {
    add("castSpell", "fa-solid fa-book-sparkles", t("Action.Cast"), L("CastSpell"));
  }
  if (["equipment", "ammo", "material"].includes(item.type) && b.quantity != null) {
    add("quantityDown", "fa-solid fa-minus", t("Action.QuantityDown"), t("Action.AltTen"));
    add("quantityUp", "fa-solid fa-plus", t("Action.QuantityUp"), t("Action.AltTen"));
  }
  if (item.type === "lasting-damage") {
    add("damageDown", "fa-solid fa-minus", t("Action.DamageDown"), t("Action.AltTen"));
    add("damageUp", "fa-solid fa-plus", t("Action.DamageUp"), t("Action.AltTen"));
  }
  if (["cypher", "artifact"].includes(item.type)) {
    if (!identified) add("identify", "fa-regular fa-eye-slash", t("Action.Identify"), L("MarkIdentified"));
    if (identified && isFormula(b.level)) add("rollForLevel", "fa-solid fa-dice", t("Action.RollLevel"), L("RollForLevelButton"));
  }
  if (item.type === "cypher" && (identified || gm)) {
    const ct = cypherType(item);
    add("cycleCypherType", ct.icon, ct.title, t("Action.CycleCypherType"), {color: ct.color});
  }
  if (item.type === "armor") {
    add("toggleArmor", "fa-solid fa-shield-halved", t("Action.ArmorActive"), L("ArmorActive"), {pressed: item.system.active !== false});
  }
  if (item.type === "power-shift") {
    add("toggleTemporary", "fa-solid fa-clock", t("Card.Temporary"), L("ToggleTemporaryPowerShift"), {pressed: !!b.temporary});
  }
  add("toggleFavorite", item.system.favorite ? "fa-solid fa-star" : "fa-regular fa-star", t("Action.Favorite"), L("ItemFavorite"),
    {pressed: !!item.system.favorite});
  add("sendToChat", "fa-solid fa-comment", t("Action.SendToChat"));
  if (identified || gm) add("editItem", "fa-solid fa-pen-to-square", t("Action.Edit"), L("EditItem"));
  return c;
}

/** The large card: facts row, description and controls. */
export async function itemDetail(actor, item) {
  const card = cardData(item, actor);
  const resource = resourceOf(item);
  const b = item.system.basic ?? {};
  const facts = [];
  if (card.training) facts.push(card.training.label);
  if (card.value && !resource) facts.push(card.value);
  if (card.detail) facts.push(card.detail);
  if (item.type === "attack" && b.type) facts.push(b.type);
  if (item.type === "armor" && b.type) facts.push(b.type);
  if (item.type === "armor" && item.system.active === false) facts.push(t("Card.Inactive"));
  if (item.system.settings?.general?.initiative) facts.push(L("Initiative"));
  const showPrice = actor.system.settings.general.showPrice;
  if (showPrice && showPrice !== "none" && item.system.price) {
    const p = item.system.price;
    if (["category", "both"].includes(showPrice) && p.category && p.category !== "none") facts.push(capitalize(p.category));
    if (["priceTag", "both"].includes(showPrice) && p.priceTag) facts.push(p.priceTag);
  }
  if (b.notes) facts.push(b.notes);

  const TextEditor = foundry.applications.ux.TextEditor.implementation;
  const description = card.identified
    ? await TextEditor.enrichHTML(item.system.description ?? "", {secrets: actor.isOwner, relativeTo: item})
    : `<p class="ccs-muted">${t("Popover.Unidentified")}</p>`;
  return {card, facts, resource, description, controls: itemControls(actor, item)};
}

/** Core's creation dialog, filtered to the group's types (spec §6). */
export async function createItem(actor, {types, sorting} = {}) {
  const data = {};
  if (sorting) foundry.utils.setProperty(data, "system.settings.general.sorting", sorting);
  const cls = getDocumentClass("Item");
  const allowed = (types?.length ? types : CARD_TYPES).filter(type => cls.TYPES?.includes(type) ?? true);
  // `types` goes in both option objects so either placement of the filter is honoured.
  return cls.createDialog(data, {parent: actor, types: allowed, renderSheet: true}, {types: allowed});
}

/**
 * Drops go to the system's own handler, so its rules (move/archive dialogs, quantity splits,
 * identification, category sorting) stay intact.
 */
export async function dropItem(actor, event, data) {
  const handler = game.cyphersystem?.CypherActorSheet?.prototype?._onDropItem;
  if (typeof handler !== "function") {
    ui.notifications.error(t("Error.MissingApi", {name: "CypherActorSheet._onDropItem"}));
    return;
  }
  return handler.call({actor}, event, data);
}

/** Actor data: header, pools, damage track, stress, armor, recovery rolls, currency. */

import {MODULE_ID, SYSTEM_ID} from "../constants.js";
import * as sys from "./system-imports.js";
import {L, STAT_POOLS, alt, callApi, capitalize, count, get, isTeen, poolBase, systemSetting} from "./shared.js";
import {ARMOR_IMAGE, armorImage} from "./options.js";
import {inCurrentForm} from "./items.js";

/** Multi-roll, static-stat lock and exclusive-tag state (pc-sheet.js getData). */
export function actorState(actor) {
  const flag = key => actor.getFlag(SYSTEM_ID, key);
  const multiRoll = flag("multiRoll.active") === true;
  const changed = key => multiRoll && flag(`multiRoll.modifiers.${key}`) != 0;
  const exclusive = actor.items.find(i => i.type === "tag" && i.system.exclusive && i.system.active);
  return {
    teen: isTeen(actor),
    multiRoll,
    staticStatsLocked: !!(flag("disabledStaticStats") || multiRoll),
    multiRollEffort: changed("effort"),
    multiRollEdge: {
      might: changed("might.edge"),
      speed: changed("speed.edge"),
      intellect: changed("intellect.edge")
    },
    exclusiveTag: exclusive?.name ?? "",
    // Minor or major effect from the actor's latest roll (system-ui.js), until used or rolled over.
    effect: actor.getFlag(MODULE_ID, "effect")?.kind ?? null
  };
}

/** Header fields. Paths switch with the Mask/Teen form, as in pc-base-info.html. */
export function identity(actor) {
  const s = actor.system;
  const teen = isTeen(actor);
  const strange = s.settings.general.gameMode === "Strange";
  const sentence = s.settings.general.additionalSentence;
  return {
    teen,
    gameMode: s.settings.general.gameMode,
    showFormSelect: s.settings.general.gameMode === "Unmasked",
    img: teen ? s.teen.basic.img : actor.img,
    imgPath: teen ? "system.teen.basic.img" : "img",
    name: teen ? s.teen.basic.name : actor.name,
    namePath: teen ? "system.teen.basic.name" : "name",
    descriptor: teen ? s.teen.basic.descriptor : s.basic.descriptor,
    descriptorPath: teen ? "system.teen.basic.descriptor" : "system.basic.descriptor",
    isLabel: teen ? L("Is") : L("IsA"),
    type: s.basic.type,
    focus: s.basic.focus,
    focusLocked: strange,
    showSentence: !teen && sentence.active,
    sentence: s.basic.additionalSentence,
    sentencePlaceholder: sentence.label || (strange ? L("Recursion") : L("AdditionalSentence")),
    tier: s.basic.tier,
    effort: s.basic.effort,
    xp: s.basic.xp,
    advancement: ["stats", "effort", "edge", "skill", "other"].map(key => ({
      key,
      path: `system.basic.advancement.${key}`,
      checked: s.basic.advancement[key],
      label: L(`Advancement${key === "stats" ? "Pool" : capitalize(key)}`)
    }))
  };
}

/** Mark a roll's minor or major effect as available, or clear it (kind null). */
export async function setRollEffect(actor, kind) {
  if (!kind) return actor.getFlag(MODULE_ID, "effect") ? actor.unsetFlag(MODULE_ID, "effect") : undefined;
  return actor.setFlag(MODULE_ID, "effect", {kind});
}

export async function adjustXP(actor, direction) {
  const amount = (alt() ? 10 : 1) * direction;
  return actor.update({"system.basic.xp": actor.system.basic.xp + amount});
}

export async function resetAdvancement(actor) {
  return actor.update({
    "system.basic.advancement.stats": false,
    "system.basic.advancement.effort": false,
    "system.basic.advancement.edge": false,
    "system.basic.advancement.skill": false,
    "system.basic.advancement.other": false
  });
}

/* Pools */

/** Per-actor pool names (module flags), falling back to the system's names. */
export function poolNames(actor) {
  const custom = actor?.getFlag(MODULE_ID, "poolLabels") ?? {};
  return Object.fromEntries(STAT_POOLS.map(key => [key, {
    key,
    path: `flags.${MODULE_ID}.poolLabels.${key}`,
    value: custom[key] ?? "",
    placeholder: L(capitalize(key)),
    label: custom[key] || L(capitalize(key))
  }]));
}

/**
 * Swap the system's pool words for the actor's custom names in the text nodes under `root`.
 * Item descriptions are skipped so quoted rules text keeps its wording. False when there are
 * no custom names.
 */
export function applyPoolNames(root, actor, {skip = ".chat-card-item-description"} = {}) {
  const custom = actor?.getFlag(MODULE_ID, "poolLabels") ?? {};
  const pairs = STAT_POOLS
    .filter(key => custom[key])
    .map(key => [new RegExp(`\\b${RegExp.escape?.(L(capitalize(key))) ?? L(capitalize(key))}\\b`, "g"), custom[key]]);
  if (!pairs.length || !root) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (skip && node.parentElement?.closest(skip)) continue;
    nodes.push(node);
  }
  for (const node of nodes) {
    let text = node.nodeValue;
    for (const [pattern, name] of pairs) text = text.replace(pattern, name);
    if (text !== node.nodeValue) node.nodeValue = text;
  }
  return true;
}

export function pools(actor) {
  const teen = isTeen(actor);
  const base = poolBase(actor);
  const state = actorState(actor);
  const statRolls = (systemSetting("rollButtons") ?? 1) >= 1;
  const names = poolNames(actor);
  const list = STAT_POOLS.map(key => {
    const p = get(actor, `${base}.${key}`);
    return {
      key,
      label: names[key].label,
      value: p.value,
      max: p.max,
      edge: p.edge,
      valuePath: `${base}.${key}.value`,
      maxPath: `${base}.${key}.max`,
      edgePath: `${base}.${key}.edge`,
      hasEdge: true,
      edgeChanged: !teen && state.multiRollEdge[key],
      rollable: statRolls
    };
  });

  const general = teen ? actor.system.teen.settings.general : actor.system.settings.general;
  if (general.additionalPool.active) {
    const p = get(actor, `${base}.additional`);
    list.push({
      key: "additional",
      label: (teen ? general.additionalPool.name : general.additionalPool.label) || L("AdditionalPool"),
      value: p.value,
      max: p.max,
      edge: p.edge,
      valuePath: `${base}.additional.value`,
      maxPath: `${base}.additional.max`,
      edgePath: `${base}.additional.edge`,
      hasEdge: !teen && general.additionalPool.hasEdge,
      rollable: false,
      additional: true
    });
  }
  return list;
}

export async function adjustPool(actor, key, direction) {
  const path = `${poolBase(actor)}.${key}.value`;
  const amount = (alt() ? 10 : 1) * direction;
  return actor.update({[path]: get(actor, path) + amount});
}

/** Reset to max minus unarchived lasting damage on that pool (pc-sheet.js reset-might etc.). */
export async function resetPool(actor, key) {
  const base = poolBase(actor);
  const max = get(actor, `${base}.${key}.max`);
  if (key === "additional") return actor.update({[`${base}.additional.value`]: max});
  const teen = isTeen(actor);
  const poolName = capitalize(key);
  let lasting = 0;
  for (const item of actor.items) {
    if (item.type !== "lasting-damage" || item.system.archived) continue;
    if (item.system.basic.pool !== poolName) continue;
    if (teen && item.system.settings.general.unmaskedForm !== "Teen") continue;
    lasting += item.system.basic.damage;
  }
  return actor.update({[`${base}.${key}.value`]: max - lasting});
}

/** Separator between pool value and max (world setting "useSlashForFractions"). */
export function poolSeparator() {
  return systemSetting("useSlashForFractions") ? "/" : "|";
}

export function rollStat(actor, key) {
  return callApi("rollEngineMain", {actorUuid: actor.uuid, pool: capitalize(key)});
}

export function rollDice(actor, dice) {
  return callApi("diceRollMacro", dice, actor);
}

export function diceTrayEnabled() {
  return (systemSetting("diceTray") ?? 0) !== 0;
}

export function endMultiRoll(actor) {
  return sys.disableMultiRoll(actor);
}

/* Damage track, stress, armor */

export function damageTrack(actor) {
  const teen = isTeen(actor);
  const extraStep = actor.system.settings.combat.additionalStepDamageTrack;
  const choices = {Hale: L("Hale")};
  if (!teen && extraStep.active) choices.Hurt = extraStep.label || L("Hurt");
  choices.Impaired = L("Impaired");
  choices.Debilitated = L("Debilitated");

  const state = teen ? actor.system.teen.combat.damageTrack.state : actor.system.combat.damageTrack.state;
  const effects = {
    Hale: ["HaleEffect"],
    Hurt: ["HaleEffect"],
    Impaired: ["ImpairedEffect1", "ImpairedEffect2"],
    Debilitated: ["DebilitatedEffect1", "DebilitatedEffect2"],
    Dead: teen ? [] : ["DeadEffect"]
  };

  // The system reads teen apply flags from system.teen.combat.damage.* (sic); mirror it.
  const applySource = teen ? actor.system.teen.combat.damage ?? {} : actor.system.combat.damageTrack;
  let apply = null;
  if (state === "Impaired" || state === "Debilitated") {
    apply = {kind: state === "Impaired" ? "impaired" : "debilitated", on: !!applySource[`apply${state}`]};
  }
  return {
    path: teen ? "system.teen.combat.damageTrack.state" : "system.combat.damageTrack.state",
    state,
    choices,
    effects: (effects[state] ?? []).map(L),
    apply
  };
}

export async function toggleDamageApply(actor, kind) {
  const key = kind === "impaired" ? "applyImpaired" : "applyDebilitated";
  const path = isTeen(actor) ? `system.teen.combat.damage.${key}` : `system.combat.damageTrack.${key}`;
  return actor.update({[path]: !get(actor, path)});
}

export function stress(actor) {
  const cfg = actor.system.settings.combat.stress;
  if (isTeen(actor) || !cfg.active) return null;
  const s = actor.system.combat.stress;
  return {
    label: cfg.label || L("Stress"),
    quantity: s.quantity,
    levels: s.levels,
    supernatural: cfg.supernaturalStressActive
      ? {label: cfg.supernaturalStressLabel || L("SupernaturalStress"), levels: s.supernaturalLevels}
      : null
  };
}

export async function adjustStress(actor, field, direction) {
  const s = actor.system.combat.stress;
  const current = {quantity: s.quantity, levels: s.levels, supernatural: s.supernaturalLevels}[field];
  const step = field === "quantity" && alt() ? 3 : 1;
  const value = Math.max(current + step * direction, 0);
  const path = field === "supernatural" ? "system.combat.stress.supernaturalLevels" : `system.combat.stress.${field}`;
  return actor.update({[path]: value});
}

export async function resetStress(actor) {
  return actor.update({"system.combat.stress.quantity": 0, "system.combat.stress.levels": 0});
}

export function armorTotals(actor) {
  if (!actor.system.settings.combat.armor.active) return null;
  const teen = isTeen(actor);
  // Teen totals use different field names (actor.js _preparePCData).
  const a = teen ? actor.system.teen.combat.armor : actor.system.combat.armor;
  const rating = teen ? a.armorValueTotal : a.ratingTotal;
  const cost = teen ? a.speedCostTotal : a.costTotal;
  // The system totals unarchived armor in the current form.
  const pieces = actor.items
    .filter(i => i.type === "armor" && !i.system.archived && inCurrentForm(i, teen))
    .sort((x, y) => x.name.localeCompare(y.name))
    .map(i => ({id: i.id, name: i.name, rating: i.system.basic.rating, cost: i.system.basic.cost, worn: i.system.active === true}));
  return {rating: rating ?? 0, cost: cost ?? 0, img: armorImage(actor).value || ARMOR_IMAGE, pieces};
}

/* Recovery rolls */

const RECOVERY_GROUPS = {
  action: {system: "RecoveryAction", chat: "RecoveryOneAction", icon: "fa-solid fa-bolt"},
  tenMinutes: {system: "RecoveryMinutes", chat: "RecoveryTenMinutes", icon: "fa-solid fa-hourglass-start"},
  oneHour: {system: "RecoveryHour", chat: "RecoveryOneHour", icon: "fa-solid fa-hourglass-half"},
  tenHours: {system: "RecoveryHours", chat: "RecoveryTenHours", icon: "fa-solid fa-bed"}
};

export function recoveryLabels(actor) {
  const custom = actor.getFlag(MODULE_ID, "recoveryLabels") ?? {};
  return Object.fromEntries(Object.entries(RECOVERY_GROUPS).map(([group, g]) => [group, {
    group,
    path: `flags.${MODULE_ID}.recoveryLabels.${group}`,
    value: custom[group] ?? "",
    placeholder: L(g.system),
    label: custom[group] || L(g.system)
  }]));
}

/** Slots in the system's order (actor-utilities.js useRecoveries). */
export function recoverySlots(actor) {
  const rec = actor.system.combat.recoveries;
  const settings = actor.system.settings.combat;
  const labels = recoveryLabels(actor);
  const keys = [];
  const nAction = count(settings.numberOneActionRecoveries, 1, 1, 7);
  for (let i = 1; i <= nAction; i++) keys.push([i === 1 ? "oneAction" : `oneAction${i}`, "action"]);
  const nTen = count(settings.numberTenMinuteRecoveries, 1, 0, 2);
  for (let i = 1; i <= nTen; i++) keys.push([i === 1 ? "tenMinutes" : `tenMinutes${i}`, "tenMinutes"]);
  keys.push(["oneHour", "oneHour"], ["tenHours", "tenHours"]);

  let nextFound = false;
  return keys.map(([key, group]) => {
    const spent = !!rec[key];
    const next = !spent && !nextFound;
    if (next) nextFound = true;
    return {key, group, spent, next, label: labels[group].label, icon: RECOVERY_GROUPS[group].icon};
  });
}

export function recoveryFormula(actor) {
  return {path: "system.combat.recoveries.roll", value: actor.system.combat.recoveries.roll};
}

/**
 * Spend the clicked slot (any order) and post the roll. The chat card copies the system's
 * (macros.js recoveryRollMacro): same text, reroll button and flags, naming the custom timing
 * label when set. Alt rolls without spending, as the system macro does.
 */
export async function rollRecovery(actor, key) {
  const slot = recoverySlots(actor).find(s => s.key === key);
  if (!slot) return;
  const spend = !alt();
  if (spend) await actor.update({[`system.combat.recoveries.${key}`]: true});

  const dice = actor.system.combat.recoveries.roll;
  const custom = actor.getFlag(MODULE_ID, "recoveryLabels")?.[slot.group];
  const recoveryUsed = spend ? (custom || L(RECOVERY_GROUPS[slot.group].chat)) : "";
  const roll = await new Roll(dice).evaluate();
  const reRollButton = `<div style="text-align: right"><a class="reroll-recovery" data-dice="${dice}" data-user="${game.user.id}" data-actor-uuid="${actor.uuid}"><i class="fa-item fas fa-dice-d20"></i></a></div>`;
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({actor}),
    flavor: game.i18n.format("CYPHERSYSTEM.UseARecoveryRoll", {name: actor.name, recoveryUsed}) + reRollButton,
    flags: {itemID: "recovery-roll"}
  });
}

export async function unspendRecovery(actor, key) {
  if (!(key in actor.system.combat.recoveries)) return;
  return actor.update({[`system.combat.recoveries.${key}`]: false});
}

export async function resetRecoveries(actor) {
  const keys = ["oneAction", "oneAction2", "oneAction3", "oneAction4", "oneAction5", "oneAction6", "oneAction7",
    "tenMinutes", "tenMinutes2", "oneHour", "tenHours"];
  return actor.update(Object.fromEntries(keys.map(k => [`system.combat.recoveries.${k}`, false])));
}

/* Currency */

export function currency(actor) {
  const c = actor.system.settings.equipment.currency;
  if (!c.active) return null;
  const n = count(c.numberCategories, 1, 1, 6);
  const fields = [];
  for (let i = 1; i <= n; i++) {
    fields.push({
      path: `system.settings.equipment.currency.quantity${i}`,
      value: c[`quantity${i}`],
      label: c.hideLabels ? "" : (c[`labelCategory${i}`] || (n === 1 ? L("Currency") : `${L("Currency")} ${i}`))
    });
  }
  return {fields};
}

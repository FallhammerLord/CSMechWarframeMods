/**
 * Cypher System adapter.
 *
 * The only file (together with system-imports.js) that knows the shape of Cypher System data
 * or calls into the system. The sheet, grid, and popover talk to these functions only, so a
 * system update that moves a data path is fixed here and nowhere else.
 *
 * Baseline: cyphersystem v3.5.2. Behaviour ported from the system's default PC sheet is noted
 * with the source file it mirrors.
 */

import {MODULE_ID, SYSTEM_ID, t} from "../constants.js";
import * as sys from "./system-imports.js";

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

const L = key => game.i18n.localize(`CYPHERSYSTEM.${key}`);
const get = foundry.utils.getProperty;
const alt = () => game.keyboard.isModifierActive("Alt");
const capitalize = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/** Read a Cypher System world setting without throwing if it was renamed. */
export function systemSetting(key) {
  try {
    return game.settings.get(SYSTEM_ID, key);
  } catch {
    return undefined;
  }
}

/** Call a function on `game.cyphersystem`, failing loudly if the system API moved. */
function callApi(name, ...args) {
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

function poolBase(actor) {
  return isTeen(actor) ? "system.teen.pools" : "system.pools";
}

/* -------------------------------------------- */
/*  Actor state                                 */
/* -------------------------------------------- */

/** Multi-roll, static-stat lock, and exclusive-tag state (pc-sheet.js getData). */
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
    exclusiveTag: exclusive?.name ?? ""
  };
}

/** Header fields. Paths switch with the Mask/Teen form, as pc-base-info.html does. */
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

/* -------------------------------------------- */
/*  Pools                                       */
/* -------------------------------------------- */

const STAT_POOLS = ["might", "speed", "intellect"];

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

/* -------------------------------------------- */
/*  Damage track, stress, armor                 */
/* -------------------------------------------- */

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

  // The system reads teen apply flags from system.teen.combat.damage.* (sic); mirror it exactly.
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
  // The system stores teen totals under different names (actor.js _preparePCData).
  const a = teen ? actor.system.teen.combat.armor : actor.system.combat.armor;
  const rating = teen ? a.armorValueTotal : a.ratingTotal;
  const cost = teen ? a.speedCostTotal : a.costTotal;
  // Only unarchived armor items in the current form count toward the system's total.
  const pieces = actor.items
    .filter(i => i.type === "armor" && !i.system.archived && inCurrentForm(i, teen))
    .sort((x, y) => x.name.localeCompare(y.name))
    .map(i => ({id: i.id, name: i.name, rating: i.system.basic.rating, cost: i.system.basic.cost, worn: i.system.active === true}));
  return {rating: rating ?? 0, cost: cost ?? 0, img: armorImage(actor).value || ARMOR_IMAGE, pieces};
}

const ARMOR_IMAGE = "systems/cyphersystem/icons/items/armor.svg";

/** Armor tile image (module flag), set in the settings tab. */
export function armorImage(actor) {
  const value = actor.getFlag(MODULE_ID, "armorImage");
  // Ignore junk values ("undefined", "null") an earlier build could have saved.
  const clean = typeof value === "string" && !["undefined", "null"].includes(value) ? value : "";
  return {path: `flags.${MODULE_ID}.armorImage`, value: clean, placeholder: ARMOR_IMAGE};
}

/** Square (default) or double-tall portrait box (module flag). */
export function portraitTall(actor) {
  return {path: `flags.${MODULE_ID}.portraitTall`, value: !!actor.getFlag(MODULE_ID, "portraitTall")};
}

/** Badge: the low-opacity image in the lower-right corner, using the system's own actor fields. */
export function badge(actor) {
  const teen = isTeen(actor);
  const base = teen ? "system.teen.settings.general.background" : "system.settings.general.background";
  const bg = get(actor, base) ?? {};
  let src = null;
  if (bg.icon === "custom") src = bg.iconPath || null;
  else if (bg.icon && bg.icon !== "none") src = `${BG_ROOT}/icon-${bg.icon}.svg`;
  return {
    base,
    icon: bg.icon ?? "none",
    iconPath: bg.iconPath ?? "",
    opacity: Number(bg.iconOpacity ?? 0.5),
    src
  };
}

/* -------------------------------------------- */
/*  Recovery rolls                              */
/* -------------------------------------------- */

const RECOVERY_GROUPS = {
  action: {system: "RecoveryAction", icon: "fa-solid fa-bolt"},
  tenMinutes: {system: "RecoveryMinutes", icon: "fa-solid fa-hourglass-start"},
  oneHour: {system: "RecoveryHour", icon: "fa-solid fa-hourglass-half"},
  tenHours: {system: "RecoveryHours", icon: "fa-solid fa-bed"}
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

function count(value, fallback, min, max) {
  const n = Number(value);
  return Math.clamp(Number.isFinite(n) ? n : fallback, min, max);
}

/** Slots in the order `useRecoveries` spends them (actor-utilities.js). */
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

/** Roll using the system macro unchanged; it spends the next free slot (Alt skips spending). */
/** The system's chat wording for each timing (actor-utilities.js useRecoveries). */
const RECOVERY_CHAT_KEYS = {action: "RecoveryOneAction", tenMinutes: "RecoveryTenMinutes", oneHour: "RecoveryOneHour", tenHours: "RecoveryTenHours"};

/**
 * Roll a recovery for the clicked slot, in any order: that slot is marked spent and the roll is
 * posted. No timing order is enforced.
 *
 * The chat card copies the system's recovery card exactly (macros.js recoveryRollMacro): same
 * "Is using a … recovery roll" text, same reroll button (handled by the system's chat hook), same
 * flags. The timing named is this sheet's custom label when set, else the system's wording.
 * Alt rolls without spending, as the system macro does.
 */
export async function rollRecovery(actor, key) {
  const slot = recoverySlots(actor).find(s => s.key === key);
  if (!slot) return;
  const spend = !alt();
  if (spend) await actor.update({[`system.combat.recoveries.${key}`]: true});

  const dice = actor.system.combat.recoveries.roll;
  const custom = actor.getFlag(MODULE_ID, "recoveryLabels")?.[slot.group];
  const recoveryUsed = spend ? (custom || L(RECOVERY_CHAT_KEYS[slot.group])) : "";
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

/* -------------------------------------------- */
/*  Movement per action (module flag)           */
/* -------------------------------------------- */

/** Per-actor ruler range bands. Empty fields keep the system's distances. */
export const MOVEMENT_BANDS = [
  {key: "immediate", label: "Immediate", ft: 10, m: 3},
  {key: "short", label: "Short", ft: 50, m: 15},
  {key: "long", label: "Long", ft: 100, m: 30},
  {key: "veryLong", label: "VeryLong", ft: 500, m: 150}
];

export function movementRanges(actor) {
  const saved = actor.getFlag(MODULE_ID, "movementRanges") ?? {};
  return MOVEMENT_BANDS.map(band => ({
    key: band.key,
    path: `flags.${MODULE_ID}.movementRanges.${band.key}`,
    label: L(band.label),
    value: Number(saved[band.key]) > 0 ? Number(saved[band.key]) : "",
    placeholder: `${band.ft} ft / ${band.m} m`
  }));
}

/** Name of the card grid tab (module flag). */
export function cardsTab(actor) {
  const value = actor.getFlag(MODULE_ID, "cardsTabLabel") ?? "";
  return {path: `flags.${MODULE_ID}.cardsTabLabel`, value, placeholder: t("Tab.Cards"), label: value || t("Tab.Cards")};
}

/* -------------------------------------------- */
/*  Currency                                    */
/* -------------------------------------------- */

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

/* -------------------------------------------- */
/*  Items: classification                       */
/* -------------------------------------------- */

/** Types that render as cards, in display order. Tags and recursions render in the tag bar. */
export const CARD_TYPES = [
  "skill", "power-shift",
  "attack", "armor", "ammo", "lasting-damage",
  "ability",
  "equipment", "cypher", "artifact", "oddity", "material"
];

export const FAMILIES = ["skills", "combat", "abilities", "equipment"];

const TYPE_META = {
  "skill": {family: "skills", plural: "Skills", icon: "fa-solid fa-graduation-cap"},
  "power-shift": {family: "skills", plural: "PowerShifts", icon: "fa-solid fa-angles-up"},
  "attack": {family: "combat", plural: "Attacks", icon: "fa-solid fa-hand-fist"},
  "armor": {family: "combat", plural: "Armor", icon: "fa-solid fa-shield-halved"},
  "ammo": {family: "combat", plural: "Ammo", icon: "fa-solid fa-bullseye"},
  "lasting-damage": {family: "combat", plural: "LastingDamage", icon: "fa-solid fa-heart-crack"},
  "ability": {family: "abilities", plural: "Abilities", icon: "fa-solid fa-wand-magic-sparkles"},
  "equipment": {family: "equipment", plural: "Equipment", icon: "fa-solid fa-toolbox"},
  "cypher": {family: "equipment", plural: "Cyphers", icon: "fa-solid fa-microchip"},
  "artifact": {family: "equipment", plural: "Artifacts", icon: "fa-solid fa-gem"},
  "oddity": {family: "equipment", plural: "Oddities", icon: "fa-solid fa-circle-question"},
  "material": {family: "equipment", plural: "CraftingMaterial", icon: "fa-solid fa-cubes"}
};

/** Types whose items belong to either the Mask or the Teen form. */
const FORM_TYPES = new Set(["ability", "armor", "attack", "lasting-damage", "skill"]);

/** Types the default sheet gives a roll button (item-lists templates with `item-roll`). */
const ROLL_TYPES = new Set(["ability", "attack", "skill"]);

const TRAINING = ["Inability", "Practiced", "Trained", "Specialized"];

export function typeLabel(type, plural = false) {
  return plural ? L(TYPE_META[type]?.plural ?? capitalize(type)) : game.i18n.localize(`TYPES.Item.${type}`);
}

export function familyLabel(family) {
  return t(`Family.${family}`);
}

function inCurrentForm(item, teen) {
  if (!FORM_TYPES.has(item.type)) return true;
  const form = item.system.settings?.general?.unmaskedForm ?? "Mask";
  return teen ? form === "Teen" : form === "Mask";
}

/** Whether the item appears at all for this actor (form + archive visibility). */
export function isVisible(actor, item) {
  if (!CARD_TYPES.includes(item.type)) return false;
  if (!inCurrentForm(item, isTeen(actor))) return false;
  if (actor.system.settings.general.hideArchive && item.system.archived) return false;
  return true;
}

export function itemRollsEnabled() {
  return (systemSetting("rollButtons") ?? 1) === 1;
}

function isFormula(level) {
  return !!level && isNaN(level) && Roll.validate(String(level));
}

export function displayName(item) {
  const b = item.system.basic ?? {};
  if (!["cypher", "artifact"].includes(item.type) || b.identified !== false) return item.name;
  return item.system.settings?.general?.nameUnidentified
    || L(item.type === "cypher" ? "UnidentifiedCypher" : "UnidentifiedArtifact");
}

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
 * Replace the system's pool words (Might / Speed / Intellect) with the actor's custom names in
 * the text of a rendered element. Only text nodes change; item descriptions are skipped so rules
 * text quoting a pool keeps its wording. Returns false when the actor has no custom names.
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

function poolLabel(pool, actor) {
  if (["Might", "Speed", "Intellect"].includes(pool)) return poolNames(actor)[pool.toLowerCase()].label;
  if (pool === "XP") return L("XP");
  return L("AnyPool");
}

function isZeroCost(cost) {
  return cost === 0 || cost === "0" || cost === "" || cost == null;
}

/** Cypher type indicator (actor-sheet.js getData "Determine cypher type"). */
function cypherType(item) {
  const [kind, fantastic] = item.system.basic.type ?? [0, 0];
  const icon = kind === 1 ? "fa-solid fa-circle-half-stroke" : kind === 2 ? "fa-solid fa-circle" : "fa-regular fa-circle";
  const color = fantastic === 1 ? "rgb(146, 16, 18)" : kind === 1 ? "rgb(214, 118, 40)" : kind === 2 ? "rgb(44, 63, 101)" : "";
  const base = ["NoTypeCypher", "SubtleCypher", "ManifestCypher"][kind] ?? "NoTypeCypher";
  const title = fantastic === 1 ? base.replace("Cypher", "FantasticCypher") : base;
  return {icon, color, title: L(title)};
}

/** The per-type "key value" slot (spec §3). */
function keyValue(item, actor) {
  const b = item.system.basic ?? {};
  switch (item.type) {
    case "ability":
      return {value: isZeroCost(b.cost) ? "" : `${b.cost} ${poolLabel(b.pool, actor)}`};
    case "attack":
      return {value: t("Card.Damage", {n: b.damage}), detail: b.range || ""};
    case "armor":
      return {value: t("Card.Armor", {n: b.rating}), detail: b.cost ? t("Card.SpeedCost", {n: b.cost}) : ""};
    case "cypher":
    case "artifact":
      if (b.identified === false) return {value: "?"};
      return {value: b.level !== "" && b.level != null ? t("Card.Level", {n: b.level}) : ""};
    case "equipment":
    case "ammo":
      return {value: b.quantity != null ? `×${b.quantity}` : "", detail: b.level ? t("Card.Level", {n: b.level}) : ""};
    case "material": {
      const byLevel = actor.system.settings.equipment.materials.displayMode === "level";
      return {value: b.quantity != null ? `×${b.quantity}` : "", detail: byLevel && b.level ? t("Card.Level", {n: b.level}) : ""};
    }
    case "oddity":
      return {value: b.level ? t("Card.Level", {n: b.level}) : ""};
    case "power-shift":
      return {value: t("Card.Shifts", {n: b.shifts}), detail: b.temporary ? t("Card.Temporary") : ""};
    case "lasting-damage":
      return {value: `${b.damage} ${poolLabel(b.pool, actor)}`, detail: b.type === "Permanent" ? t("Card.Permanent") : ""};
    default:
      return {value: ""};
  }
}

function trainingOf(item) {
  let rating = null;
  if (item.type === "skill") rating = item.system.basic.rating;
  else if (item.type === "attack") rating = item.system.basic.skillRating;
  else if (item.type === "ability") {
    rating = item.system.settings?.rollButton?.skill;
    if (rating === "Practiced") rating = null;
  }
  if (!TRAINING.includes(rating)) return null;
  return {key: rating.toLowerCase(), label: L(rating)};
}

/** Everything the card template needs for one item. */
export function cardData(item, actor) {
  const b = item.system.basic ?? {};
  const meta = TYPE_META[item.type];
  const kv = keyValue(item, actor);
  const identified = b.identified !== false;
  return {
    id: item.id,
    type: item.type,
    family: meta.family,
    name: displayName(item),
    searchText: `${displayName(item)} ${typeLabel(item.type)}`.toLowerCase(),
    img: item.img,
    // SVG icons (the system's defaults) are line art: shown contained, not cropped full-bleed.
    imgIsIcon: /\.svg(?:$|\?)/i.test(item.img ?? ""),
    typeLabel: typeLabel(item.type),
    typeIcon: meta.icon,
    training: trainingOf(item),
    value: kv.value,
    // Secondary facts (range, speed cost, level) live in the popover, not on the card.
    detail: kv.detail ?? "",
    temporary: item.type === "power-shift" && !!b.temporary,
    permanent: item.type === "lasting-damage" && b.type === "Permanent",
    archived: !!item.system.archived,
    favorite: !!item.system.favorite && !actor.system.settings.general.hideFavoriteButton,
    inactive: item.type === "armor" && item.system.active === false,
    isArmor: item.type === "armor",
    worn: item.type === "armor" && item.system.active !== false,
    spell: item.type === "ability" && item.system.settings?.general?.sorting === "Spell",
    identified,
    cypherType: item.type === "cypher" && identified ? cypherType(item) : null,
    canRoll: itemRollsEnabled() && ROLL_TYPES.has(item.type)
  };
}

/* -------------------------------------------- */
/*  Items: sorting (ported from sorting.js)     */
/* -------------------------------------------- */

const RATING_ORDER = {Specialized: 1, Trained: 2, Practiced: 3, Inability: 4};
const CYPHER_TYPE_ORDER = {1: 1, 2: 2, 0: 3};
const PRICE_ORDER = {"inexpensive": 1, "moderate": 2, "expensive": 3, "very expensive": 4, "exorbitant": 5, "none": 6};

function cmp(a, b) {
  if (a === b || a === undefined || b === undefined) return 0;
  return a < b ? -1 : 1;
}

function compareLevel(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return cmp(na, nb);
  return cmp(String(a ?? ""), String(b ?? ""));
}

/**
 * The system sorts each list several times in sequence (name, optional rule, identified,
 * favorite, archived). A stable multi-key comparator with the last sort as the first key
 * gives the same order.
 */
export function sortItems(items, actor) {
  const s = actor.system.settings;
  const sortByRating = s.skills.sortByRating;
  const sortCyphersByType = s.equipment.cyphers.sortByType;
  const materials = s.equipment.materials;
  return items.sort((a, b) => {
    const archived = cmp(a.system.archived ? 1 : 0, b.system.archived ? 1 : 0);
    if (archived) return archived;
    const favorite = cmp(a.system.favorite ? 0 : 1, b.system.favorite ? 0 : 1);
    if (favorite) return favorite;
    const idA = a.system.basic?.identified;
    const idB = b.system.basic?.identified;
    if (typeof idA === "boolean" && typeof idB === "boolean") {
      const identified = cmp(idA ? 0 : 1, idB ? 0 : 1);
      if (identified) return identified;
    }
    if (a.type === b.type) {
      let rule = 0;
      if (a.type === "skill" && sortByRating) rule = cmp(RATING_ORDER[a.system.basic.rating], RATING_ORDER[b.system.basic.rating]);
      else if (a.type === "cypher" && sortCyphersByType) rule = cmp(CYPHER_TYPE_ORDER[a.system.basic.type?.[0]], CYPHER_TYPE_ORDER[b.system.basic.type?.[0]]);
      else if (a.type === "material" && materials.sortByLevel) {
        rule = materials.displayMode === "level"
          ? compareLevel(a.system.basic.level, b.system.basic.level)
          : cmp(PRICE_ORDER[a.system.price?.category], PRICE_ORDER[b.system.price?.category]);
      }
      if (rule) return rule;
    }
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/* -------------------------------------------- */
/*  Items: grouping                             */
/* -------------------------------------------- */

const NUMBERED = ["", "Two", "Three", "Four"];

/**
 * Category groups mirroring the default sheet's sections (pc-sheet.html + actor-sheet.js).
 * `sorting` is the value of `system.settings.general.sorting` the group holds, when the type
 * has categories. Secondary categories show when they have items or a label (unless
 * "hide empty categories" is on), as the default sheet does.
 */
function categoryDefinitions(actor) {
  const s = actor.system.settings;
  const teen = isTeen(actor);
  const defs = [];
  const numbered = (type, base, labels, placeholders, family) => {
    NUMBERED.forEach((suffix, i) => {
      defs.push({
        key: `${base}${suffix}`,
        family,
        types: [type],
        sorting: `${base}${suffix}`,
        label: labels[`labelCategory${i + 1}`] || L(placeholders[i]),
        primary: i === 0,
        hasLabel: !!labels[`labelCategory${i + 1}`]
      });
    });
  };
  const single = (key, type, family, label, extra = {}) => defs.push({key, family, types: [type], label, primary: true, ...extra});

  // Skills tab
  if (teen) single("teen-skill", "skill", "skills", L("Skills"));
  else {
    numbered("skill", "Skill", s.skills, ["Skills", "SkillCategoryTwo", "SkillCategoryThree", "SkillCategoryFour"], "skills");
    if (s.skills.powerShifts.active) single("power-shift", "power-shift", "skills", s.skills.powerShifts.label || L("PowerShifts"));
  }

  // Combat tab
  if (s.combat.lastingDamage.active) single("lasting-damage", "lasting-damage", "combat", L("LastingDamage"));
  single("attack", "attack", "combat", L("Attacks"));
  if (s.combat.ammo.active) single("ammo", "ammo", "combat", L("Ammo"));
  if (s.combat.armor.active) single("armor", "armor", "combat", L("Armor"));

  // Abilities tab
  if (teen) single("teen-ability", "ability", "abilities", L("Abilities"));
  else {
    numbered("ability", "Ability", s.abilities, ["Abilities", "AbilityCategoryTwo", "AbilityCategoryThree", "AbilityCategoryFour"], "abilities");
    defs.push({
      key: "Spell", family: "abilities", types: ["ability"], sorting: "Spell",
      label: s.abilities.labelSpells || L("Spells"), primary: false, hasLabel: !!s.abilities.labelSpells
    });
  }

  // Equipment tab
  numbered("equipment", "Equipment", s.equipment, ["Equipment", "EquipmentCategoryTwo", "EquipmentCategoryThree", "EquipmentCategoryFour"], "equipment");
  const eq = s.equipment;
  if (eq.cyphers.active) single("cypher", "cypher", "equipment", eq.cyphers.label || L("Cyphers"), {cypherLimit: true});
  if (eq.artifacts.active) single("artifact", "artifact", "equipment", eq.artifacts.label || L("Artifacts"));
  if (eq.oddities.active) single("oddity", "oddity", "equipment", eq.oddities.label || L("Oddities"));
  if (eq.materials.active) single("material", "material", "equipment", eq.materials.label || L("CraftingMaterial"));
  return defs;
}

function finishGroup(def, items, actor) {
  const sorted = sortItems(items, actor);
  return {
    ...def,
    items: sorted.map(i => cardData(i, actor)),
    count: sorted.length,
    createTypes: (def.types ?? CARD_TYPES).join(","),
    createSorting: def.sorting ?? "",
    cypherLimit: def.cypherLimit
      ? {path: "system.equipment.cypherLimit", value: actor.system.equipment.cypherLimit}
      : null
  };
}

function groupByCategory(actor, visible) {
  const defs = categoryDefinitions(actor);
  const hideEmpty = actor.system.settings.general.hideEmptyCategories;
  const buckets = new Map(defs.map(d => [d.key, []]));
  const primaryFor = type => defs.find(d => d.types.includes(type) && d.primary);

  for (const item of visible) {
    const sorting = item.system.settings?.general?.sorting;
    let def = defs.find(d => d.types.includes(item.type) && d.sorting && d.sorting === sorting);
    // Unknown or missing category: fall back to the type's primary list so nothing is lost.
    def ??= primaryFor(item.type);
    if (def) buckets.get(def.key).push(item);
  }

  return defs
    .filter(d => d.primary || buckets.get(d.key).length || (d.hasLabel && !hideEmpty))
    .map(d => finishGroup(d, buckets.get(d.key), actor));
}

function groupByType(actor, visible) {
  return CARD_TYPES
    .map(type => ({type, items: visible.filter(i => i.type === type)}))
    .filter(g => g.items.length)
    .map(g => finishGroup({
      key: g.type, family: TYPE_META[g.type].family, types: [g.type], label: typeLabel(g.type, true), primary: true
    }, g.items, actor));
}

function groupByTag(actor, visible) {
  const tagItems = actor.items.filter(i => ["tag", "recursion"].includes(i.type));
  const groups = [];
  const tagged = new Set();
  for (const tag of sortItems([...tagItems], actor)) {
    const members = visible.filter(i => {
      const ids = [...(i.flags?.cyphersystem?.tags ?? []), ...(i.flags?.cyphersystem?.recursions ?? [])];
      return ids.includes(tag.id);
    });
    if (!members.length) continue;
    members.forEach(m => tagged.add(m.id));
    groups.push(finishGroup({
      key: `tag-${tag.id}`, family: null, label: `${tag.type === "recursion" ? "@" : "#"}${tag.name}`,
      primary: true, active: !!tag.system.active
    }, members, actor));
  }
  const untagged = visible.filter(i => !tagged.has(i.id));
  if (untagged.length) groups.push(finishGroup({key: "untagged", family: null, label: t("Grid.Untagged"), primary: true}, untagged, actor));
  return groups;
}

export const GROUP_MODES = ["category", "type", "tag"];

/** Build the grid's groups. Grouping never writes data. */
export function buildGroups(actor, mode) {
  const visible = actor.items.filter(i => isVisible(actor, i));
  if (mode === "type") return groupByType(actor, visible);
  if (mode === "tag") return groupByTag(actor, visible);
  return groupByCategory(actor, visible);
}

/* -------------------------------------------- */
/*  Tags and recursions                         */
/* -------------------------------------------- */

export function tagBar(actor) {
  const s = actor.system.settings.general;
  const teen = isTeen(actor);
  const hideArchive = s.hideArchive;
  const chip = item => ({
    id: item.id,
    name: item.name,
    type: item.type,
    active: !!item.system.active,
    exclusive: !!item.system.exclusive,
    archived: !!item.system.archived
  });
  const visible = item => !(hideArchive && item.system.archived);

  const result = {show: false, categories: [], recursions: null};
  if (s.gameMode === "Strange") {
    result.recursions = {
      label: L("Recursions"),
      chips: sortItems(actor.items.filter(i => i.type === "recursion" && visible(i)), actor).map(chip)
    };
    result.show = true;
  }
  if (s.tags.active && !teen) {
    const placeholders = ["Tags", "TagCategoryTwo", "TagCategoryThree", "TagCategoryFour"];
    NUMBERED.forEach((suffix, i) => {
      const sorting = `Tag${suffix}`;
      const tags = actor.items.filter(it => it.type === "tag" && visible(it) && (it.system.settings.general.sorting || "Tag") === sorting);
      const label = s.tags[`labelCategory${i + 1}`];
      if (i > 0 && !tags.length && !(label && !s.hideEmptyCategories)) return;
      result.categories.push({sorting, label: label || L(placeholders[i]), chips: sortItems(tags, actor).map(chip)});
    });
    result.show = true;
  }
  return result;
}

/** Activate or deactivate through the system's tagging engine, unchanged. */
export function toggleTag(actor, item) {
  return callApi(item.type === "recursion" ? "recursionMacro" : "tagMacro", actor, item);
}

/* -------------------------------------------- */
/*  Item actions                                */
/* -------------------------------------------- */

/** d20: the exact call the default sheet makes (actor-sheet.js `.item-roll`), else chat. */
export function rollItem(actor, item) {
  if (!itemRollsEnabled() || !ROLL_TYPES.has(item.type)) return sendToChat(actor, item);
  const macroUuid = item.system.settings.rollButton.macroUuid;
  return callApi("itemRollMacro", actor, item.id, "", "", "", "", "", "", "", "", "", "", "", "", false, "", macroUuid, "");
}

/** Pay pool points / AiO without roll (actor-sheet.js `.item-pay`). */
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

/** Delete, including the tag cleanup the default sheet performs (actor-sheet.js `.item-delete`). */
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

/** Click cycles type; Alt toggles fantastic (actor-sheet.js `.toggle-cypher-type`). */
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

/** Contextual controls for the popover's action bar (spec §5). */
export function itemControls(actor, item) {
  const b = item.system.basic ?? {};
  const gm = game.user.isGM;
  const identified = b.identified !== false;
  const c = [];
  // `label` is the short visible text; `title` is the system's longer tooltip where one exists.
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

/** Facts row and description for the popover. */
export async function itemDetail(actor, item) {
  const card = cardData(item, actor);
  const b = item.system.basic ?? {};
  const facts = [];
  if (card.training) facts.push(card.training.label);
  if (card.value) facts.push(card.value);
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
  return {card, facts, description, controls: itemControls(actor, item)};
}

/* -------------------------------------------- */
/*  Creation and drops                          */
/* -------------------------------------------- */

/** Core's creation dialog, pre-filtered to the group's types (spec §6). */
export async function createItem(actor, {types, sorting} = {}) {
  const data = {};
  if (sorting) foundry.utils.setProperty(data, "system.settings.general.sorting", sorting);
  const cls = getDocumentClass("Item");
  const allowed = (types?.length ? types : CARD_TYPES).filter(type => cls.TYPES?.includes(type) ?? true);
  // V13+: operation options second, dialog options third. `types` is passed to both so either
  // placement of the type filter is honoured.
  return cls.createDialog(data, {parent: actor, types: allowed, renderSheet: true}, {types: allowed});
}

/**
 * Delegate item drops to the system's own handler so its rules (move/archive dialogs,
 * quantity splitting, list activation, identification, category sorting) stay intact.
 */
export async function dropItem(actor, event, data) {
  const handler = game.cyphersystem?.CypherActorSheet?.prototype?._onDropItem;
  if (typeof handler !== "function") {
    ui.notifications.error(t("Error.MissingApi", {name: "CypherActorSheet._onDropItem"}));
    return;
  }
  return handler.call({actor}, event, data);
}

/* -------------------------------------------- */
/*  Sheet design (actor-sheet.js customBackgroundData)
/* -------------------------------------------- */

const BG_ROOT = "systems/cyphersystem/icons/background";
const BACKGROUNDS = {
  "cypher-blue": "linear-gradient(rgb(203, 203, 218), white)",
  "plain metal": `center / cover url("${BG_ROOT}/background-metal.webp")`,
  "paper": `center / cover url("${BG_ROOT}/background-paper.webp")`,
  "plain pride": `center / cover url("${BG_ROOT}/background-pride.webp")`,
  "plain blue": "rgb(0, 77, 129)",
  "plain green": "rgb(20, 104, 66)",
  "plain grey": "rgb(128, 128, 128)",
  "plain purple": "rgb(154, 24, 96)",
  "plain red": "rgb(153, 0, 0)",
  "plain yellow": "rgb(247, 186, 0)"
};

function worldDesign() {
  const w = key => systemSetting(`sheetCustomization${key}`);
  return {
    background: {image: w("BackgroundImage"), imagePath: w("BackgroundImagePath"), overlayOpacity: w("BackgroundImageOverlayOpacity"),
      icon: w("BackgroundIcon"), iconPath: w("BackgroundIconPath"), iconOpacity: w("BackgroundIconOpacity")},
    logo: {image: w("LogoImage"), imagePath: w("LogoImagePath"), imageOpacity: w("LogoImageOpacity")}
  };
}

/**
 * Background, icon, and logo.
 *
 * Backgrounds and icons come only from the actor's own "Custom Sheet Design". The world-level
 * design (default "cypher-blue", a light gradient) was made for the system's light sheet and
 * showed through this sheet's themed panels, so it is not used here. The logo still follows
 * the world setting when the actor has no custom design.
 */
export function sheetDesign(actor) {
  const teen = isTeen(actor);
  const s = actor.system;
  let custom = null;
  if (teen && s.teen.settings.general.customSheetDesign) custom = s.teen.settings.general;
  else if (!teen && s.settings.general.customSheetDesign) custom = s.settings.general;

  const bg = custom?.background ?? {};
  const logo = (custom ?? worldDesign()).logo ?? {};
  const design = {background: "", scrim: 0, icon: null, logo: null};

  if (!game.modules.get("cyphersheets")?.active) {
    // The scrim is the theme's background colour laid over the image. A floor of 0.6 keeps
    // text that sits directly on the background (toolbar, group titles) readable.
    if (bg.image === "custom" && bg.imagePath) {
      design.background = `center / cover url("${bg.imagePath}")`;
      design.scrim = Math.max(Number(bg.overlayOpacity ?? 0.75), 0.6);
    } else if (BACKGROUNDS[bg.image]) {
      design.background = BACKGROUNDS[bg.image];
      design.scrim = 0.75;
    }
    // The badge (lower-right icon) is set in its own settings panel, independent of custom design.
    const b = badge(actor);
    if (b.src) design.icon = {src: b.src, opacity: b.opacity};
  }

  if (logo.image === "custom" && logo.imagePath) design.logo = {src: logo.imagePath, opacity: Number(logo.imageOpacity ?? 1), variant: "custom"};
  else if (logo.image && !["none", "custom"].includes(logo.image)) {
    design.logo = {
      src: `${BG_ROOT}/compatible-cypher-system-${logo.image}.webp`,
      opacity: Number(logo.imageOpacity ?? 1),
      variant: logo.image
    };
  }
  return design;
}

/* -------------------------------------------- */
/*  Settings tab                                */
/* -------------------------------------------- */

/** Select choices for the settings tab (pc-sheet.js / actor-sheet.js getData). */
export function settingsChoices() {
  const range = (from, to) => Object.fromEntries(Array.from({length: to - from + 1}, (_, i) => [from + i, from + i]));
  return {
    gameMode: {Cypher: L("Cypher"), Unmasked: L("Unmasked"), Strange: L("Strange")},
    unmaskedForm: {Mask: L("Mask"), Teen: L("Teen")},
    showPrice: {none: L("None"), category: L("pricecategory"), priceTag: L("pricetag"), both: L("PriceBoth")},
    materialsDisplayMode: {price: L("Price"), level: L("Level")},
    currency: range(1, 6),
    oneActionRecoveries: range(1, 7),
    tenMinuteRecoveries: range(0, 2),
    backgroundImage: {
      "foundry": L("BGImageFoundry"), "cypher-blue": L("BGImageCypherBlue"), "plain metal": L("BGImageMetal"),
      "paper": L("BGImagePaper"), "plain pride": L("BGImagePride"), "plain blue": L("BGImagePlainBlue"),
      "plain green": L("BGImagePlainGreen"), "plain grey": L("BGImagePlainGrey"), "plain purple": L("BGImagePlainPurple"),
      "plain red": L("BGImagePlainRed"), "plain yellow": L("BGImagePlainYellow"), "custom": L("BGImageCustom")
    },
    backgroundIcon: Object.fromEntries(["none", "bat", "bat-mask", "battered-axe", "battle-gear", "bear", "bow-arrow",
      "circuitry", "csrd-logo", "holy-symbol", "hood", "orb-wand", "wizard-staff", "wolf", "custom"].map(k => [k,
      L(`BGIcon${k === "csrd-logo" ? "CypherLogo" : k.split("-").map(capitalize).join("")}`)])),
    logoImage: {none: L("CSLogoNone"), black: L("CSLogoBlack"), white: L("CSLogoWhite"), color: L("CSLogoColor"), custom: L("CSLogoCustom")}
  };
}

export function cyphersheetsActive() {
  return !!game.modules.get("cyphersheets")?.active;
}

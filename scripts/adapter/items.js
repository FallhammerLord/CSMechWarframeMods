/** Items as cards: classification, card data, sorting, grouping, and the tag bar. */

import {t} from "../constants.js";
import {L, callApi, capitalize, isTeen, systemSetting} from "./shared.js";
import {poolNames} from "./actor.js";

/** Types shown as cards, in display order. Tags and recursions show in the tag bar. */
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

/** Types the default sheet gives a roll button. */
export const ROLL_TYPES = new Set(["ability", "attack", "skill"]);

const TRAINING = ["Inability", "Practiced", "Trained", "Specialized"];

export function typeLabel(type, plural = false) {
  return plural ? L(TYPE_META[type]?.plural ?? capitalize(type)) : game.i18n.localize(`TYPES.Item.${type}`);
}

export function familyLabel(family) {
  return t(`Family.${family}`);
}

export function inCurrentForm(item, teen) {
  if (!FORM_TYPES.has(item.type)) return true;
  const form = item.system.settings?.general?.unmaskedForm ?? "Mask";
  return teen ? form === "Teen" : form === "Mask";
}

/** Whether the item shows for this actor (form and archive visibility). */
export function isVisible(actor, item) {
  if (!CARD_TYPES.includes(item.type)) return false;
  if (!inCurrentForm(item, isTeen(actor))) return false;
  if (actor.system.settings.general.hideArchive && item.system.archived) return false;
  return true;
}

export function itemRollsEnabled() {
  return (systemSetting("rollButtons") ?? 1) === 1;
}

export function isFormula(level) {
  return !!level && isNaN(level) && Roll.validate(String(level));
}

export function isZeroCost(cost) {
  return cost === 0 || cost === "0" || cost === "" || cost == null;
}

export function displayName(item) {
  const b = item.system.basic ?? {};
  if (!["cypher", "artifact"].includes(item.type) || b.identified !== false) return item.name;
  return item.system.settings?.general?.nameUnidentified
    || L(item.type === "cypher" ? "UnidentifiedCypher" : "UnidentifiedArtifact");
}

function poolLabel(pool, actor) {
  if (["Might", "Speed", "Intellect"].includes(pool)) return poolNames(actor)[pool.toLowerCase()].label;
  if (pool === "XP") return L("XP");
  return L("AnyPool");
}

/** Cypher type indicator (actor-sheet.js getData "Determine cypher type"). */
export function cypherType(item) {
  const [kind, fantastic] = item.system.basic.type ?? [0, 0];
  const icon = kind === 1 ? "fa-solid fa-circle-half-stroke" : kind === 2 ? "fa-solid fa-circle" : "fa-regular fa-circle";
  const color = fantastic === 1 ? "rgb(146, 16, 18)" : kind === 1 ? "rgb(214, 118, 40)" : kind === 2 ? "rgb(44, 63, 101)" : "";
  const base = ["NoTypeCypher", "SubtleCypher", "ManifestCypher"][kind] ?? "NoTypeCypher";
  const title = fantastic === 1 ? base.replace("Cypher", "FantasticCypher") : base;
  return {icon, color, title: L(title)};
}

/** The card's number, plus secondary facts for the large card (spec §3). */
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

function ratingOf(item) {
  if (item.type === "skill") return item.system.basic.rating;
  if (item.type === "attack") return item.system.basic.skillRating;
  if (item.type === "ability") return item.system.settings?.rollButton?.skill;
  return null;
}

/** Frame (rarity) key: the training level, "none" when untrained. */
function frameKeyOf(item) {
  const rating = ratingOf(item);
  return TRAINING.includes(rating) ? rating.toLowerCase() : "none";
}

/** Training label. An ability's roll default of Practiced isn't shown as training. */
function trainingOf(item) {
  const rating = ratingOf(item);
  if (!TRAINING.includes(rating) || (item.type === "ability" && rating === "Practiced")) return null;
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
    imgIsIcon: /\.svg(?:$|\?)/i.test(item.img ?? ""),
    typeLabel: typeLabel(item.type),
    typeIcon: meta.icon,
    training: trainingOf(item),
    frameKey: frameKeyOf(item),
    value: kv.value,
    detail: kv.detail ?? "",
    temporary: item.type === "power-shift" && !!b.temporary,
    permanent: item.type === "lasting-damage" && b.type === "Permanent",
    archived: !!item.system.archived,
    favorite: !!item.system.favorite && !actor.system.settings.general.hideFavoriteButton,
    inactive: item.type === "armor" && item.system.active === false,
    depletion: item.type === "artifact" && identified && b.depletion ? String(b.depletion) : "",
    isArmor: item.type === "armor",
    isAmmo: item.type === "ammo",
    worn: item.type === "armor" && item.system.active !== false,
    spell: item.type === "ability" && item.system.settings?.general?.sorting === "Spell",
    identified,
    cypherType: item.type === "cypher" && identified ? cypherType(item) : null,
    canRoll: itemRollsEnabled() && ROLL_TYPES.has(item.type)
  };
}

/* Sorting (ported from sorting.js) */

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
 * The system sorts each list several times (name, optional rule, identified, favorite,
 * archived). One multi-key comparator, last sort first, gives the same order.
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

/* Grouping */

const NUMBERED = ["", "Two", "Three", "Four"];

/**
 * Category groups mirroring the default sheet's sections (pc-sheet.html, actor-sheet.js).
 * `sorting` is the `system.settings.general.sorting` value a group holds. Secondary categories
 * show when they have items, or a label while "hide empty categories" is off.
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

  if (teen) single("teen-skill", "skill", "skills", L("Skills"));
  else {
    numbered("skill", "Skill", s.skills, ["Skills", "SkillCategoryTwo", "SkillCategoryThree", "SkillCategoryFour"], "skills");
    if (s.skills.powerShifts.active) single("power-shift", "power-shift", "skills", s.skills.powerShifts.label || L("PowerShifts"));
  }

  if (s.combat.lastingDamage.active) single("lasting-damage", "lasting-damage", "combat", L("LastingDamage"));
  single("attack", "attack", "combat", L("Attacks"));
  if (s.combat.ammo.active) single("ammo", "ammo", "combat", L("Ammo"));
  if (s.combat.armor.active) single("armor", "armor", "combat", L("Armor"));

  if (teen) single("teen-ability", "ability", "abilities", L("Abilities"));
  else {
    numbered("ability", "Ability", s.abilities, ["Abilities", "AbilityCategoryTwo", "AbilityCategoryThree", "AbilityCategoryFour"], "abilities");
    defs.push({
      key: "Spell", family: "abilities", types: ["ability"], sorting: "Spell",
      label: s.abilities.labelSpells || L("Spells"), primary: false, hasLabel: !!s.abilities.labelSpells
    });
  }

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
    // An unknown category falls back to the type's primary list, so nothing is lost.
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

/** The grid's groups. Grouping never writes data. */
export function buildGroups(actor, mode) {
  const visible = actor.items.filter(i => isVisible(actor, i));
  if (mode === "type") return groupByType(actor, visible);
  if (mode === "tag") return groupByTag(actor, visible);
  return groupByCategory(actor, visible);
}

/* Tags and recursions */

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

/** Activate or deactivate through the system's tagging engine. */
export function toggleTag(actor, item) {
  return callApi(item.type === "recursion" ? "recursionMacro" : "tagMacro", actor, item);
}

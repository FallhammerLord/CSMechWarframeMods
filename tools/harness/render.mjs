import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import Handlebars from "handlebars";

// Renders every sheet state to out/*.html through the real adapter and templates, with Foundry
// mocked. Needs a Cypher System checkout: CYPHER_SYSTEM=/path/to/cyphersystem node render.mjs
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CS = process.env.CYPHER_SYSTEM;
if (!CS) throw new Error("Set CYPHER_SYSTEM to a Cypher System checkout.");
fs.mkdirSync(path.join(HERE, "out"), {recursive: true});
process.chdir(path.join(HERE, "out"));
const tpl = JSON.parse(fs.readFileSync(`${CS}/template.json`, "utf8"));
const csLang = JSON.parse(fs.readFileSync(`${CS}/lang/en.json`, "utf8"));
const myLang = JSON.parse(fs.readFileSync(`${ROOT}/lang/en.json`, "utf8"));

// Foundry mocks
const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const setProperty = (o, p, v) => { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => a = a[k] ??= {}); a[ks.at(-1)] = v; };
const flat = {};
(function walk(d, p = "") { for (const [k, v] of Object.entries(d)) typeof v === "object" ? walk(v, p + k + ".") : flat[p + k] = v; })(csLang);
(function walk(d, p = "") { for (const [k, v] of Object.entries(d)) typeof v === "object" ? walk(v, p + k + ".") : flat[p + k] = v; })(myLang);
const missing = new Set();
const localize = k => { if (!(k in flat)) missing.add(k); return flat[k] ?? k; };
const format = (k, d) => localize(k).replace(/\{(\w+)\}/g, (_, n) => d?.[n] ?? `{${n}}`);
Math.clamp = (v, a, b) => Math.min(Math.max(v, a), b);
globalThis.Roll = {validate: s => /\d*d\d+/.test(s)};
globalThis.ui = {notifications: {error: m => console.log("ERROR", m), warn: m => console.log("WARN", m), info: () => {}}};
globalThis.Hooks = {call: () => true};
const settings = {"cyphersystem.rollButtons": 1, "cyphersystem.diceTray": 1, "cyphersystem.useSlashForFractions": true,
  "cypher-card-sheet.defaultGroupMode": "category"};
globalThis.game = {
  i18n: {localize, format},
  settings: {get: (ns, k) => { const key = `${ns}.${k}`; if (!(key in settings)) throw new Error("no setting " + key); return settings[key]; }},
  keyboard: {isModifierActive: () => false},
  user: {isGM: false},
  modules: {get: () => undefined},
  cyphersystem: {}
};
const partials = {};
globalThis.foundry = {
  utils: {getProperty, setProperty},
  applications: {
    api: {HandlebarsApplicationMixin: B => class extends B {}, DialogV2: {}, ApplicationV2: class { async _prepareContext() { return {}; } }},
    sheets: {ActorSheetV2: class { async _prepareContext() { return {}; } }},
    ux: {TextEditor: {implementation: {enrichHTML: async h => h}}},
    handlebars: {renderTemplate: async (p, ctx) => compile(p)(ctx)}
  }
};
globalThis.getDocumentClass = () => ({TYPES: tpl.Item.types});

// Handlebars helpers (Foundry equivalents)
const H = Handlebars;
H.registerHelper("localize", (k, opts) => Object.keys(opts.hash ?? {}).length ? format(k, opts.hash) : localize(k));
H.registerHelper("eq", (a, b) => a == b);
H.registerHelper("ne", (a, b) => a != b);
H.registerHelper("and", (...a) => a.slice(0, -1).every(Boolean));
H.registerHelper("or", (...a) => a.slice(0, -1).some(Boolean));
H.registerHelper("not", a => !a);
H.registerHelper("concat", (...a) => a.slice(0, -1).join(""));
H.registerHelper("ifThen", (c, a, b) => (c ? a : b));
H.registerHelper("checked", v => (v ? "checked" : ""));
H.registerHelper("selectOptions", (choices, opts) => new H.SafeString(Object.entries(choices).map(([v, l]) =>
  `<option value="${v}"${String(v) === String(opts.hash.selected) ? " selected" : ""}>${l}</option>`).join("")));
const MOD = "modules/cypher-card-sheet/templates/";
function compile(p) { return H.compile(fs.readFileSync(path.join(ROOT, p.replace("modules/cypher-card-sheet/", "")), "utf8"), {strict: false}); }
for (const f of fs.readdirSync(`${ROOT}/templates/parts`)) H.registerPartial(`${MOD}parts/${f}`, fs.readFileSync(`${ROOT}/templates/parts/${f}`, "utf8"));

// Mock documents from the system's template.json
const clone = o => structuredClone(o);
function itemSystem(type) {
  const def = tpl.Item[type]; let sys = {};
  for (const t of def.templates ?? []) Object.assign(sys, clone(tpl.Item.templates[t]));
  const rest = clone(def); delete rest.templates;
  return foundry.utils.mergeObject ? null : deepMerge(sys, rest);
}
function deepMerge(a, b) { for (const [k, v] of Object.entries(b)) { if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") deepMerge(a[k], v); else a[k] = v; } return a; }
let n = 0;
function mkItem(type, name, patch = {}, flags = {}) {
  const system = itemSystem(type);
  for (const [p, v] of Object.entries(patch)) setProperty(system, p, v);
  const id = `item${++n}`.padEnd(16, "x");
  return {id, _id: id, name, type, img: (name.length % 2 ? "art.png" : `${CS}/icons/items/${type}.svg`), system, flags: {cyphersystem: flags},
    sheet: {render() {}}, update: async u => undefined};
}
const pcSys = clone(tpl.Actor.pc); delete pcSys.templates;
const tag = mkItem("tag", "Combat mode", {active: true, exclusive: true});
const tag2 = mkItem("tag", "Stealth", {"settings.general.sorting": "TagTwo"});
const items = [
  mkItem("skill", "Force-Reactive Heavy Plating Mk II", {"basic.rating": "Specialized"}, {tags: [tag.id]}),
  mkItem("skill", "Intrusion: Critical Deflect", {"basic.rating": "Inability", "settings.general.sorting": "SkillTwo"}),
  mkItem("skill", "Teen sneaking", {"settings.general.unmaskedForm": "Teen"}),
  mkItem("ability", "Onslaught", {"basic.cost": "1", "basic.pool": "Intellect", "settings.rollButton.skill": "Trained"}, {tags: [tag.id, tag2.id]}),
  mkItem("ability", "Hedge Magic", {"basic.cost": 0, "settings.general.sorting": "Spell"}),
  mkItem("ability", "Weird sorting", {"settings.general.sorting": "Nonsense"}),
  mkItem("attack", "Broadsword", {"basic.damage": 6, "basic.range": "immediate", "basic.skillRating": "Trained"}),
  mkItem("armor", "Chainmail", {"basic.rating": 2, "basic.cost": 2, active: false}),
  mkItem("equipment", "Rope", {"basic.quantity": 2, favorite: true}),
  mkItem("equipment", "Old map", {archived: true, "settings.general.sorting": "EquipmentThree"}),
  mkItem("cypher", "Detonation", {"basic.level": "1d6+2", "basic.type": [2, 1]}),
  mkItem("cypher", "Mystery", {"basic.identified": false, "basic.level": 4}),
  mkItem("artifact", "Lightning rod", {"basic.level": 6}),
  mkItem("oddity", "Singing stone", {}),
  mkItem("lasting-damage", "Broken arm", {"basic.damage": 2, "basic.pool": "Might", "basic.type": "Permanent"}),
  mkItem("power-shift", "Strength", {"basic.shifts": 2, "basic.temporary": true}),
  mkItem("ammo", "Arrows", {"basic.quantity": 12}),
  mkItem("material", "Iron", {"basic.quantity": 3, "basic.level": 2}),
  tag, tag2, mkItem("recursion", "Ardeyn", {active: false})
];
const actor = {
  id: "actor1", uuid: "Actor.actor1", name: "Kira", img: "portrait.webp", type: "pc", isOwner: true, limited: false,
  system: pcSys, items, flags: {"cypher-card-sheet": {recoveryLabels: {tenHours: "Long rest"}, poolLabels: {intellect: "Processing"}, movePerAction: 15}},
  getFlag(scope, key) { return getProperty(this.flags[scope] ?? {}, key); }
};
items.forEach(i => i.parent = actor);
const S = actor.system.settings;
S.general.tags.active = true;
S.general.tags.labelCategory2 = "Stances";
S.combat.lastingDamage.active = S.combat.ammo.active = true;
S.equipment.artifacts.active = S.equipment.oddities.active = S.equipment.materials.active = true;
S.equipment.currency.active = true; S.equipment.currency.numberCategories = 3;
S.skills.powerShifts.active = true;
S.combat.stress.active = true;
S.combat.numberOneActionRecoveries = 3; S.combat.numberTenMinuteRecoveries = "2";
S.general.additionalPool.active = true;
actor.system.combat.recoveries.oneAction = true;
actor.system.combat.damageTrack.state = "Impaired";

// Run
const cs = await import(`${ROOT}/scripts/adapter/cypher.js`);
const {CypherCardSheet} = await import(`${ROOT}/scripts/sheet/card-sheet.js`);

for (const mode of cs.GROUP_MODES) {
  console.log(`\n== groups: ${mode}`);
  for (const g of cs.buildGroups(actor, mode)) console.log(`  [${g.key}] ${g.label} (${g.count}) types=${g.createTypes} sorting=${g.createSorting}:`, g.items.map(c => c.name).join(", "));
}
console.log("\n== cards");
for (const i of items.filter(i => cs.CARD_TYPES.includes(i.type))) {
  const c = cs.cardData(i, actor);
  console.log(`  ${c.name.padEnd(16)} tr=${c.training?.label ?? "-"} value="${c.value}" sub="${c.sub}" roll=${c.canRoll}`);
}
console.log("\n== recovery", cs.recoverySlots(actor).map(s => `${s.key}:${s.label}${s.spent ? "(spent)" : ""}${s.next ? "(next)" : ""}`).join(" "));
console.log("== tagbar", JSON.stringify(cs.tagBar(actor)));
console.log("== pools", cs.pools(actor).map(p => `${p.label} ${p.value}/${p.max} e${p.edge}`).join(" | "));
console.log("== damage", JSON.stringify(cs.damageTrack(actor)));
console.log("== controls cypher", cs.itemControls(actor, items[10]).map(c => c.action).join(","));
console.log("== design", JSON.stringify(cs.sheetDesign(actor)));

// Render the whole sheet through the real _prepareContext
const sheet = new CypherCardSheet();
Object.defineProperty(sheet, "actor", {value: actor});
Object.defineProperty(sheet, "isEditable", {value: true});
for (const tab of ["cards", "settings"]) {
  for (const mode of cs.GROUP_MODES) {
    const ctx = await sheet._prepareContext({});
    sheet.view.tab = tab; sheet.view.mode = mode;
    const html = compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({}));
    fs.writeFileSync(`out-${tab}-${mode}.html`, html);
  }
}
const pop = await cs.itemDetail(actor, items[3]);
fs.writeFileSync("out-popover.html", compile(`${MOD}popover.hbs`)({...pop, editable: true}));

// Armor menu open, worn armor, badge, tall portrait
items.find(i => i.name === "Chainmail").system.active = true;
actor.system.combat.armor.ratingTotal = 2; actor.system.combat.armor.costTotal = 2;
actor.system.settings.general.background.icon = "wolf"; actor.system.settings.general.background.iconOpacity = 0.3;
sheet.view.tab = "cards"; sheet.view.mode = "category"; sheet.view.armorMenu = true;
fs.writeFileSync("out-armor.html", compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({})));
sheet.view.armorMenu = false;
actor.flags["cypher-card-sheet"].portraitTall = true;
fs.writeFileSync("out-tall.html", compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({})));
actor.flags["cypher-card-sheet"].portraitTall = false;

// Compact layout: blocked while the Additional Pool is on, active once it's off
actor.flags["cypher-card-sheet"].compact = true;
console.log("== compact blocked", JSON.stringify(cs.compactMode(actor)));
S.general.additionalPool.active = false;
console.log("== compact active", JSON.stringify(cs.compactMode(actor)));
actor.system.basic.focus = "Fusion Drive with an Advanced AI"; S.general.additionalSentence.active = true;
fs.writeFileSync("out-compact.html", compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({})));
actor.flags["cypher-card-sheet"].portraitTall = true;
fs.writeFileSync("out-compact-tall.html", compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({})));
sheet.view.tab = "settings";
fs.writeFileSync("out-compact-settings.html", compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({})));
sheet.view.tab = "cards";
actor.flags["cypher-card-sheet"].portraitTall = false;
actor.flags["cypher-card-sheet"].compact = false;
S.general.additionalPool.active = true;

// High-contrast frames
actor.flags["cypher-card-sheet"].highContrastFrames = true;
fs.writeFileSync("out-hc.html", compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({})));
actor.flags["cypher-card-sheet"].highContrastFrames = false;

// Teen form + limited
actor.system.basic.unmaskedForm = "Teen";
fs.writeFileSync("out-teen.html", compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({})));
console.log("\n== teen groups:", cs.buildGroups(actor, "category").map(g => `${g.label}(${g.count})`).join(", "));
actor.limited = true;
fs.writeFileSync("out-limited.html", compile(`${MOD}sheet.hbs`)(await sheet._prepareContext({})));
// Ruler wrapper
Number.prototype.toNearest = function(n) { return Math.round(this / n) * n; };
globalThis.CONFIG = {Token: {rulerClass: class {
  _getWaypointLabelContext(w) { return {cost: {total: String(w), units: "ft"}, cyphersystemLabel: "system"}; }
  _getWaypointStyle() { return {radius: 5, color: 1, alpha: 1}; }
  _getSegmentStyle() { return {width: 0}; }
  _getGridHighlightStyle() { return {color: 1, alpha: 1}; }
}}};
const {registerMovementRuler} = await import(`${ROOT}/scripts/adapter/ruler.js`);
registerMovementRuler(); registerMovementRuler();
const R = new CONFIG.Token.rulerClass(); R.token = {actor, scene: {grid: {type: 1, units: "ft"}}};
actor.flags["cypher-card-sheet"].movementRanges = {immediate: 30, short: 120};
console.log("== ruler", [10, 30, 31, 100, 120, 121, 501].map(c => R._getWaypointLabelContext(c).cyphersystemLabel).join(" | "));
console.log("== styles", JSON.stringify(R._getWaypointStyle({measurement: {cost: "31"}})), JSON.stringify(R._getSegmentStyle({measurement: {cost: "31"}})));
delete actor.flags["cypher-card-sheet"].movementRanges;
console.log("== untouched", R._getWaypointLabelContext(40).cyphersystemLabel);
// Card frames: live CSS with the default textures, and the GM settings window
const frames = await import(`${ROOT}/scripts/frames/frames.js`);
const css = frames.buildFrameCss(frames.defaultFrames()).replaceAll("modules/cypher-card-sheet/", ROOT + "/");
fs.writeFileSync("frames.css", css);
const {CardFramesConfig} = await import(`${ROOT}/scripts/frames/frames-config.js`);
const fc = new CardFramesConfig();
fs.writeFileSync("out-frames.html", compile(`${MOD}frames-config.hbs`)(await fc._prepareContext({})).replaceAll("modules/cypher-card-sheet/", ROOT + "/"));
console.log("frames css rules:", css.split("}").length - 1);
console.log("\nmissing i18n keys:", [...missing]);

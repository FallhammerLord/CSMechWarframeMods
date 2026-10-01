import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import Handlebars from "handlebars";

// Renders the Cypher System's own sheets and forms to out/sys-*.html with the system's real sheet
// classes (getData) and templates, Foundry mocked, for checking the dark theme on system windows.
// Usage: CYPHER_SYSTEM=/path/to/cyphersystem node system-render.mjs
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CS = process.env.CYPHER_SYSTEM;
if (!CS) throw new Error("Set CYPHER_SYSTEM to a Cypher System checkout.");
fs.mkdirSync(path.join(HERE, "out"), {recursive: true});
const tpl = JSON.parse(fs.readFileSync(`${CS}/template.json`, "utf8"));
const lang = JSON.parse(fs.readFileSync(`${CS}/lang/en.json`, "utf8"));

// Foundry mocks
const flat = {};
(function walk(d, p = "") { for (const [k, v] of Object.entries(d)) typeof v === "object" ? walk(v, `${p}${k}.`) : flat[p + k] = v; })(lang);
const localize = k => flat[k] ?? k;
const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const setProperty = (o, p, v) => { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => a = a[k] ??= {}); a[ks.at(-1)] = v; };
const mergeObject = (a, b) => { for (const [k, v] of Object.entries(b ?? {})) { if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") mergeObject(a[k], v); else a[k] = v; } return a; };
const settings = new Map();
const Base = class {
  static get defaultOptions() { return {classes: [], tabs: []}; }
  constructor(object, options = {}) { this.object = object; this.document = object; this.options = mergeObject(this.constructor.defaultOptions, options); }
  get template() { return this.options.template; }
  get isEditable() { return true; }
  getData() {
    const o = this.object;
    return {object: o, actor: o, item: o, document: o, data: o, system: o.system, items: o.items ?? [], owner: true, editable: true,
      limited: false, options: this.options, cssClass: "editable"};
  }
};
const anyClass = new Proxy({}, {get: () => Base});
globalThis.Handlebars = Handlebars;
globalThis.foundry = {
  utils: {getProperty, setProperty, mergeObject, duplicate: o => structuredClone(o), deepClone: o => structuredClone(o)},
  appv1: {sheets: anyClass, api: anyClass},
  applications: {api: anyClass, sheets: anyClass, ux: {TextEditor: {implementation: {enrichHTML: async h => h ?? ""}}},
    handlebars: {loadTemplates: async () => {}}},
  documents: {collections: {Actors: {}, Items: {}}},
  data: {fields: new Proxy({}, {get: () => class { constructor(o) { Object.assign(this, o); } }})}
};
globalThis.document = {querySelector: () => ({style: {setProperty() {}}})};
globalThis.Roll = {validate: s => /\d*d\d+/.test(s)};
globalThis.TextEditor = {enrichHTML: async h => h ?? ""};
globalThis.FormApplication = globalThis.Application = globalThis.Dialog = Base;
globalThis.CONST = {DOCUMENT_OWNERSHIP_LEVELS: {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3}};
globalThis.CONFIG = {cyphersystem: {}};
globalThis.Hooks = {on() {}, once() {}, call: () => true, callAll() {}};
globalThis.ui = {notifications: {warn() {}, info() {}, error() {}}};
globalThis.game = {
  i18n: {localize, format: (k, d) => localize(k).replace(/\{(\w+)\}/g, (_, n) => d?.[n] ?? "")},
  settings: {
    register: (ns, key, def) => settings.set(`${ns}.${key}`, def.default ?? def.type?.initial),
    registerMenu() {},
    get: (ns, key) => settings.get(`${ns}.${key}`),
    set: async () => {}
  },
  user: {isGM: true, id: "u1"},
  keyboard: {isModifierActive: () => false},
  modules: {get: () => undefined, has: () => false},
  system: {id: "cyphersystem"},
  cyphersystem: {}
};

const sys = async p => import(pathToFileURL(path.join(CS, "module", p)).href);
await (await sys("utilities/game-settings.js")).registerGameSettings();
await (await sys("utilities/handlebars.js")).registerHandlebars();
// Foundry's own helpers that the templates use.
const H = Handlebars;
H.registerHelper("localize", (k, o) => Object.keys(o?.hash ?? {}).length ? game.i18n.format(k, o.hash) : localize(k));
H.registerHelper("eq", (a, b) => a == b);
H.registerHelper("ne", (a, b) => a != b);
H.registerHelper("gt", (a, b) => a > b);
H.registerHelper("lt", (a, b) => a < b);
H.registerHelper("and", (...a) => a.slice(0, -1).every(Boolean));
H.registerHelper("or", (...a) => a.slice(0, -1).some(Boolean));
H.registerHelper("not", a => !a);
H.registerHelper("concat", (...a) => a.slice(0, -1).join(""));
H.registerHelper("checked", v => (v ? "checked" : ""));
H.registerHelper("disabled", v => (v ? "disabled" : ""));
H.registerHelper("selected", v => (v ? "selected" : ""));
H.registerHelper("ifThen", (c, a, b) => (c ? a : b));
H.registerHelper("editor", (content, o) => new H.SafeString(`<div class="editor"><div class="editor-content">${content ?? ""}</div></div>`));
H.registerHelper("selectOptions", (choices, o) => new H.SafeString(Object.entries(choices ?? {}).map(([v, l]) =>
  `<option value="${v}"${String(v) === String(o.hash.selected) ? " selected" : ""}>${o.hash.localize ? localize(l) : l}</option>`).join("")));
H.registerHelper("numberFormat", v => v);
H.registerHelper("gte", (a, b) => a >= b);
H.registerHelper("lte", (a, b) => a <= b);
H.registerHelper("rangePicker", o => new H.SafeString(`<input type="range" name="${o.hash.name}" value="${o.hash.value}" min="${o.hash.min}" max="${o.hash.max}" step="${o.hash.step}"><span class="range-value">${o.hash.value}</span>`));
H.registerHelper("filePicker", o => new H.SafeString(`<button type="button" class="file-picker" data-type="${o.hash.type}" data-target="${o.hash.target}"><i class="fas fa-file-import fa-fw"></i></button>`));
(function partials(dir) {
  for (const f of fs.readdirSync(path.join(CS, "templates", dir), {withFileTypes: true})) {
    const rel = path.join(dir, f.name);
    if (f.isDirectory()) partials(rel);
    else H.registerPartial(`systems/cyphersystem/templates/${rel}`, fs.readFileSync(path.join(CS, "templates", rel), "utf8"));
  }
})("");

// Documents from template.json
const clone = o => structuredClone(o);
const withTemplates = (group, type) => {
  const def = clone(group[type]);
  const out = {};
  for (const t of def.templates ?? []) mergeObject(out, clone(group.templates[t]));
  delete def.templates;
  return mergeObject(out, def);
};
let n = 0;
function mkItem(type, name, patch = {}) {
  const system = withTemplates(tpl.Item, type);
  for (const [p, v] of Object.entries(patch)) setProperty(system, p, v);
  const id = `item${++n}`.padEnd(16, "x");
  return {id, _id: id, name, type, img: `systems/cyphersystem/icons/items/${type}.svg`, system, flags: {},
    getFlag: () => undefined, isOwner: true, permission: 3};
}
function mkActor(type, name, items, patch = {}) {
  const system = withTemplates(tpl.Actor, type);
  for (const [p, v] of Object.entries(patch)) setProperty(system, p, v);
  const list = Object.assign([...items], {get: id => items.find(i => i.id === id), contents: items});
  const actor = {id: `${type}1`, uuid: `Actor.${type}1`, name, type, img: "icons/svg/mystery-man.svg", system, items: list,
    flags: {}, getFlag: () => undefined, isOwner: true, permission: 3, limited: false, prototypeToken: {texture: {src: ""}}};
  for (const i of items) i.parent = i.actor = actor;
  return actor;
}
const items = () => [
  mkItem("skill", "Climbing", {"basic.rating": "Trained"}),
  mkItem("ability", "Onslaught", {"basic.cost": "1", "basic.pool": "Intellect"}),
  mkItem("attack", "Broadsword", {"basic.damage": 6, "basic.range": "Immediate"}),
  mkItem("armor", "Chainmail", {"basic.rating": 2, active: true}),
  mkItem("equipment", "Rope", {"basic.quantity": 2}),
  mkItem("cypher", "Detonation", {"basic.level": "1d6+2", "basic.type": [2, 0]}),
  mkItem("artifact", "Lightning rod", {"basic.level": 6, "basic.depletion": "1 in d6"})
];

// Wrap in a Foundry AppV1 window, as Foundry does.
const windowHtml = (classes, title, inner) => `<div class="app window-app ${classes.join(" ")}" style="width:auto">
  <header class="window-header flexrow"><h4 class="window-title">${title}</h4></header>
  <section class="window-content">${inner}</section></div>`;

async function renderSheet(name, Sheet, object, extraData = {}) {
  const sheet = new Sheet(object);
  sheet.actor = sheet.item = object;
  const data = {...await sheet.getData(), ...extraData};
  const html = Handlebars.compile(fs.readFileSync(path.join(CS, sheet.template.replace("systems/cyphersystem/", "")), "utf8"))(data);
  fs.writeFileSync(path.join(HERE, "out", `sys-${name}.html`), windowHtml(sheet.options.classes, object.name, html));
  console.log(`sys-${name}.html`, html.length);
}

const sheets = {
  pc: ["actor/pc-sheet.js", "CypherActorSheetPC"], npc: ["actor/npc-sheet.js", "CypherActorSheetNPC"],
  companion: ["actor/companion-sheet.js", "CypherActorSheetCompanion"], community: ["actor/community-sheet.js", "CypherActorSheetCommunity"],
  vehicle: ["actor/vehicle-sheet.js", "CypherActorSheetVehicle"], marker: ["actor/marker-sheet.js", "CypherActorSheetMarker"]
};
for (const [type, [file, cls]] of Object.entries(sheets)) {
  const Sheet = (await sys(file))[cls];
  await renderSheet(type, Sheet, mkActor(type, `Test ${type}`, items()));
}
const {CypherItemSheet} = await sys("item/item-sheet.js");
for (const item of items()) await renderSheet(`item-${item.type}`, CypherItemSheet, item);

// The system's small forms (the All-in-One dialog has its own snapshot state). The difficulty
// and GM intrusion forms are translucent panels and stay as they are; they're here for reference.
const pcs = [mkActor("pc", "Kira", []), mkActor("pc", "Ash", [])];
for (const a of pcs) a.hasPlayerOwner = true;
game.actors = Object.assign(pcs, {contents: pcs});
const forms = {
  "form-difficulty": ["forms/roll-difficulty-sheet.js", "RollDifficultySheet"],
  "form-gmi": ["forms/gmi-range-sheet.js", "GMIRangeSheet"],
  "form-customization": ["forms/sheet-customization.js", "SheetCustomization"]
};
for (const [name, [file, cls]] of Object.entries(forms)) {
  const Form = (await sys(file))[cls];
  await renderSheet(name, Form, {name: cls});
}

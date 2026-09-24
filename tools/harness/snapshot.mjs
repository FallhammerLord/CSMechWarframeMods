// Visual regression check for refactors. `baseline` saves the rendered states and styles;
// `compare` renders baseline and current side by side in Chromium and diffs the computed style
// of every element and ::before/::after, plus forced :hover and :focus variants.
// Run render.mjs first. Usage: node snapshot.mjs baseline|compare
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import Handlebars from "handlebars";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out");
const BASE = path.join(HERE, "baseline");
const CS = process.env.CYPHER_SYSTEM;
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url);
const {chromium} = require("playwright");
const executablePath = process.env.CHROMIUM_PATH;

const mode = process.argv[2];
if (!["baseline", "compare"].includes(mode)) throw new Error("Usage: node snapshot.mjs baseline|compare");

// Styles and rendered HTML, from the working tree (current) or the saved baseline.
function assets(dir) {
  const read = f => fs.readFileSync(path.join(dir, f), "utf8");
  return {css: read("card-sheet.css") + read("frames.css"), systemCss: read("cyphersystem.css"), html: f => read(f)};
}
function saveBaseline() {
  fs.rmSync(BASE, {recursive: true, force: true});
  fs.mkdirSync(BASE);
  for (const f of fs.readdirSync(OUT)) if (f.startsWith("out-") || f === "frames.css") fs.copyFileSync(path.join(OUT, f), path.join(BASE, f));
  fs.copyFileSync(path.join(ROOT, "styles/card-sheet.css"), path.join(BASE, "card-sheet.css"));
  fs.copyFileSync(path.join(CS, "css/cyphersystem.css"), path.join(BASE, "cyphersystem.css"));
}
function current() {
  const css = fs.readFileSync(path.join(ROOT, "styles/card-sheet.css"), "utf8") + fs.readFileSync(path.join(OUT, "frames.css"), "utf8");
  return {css, systemCss: fs.readFileSync(path.join(CS, "css/cyphersystem.css"), "utf8"), html: f => fs.readFileSync(path.join(OUT, f), "utf8")};
}

// Stand-ins for core Foundry rules that interact with the sheet.
const CORE = `body{margin:0;background:#333;font-family:Signika,sans-serif} *{box-sizing:border-box}
*,*::before,*::after{animation:none!important;transition:none!important}
.application{height:900px;display:flex;flex-direction:column;position:relative}
.window-header{height:30px;background:#111;color:#ddd;padding:6px 10px}
.window-content{flex:1;display:flex;flex-direction:column;min-height:0}
.application button{display:flex;gap:6px;padding:0 8px} .application button > i{margin-right:4px}
.flexrow{display:flex}.flexcol{display:flex;flex-direction:column}.flexrow>*{flex:1}.grid{display:grid}.grid-3col{grid-template-columns:repeat(3,1fr)}
.tab{display:none}.tab.active{display:block}`;
const FA = path.join(HERE, "node_modules/@fortawesome/fontawesome-free/css/all.min.css");

// Forced interaction states: rewrite the pseudo-class to a class and give it to every element.
const FORCE = {
  hover: [/:hover\b/g, "ccs-x-hover"],
  focus: [/:focus(?![-\w])/g, "ccs-x-focus"],
  focusVisible: [/:focus-visible\b/g, "ccs-x-fv"],
  focusWithin: [/:focus-within\b/g, "ccs-x-fw"]
};

const sheet = (body, {width = 800, theme = "", extra = ""} = {}) =>
  `<form class="application sheet ccs-sheet ${theme}" style="width:${width}px"><header class="window-header">Kira</header><section class="window-content">${body}</section></form>${extra}`;
const popover = (a, cls, style) => `<section class="ccs-popover ${cls}" data-placement="up" style="${style}">${a.html("out-popover.html")}</section>`;

/** Item sheet and roll dialog: the system's own templates, rendered with minimal data. */
function systemWindow(kind) {
  const H = Handlebars.create();
  const flat = {};
  (function walk(d, p = "") { for (const [k, v] of Object.entries(d)) typeof v === "object" ? walk(v, p + k + ".") : flat[p + k] = v; })(JSON.parse(fs.readFileSync(path.join(CS, "lang/en.json"), "utf8")));
  H.registerHelper("localize", k => flat[k] ?? k);
  for (const [n, f] of Object.entries({eq: (a, b) => a == b, ne: (a, b) => a != b, and: (...a) => a.slice(0, -1).every(Boolean), or: (...a) => a.slice(0, -1).some(Boolean), not: a => !a,
    checked: v => (v ? "checked" : ""), sum: () => 0})) H.registerHelper(n, f);
  H.registerHelper("selectOptions", (c, o) => new H.SafeString(Object.entries(c ?? {}).map(([v, l]) => `<option ${v == o.hash.selected ? "selected" : ""}>${l}</option>`).join("")));
  H.registerHelper("helperMissing", () => "");
  H.registerHelper("editor", html => new H.SafeString(`<div class="editor"><div class="editor-content">${html}</div></div>`));
  const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(path.join(CS, "templates"))) H.registerPartial(`systems/cyphersystem/${path.relative(CS, f)}`, fs.readFileSync(f, "utf8"));
  const tpl = JSON.parse(fs.readFileSync(path.join(CS, "template.json"), "utf8"));
  const sys = t => { const d = structuredClone(tpl.Item[t]); for (const n of d.templates ?? []) Object.assign(d, structuredClone(tpl.Item.templates[n])); delete d.templates; return d; };
  const desc = "<p><strong>Level:</strong> 5</p><p>Text <a class='content-link'>Link</a></p><h4>Notes</h4><hr>";
  const item = (type, tab) => {
    const s = sys(type); s.description = desc;
    const html = H.compile(fs.readFileSync(path.join(CS, `templates/item-sheets/${type}-sheet.html`), "utf8"))({
      item: {name: `Test ${type}`, img: "", type, system: s}, owner: true, editable: true,
      actor: {type: "pc", system: {settings: {general: {gameMode: "Cypher System", tags: {active: true}}}}},
      enrichedHTML: {description: desc}, abilityCategoryChoices: {Ability: "Abilities"}, spellTierChoices: {}, unmaskedFormChoices: {},
      sheetSettings: {isGM: true, identified: true, backgroundImage: "cypher-blue", backgroundImageBaseSetting: "background-image", backgroundIcon: "none", isMaskForm: true, rollButtons: true},
      itemLists: {tags: [], tagsOnItem: []}
    }).replace(`class="tab${tab === "settings" ? " settings" : ""}" data-group="primary" data-tab="${tab}"`, m => m.replace('class="tab', 'class="tab active'));
    return `<div class="application window-app cyphersystem sheet item item-sheet ccs-item-sheet ccs-sys-dark themed theme-dark" style="width:575px"><header class="window-header">Item</header><section class="window-content">${html}</section></div>`;
  };
  if (kind === "items") return item("artifact", "description") + item("ability", "settings") + item("cypher", "description");
  const roll = H.compile(fs.readFileSync(path.join(CS, "templates/forms/roll-engine-dialog-sheet.html"), "utf8"))({});
  return `<div class="application window-app cyphersystem ccs-aio ccs-aio-dark ccs-sys-dark themed theme-dark" style="width:650px"><header class="window-header">Roll</header><section class="window-content">${roll}</section></div>`;
}

const STATES = [
  ["cards-category", a => sheet(a.html("out-cards-category.html"))],
  ["cards-type", a => sheet(a.html("out-cards-type.html"))],
  ["cards-tag", a => sheet(a.html("out-cards-tag.html"))],
  ["settings", a => sheet(a.html("out-settings-category.html"))],
  ["armor", a => sheet(a.html("out-armor.html"))],
  ["tall", a => sheet(a.html("out-tall.html"), {width: 835})],
  ["hc", a => sheet(a.html("out-hc.html"), {extra: popover(a, "frame-specialized ccs-hc", "position:fixed;left:420px;top:300px;width:360px;height:400px")})],
  ["teen", a => sheet(a.html("out-teen.html"))],
  ["limited", a => sheet(a.html("out-limited.html"))],
  ["light", a => sheet(a.html("out-cards-category.html"), {theme: "themed theme-light", extra: popover(a, "frame-trained themed theme-light", "position:fixed;left:420px;top:300px;width:360px;height:400px")})],
  ["popover", a => sheet(a.html("out-cards-category.html"), {extra: popover(a, "frame-practiced", "position:fixed;left:420px;top:300px;width:360px;height:400px")})],
  ["compact", a => sheet(a.html("out-compact.html"))],
  ["compact-narrow", a => sheet(a.html("out-compact.html"), {width: 575})],
  ["compact-tall", a => sheet(a.html("out-compact-tall.html"), {width: 650})],
  ["compact-settings", a => sheet(a.html("out-compact-settings.html"))],
  ["frames", a => `<form class="application ccs-frames-config" style="width:820px"><section class="window-content">${a.html("out-frames.html")}</section></form>`],
  ["items", () => systemWindow("items"), true],
  ["roll", () => systemWindow("roll"), true]
];

const page = (a, state, force) => {
  const [, body, system] = state;
  let css = (system ? a.systemCss : "") + a.css;
  if (force) css = css.replace(FORCE[force][0], `.${FORCE[force][1]}`);
  return `<!doctype html><html><head><link rel="stylesheet" href="file://${FA}"><style>${CORE}${css}</style></head><body>${body(a)}</body></html>`;
};

// Wait for web fonts (Font Awesome) and two frames, so both pages measure the same layout.
const settle = () => {
  // Lazy images off screen would settle at unpredictable times; load them all now.
  for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = "eager";
  const images = [...document.images].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
  return Promise.race([Promise.all([document.fonts.ready, ...images]), new Promise(r => setTimeout(r, 2000))])
    .then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
};

// Per element: a hash of every computed property of the element, ::before and ::after.
const COLLECT = force => {
  if (force) for (const el of document.querySelectorAll("*")) el.classList.add(force);
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  // Custom properties are skipped: any visible effect shows up in the properties that use them.
  const dump = (el, pseudo) => { const cs = getComputedStyle(el, pseudo); const out = []; for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith("--")) out.push(cs[i] + ":" + cs.getPropertyValue(cs[i])); return out.join(";"); };
  // Skipped as inert: pseudo-elements that don't render, and flex settings on non-flex boxes.
  const pseudo = (el, which) => (getComputedStyle(el, which).content === "none" ? "none" : dump(el, which));
  const own = el => {
    const s = dump(el);
    return /(^|;)display:(inline-)?flex(;|$)/.test(s) ? s : s.replace(/(^|;)flex-(direction|wrap):[^;]*/g, "");
  };
  return [...document.querySelectorAll("body *")].map(el => hash(own(el) + pseudo(el, "::before") + pseudo(el, "::after")));
};
const DETAIL = ({index, force}) => {
  if (force) for (const el of document.querySelectorAll("*")) el.classList.add(force);
  const el = document.querySelectorAll("body *")[index];
  const out = {};
  for (const pseudo of ["", "::before", "::after"]) {
    const cs = getComputedStyle(el, pseudo || null);
    for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith("--")) out[pseudo + cs[i]] = cs.getPropertyValue(cs[i]);
  }
  return {tag: `${el.tagName.toLowerCase()}.${[...el.classList].filter(c => !c.startsWith("ccs-x-")).join(".")}`, props: out};
};

if (mode === "baseline") {
  saveBaseline();
  console.log("Baseline saved:", fs.readdirSync(BASE).length, "files");
  process.exit(0);
}

const browser = await chromium.launch({executablePath});
const [pa, pb] = [await browser.newPage({viewport: {width: 900, height: 920}}), await browser.newPage({viewport: {width: 900, height: 920}})];
const base = assets(BASE);
const cur = current();
let problems = 0;
for (const state of STATES.filter(s => !process.env.ONLY || s[0] === process.env.ONLY)) {
  for (const force of [null, "hover", "focus", "focusVisible", "focusWithin"]) {
    const tmpA = path.join(OUT, "_a.html"), tmpB = path.join(OUT, "_b.html");
    fs.writeFileSync(tmpA, page(base, state, force));
    fs.writeFileSync(tmpB, page(cur, state, force));
    await pa.goto(`file://${tmpA}`, {waitUntil: "load"});
    await pb.goto(`file://${tmpB}`, {waitUntil: "load"});
    await Promise.all([pa, pb].map(p => p.evaluate(settle)));
    const cls = force ? FORCE[force][1] : null;
    const [ha, hb] = [await pa.evaluate(COLLECT, cls), await pb.evaluate(COLLECT, cls)];
    const label = `${state[0]}${force ? `:${force}` : ""}`;
    if (ha.length !== hb.length) { console.log(`✗ ${label}: element count ${ha.length} → ${hb.length}`); problems++; continue; }
    const diffs = ha.map((h, i) => (h === hb[i] ? -1 : i)).filter(i => i >= 0);
    if (!force) {
      const [sa, sb] = [await pa.screenshot({fullPage: true}), await pb.screenshot({fullPage: true})];
      if (!sa.equals(sb)) { console.log(`✗ ${label}: screenshot differs`); problems++; }
    }
    if (!diffs.length) continue;
    problems++;
    console.log(`✗ ${label}: ${diffs.length} element(s) differ`);
    for (const i of diffs.slice(0, 4)) {
      const [da, db] = [await pa.evaluate(DETAIL, {index: i, force: cls}), await pb.evaluate(DETAIL, {index: i, force: cls})];
      const changed = Object.keys({...da.props, ...db.props}).filter(k => da.props[k] !== db.props[k]);
      console.log(`   ${da.tag}: ${changed.slice(0, 6).map(k => `${k} ${da.props[k]} → ${db.props[k]}`).join("; ")}`);
    }
  }
}
await browser.close();
console.log(problems ? `\n${problems} problem(s).` : `All states identical, including forced hover and focus.`);
process.exit(problems ? 1 : 0);

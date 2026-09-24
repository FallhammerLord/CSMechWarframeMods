// Behaviour test for the large card (scripts/sheet/popover.js) in Chromium, attached and in a
// "detached" window (an iframe: its own document and window, as with v14's Detach Window).
// Usage: node popover-test.mjs  (same environment variables as snapshot.mjs)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CS = process.env.CYPHER_SYSTEM;
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url);
const {chromium} = require("playwright");

const TYPES = {".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".hbs": "text/plain", ".html": "text/html", ".svg": "image/svg+xml"};
const PAGE = `<!doctype html><html><head><link rel="stylesheet" href="/styles/card-sheet.css">
<script src="/hb/handlebars.min.js"></script>
<script>
Math.clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const getProperty = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
window.game = {i18n: {localize: k => k, format: k => k}, keyboard: {isModifierActive: () => false},
  settings: {get() { throw new Error("no setting"); }}, user: {isGM: true, id: "u1"}, modules: {get: () => undefined}, cyphersystem: {}};
window.ui = {notifications: {warn() {}, info() {}, error() {}}};
window.ChatMessage = {create: async d => (window.chat ??= []).push(d), getSpeaker: () => ({})};
window.Roll = {validate: () => false};
window.foundry = {utils: {getProperty}, applications: {
  handlebars: {renderTemplate: async (p, ctx) => Handlebars.compile(await (await fetch("/" + p.replace("modules/cypher-card-sheet/", ""))).text())(ctx)},
  ux: {TextEditor: {implementation: {enrichHTML: async h => h}}}}};
for (const [n, f] of Object.entries({localize: k => k, eq: (a, b) => a == b, ne: (a, b) => a != b,
  and: (...a) => a.slice(0, -1).every(Boolean), concat: (...a) => a.slice(0, -1).join("")})) Handlebars.registerHelper(n, f);
</script>
<script type="module">
import {CardPopover} from "/scripts/sheet/popover.js";
window.CardPopover = CardPopover;
window.ready = true;
</script></head><body style="margin:0;background:#333"></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/test.html") return res.end(PAGE);
  const file = url.startsWith("/hb/") ? path.join(HERE, "node_modules/handlebars/dist", url.slice(4))
    : url.startsWith("/cs/") ? path.join(CS, url.slice(4)) : path.join(ROOT, url);
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
    res.end(data);
  });
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const page = await browser.newPage({viewport: {width: 1400, height: 900}});
page.on("pageerror", e => console.log("PAGE ERROR", e.message));
await page.goto(`${base}/test.html`);
await page.waitForFunction(() => window.ready);

// Actor with an artifact (3 sockets, key "rod"), a socketed single-use cypher and an eligible one.
await page.evaluate(async () => {
  const tpl = await (await fetch("/cs/template.json")).json();
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") merge(a[k], v); else a[k] = v; } return a; };
  const system = type => { const d = structuredClone(tpl.Item[type]); const s = {}; for (const n of d.templates ?? []) merge(s, structuredClone(tpl.Item.templates[n])); delete d.templates; return merge(s, d); };
  window.updates = [];
  const mk = (id, type, name, flags = {}) => ({id, type, name, img: "", system: system(type), flags: {"cypher-card-sheet": flags},
    async update(u) {
      window.updates.push({id, u});
      for (const [p, v] of Object.entries(u)) {
        const keys = p.split("."); let o = this;
        for (const k of keys.slice(0, -1)) o = o[k] ??= {};
        const last = keys.at(-1);
        o[last] = v && typeof v === "object" && o[last] && typeof o[last] === "object" ? {...o[last], ...v} : v;
      }
    }, get sheet() { return {render() {}}; }});
  const rod = mk("rod", "artifact", "Lightning rod", {sockets: {enabled: true, count: 3, key: "rod"}});
  const fire = mk("fire", "cypher", "Fire shard", {socket: {enabled: true, key: "rod", artifactId: "rod", slot: 0}});
  const bolt = mk("bolt", "cypher", "Bolt shard", {socket: {enabled: true, key: "ROD "}});
  const items = [rod, fire, bolt];
  items.get = id => items.find(i => i.id === id);
  const actorSystem = structuredClone(tpl.Actor.pc); delete actorSystem.templates;
  window.actor = {id: "a1", uuid: "Actor.a1", name: "Kira", items, system: actorSystem, isOwner: true, flags: {}, getFlag: () => undefined};
});

// A minimal sheet: one card for the artifact inside a scroll area, placed at (x, y) in `doc`.
const mountSheet = (x, y, inFrame) => page.evaluate(async ([x, y, inFrame]) => {
  let doc = document;
  if (inFrame) {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;left:0;top:0;width:1100px;height:800px;border:0";
    document.body.append(frame);
    doc = frame.contentDocument;
    doc.open(); doc.write('<!doctype html><html><head><link rel="stylesheet" href="/styles/card-sheet.css"></head><body style="margin:0"></body></html>'); doc.close();
    await new Promise(r => setTimeout(r, 300));
  }
  const el = doc.createElement("div");
  el.className = "ccs-sheet";
  el.innerHTML = `<div class="ccs-root"><div class="ccs-scroll" style="position:fixed;left:0;top:0;right:0;bottom:0">
    <article class="ccs-card frame-none" data-item-id="rod" data-group-key="g" style="position:absolute;left:${x}px;top:${y}px;width:148px;height:114px">
      <div class="ccs-card-actions"><button>d20</button></div></article></div></div>`;
  doc.body.append(el);
  window.sheet = {actor: window.actor, isEditable: true, element: el};
  window.sheetDoc = doc;
}, [x, y, inFrame]);

const wait = ms => page.waitForTimeout(ms);
const q = sel => page.evaluate(sel => { const d = window.sheetDoc; const e = d.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, doc: e.ownerDocument === d}; }, sel);
const click = sel => page.evaluate(sel => window.sheetDoc.querySelector(sel).click(), sel);
const pointerdown = sel => page.evaluate(sel => { const t = sel ? window.sheetDoc.querySelector(sel) : window.sheetDoc.body; t.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, composed: true})); }, sel);
const escape = () => page.evaluate(() => window.sheetDoc.defaultView.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})));
const open = () => page.evaluate(() => window.CardPopover.open(window.sheet, window.sheetDoc.querySelector(".ccs-card")));
const isOpen = () => page.evaluate(() => window.CardPopover.isOpen);

let failures = 0;
const check = (label, ok) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures++; };

for (const inFrame of [false, true]) {
  const where = inFrame ? "detached" : "attached";
  // Fresh state each pass: fire socketed in slot 0, bolt unsocketed.
  await page.evaluate(() => {
    const fire = window.actor.items.get("fire");
    fire.system.archived = false;
    fire.flags["cypher-card-sheet"].socket = {enabled: true, key: "rod", artifactId: "rod", slot: 0};
    window.actor.items.get("bolt").flags["cypher-card-sheet"].socket = {enabled: true, key: "ROD "};
  });
  // Card near the left edge: panels open to the right.
  await mountSheet(40, 500, inFrame);
  await open(); await wait(200);
  const main = await q(".ccs-popover:not(.is-side)");
  check(`${where}: large card opens in the sheet's document`, main?.doc === true);
  await click('[data-popover-action="socketPick"]'); await wait(200);
  const picker = await q(".ccs-popover.is-picker");
  check(`${where}: picker panel opens beside it, to the right`, !!picker && picker.left >= main.right);
  if (process.env.SHOT && !inFrame) await page.screenshot({path: process.env.SHOT, clip: {x: 0, y: 40, width: 820, height: 580}});
  check(`${where}: picker lists only the matching cypher`, await page.evaluate(() => [...window.sheetDoc.querySelectorAll(".ccs-socket-choice")].map(b => b.dataset.cypherId).join()) === "bolt");
  await pointerdown(".ccs-popover.is-picker");
  check(`${where}: clicking in the picker keeps the large card open`, await isOpen());
  await click(".ccs-socket-choice"); await wait(100);
  check(`${where}: choosing a cypher sockets it`, await page.evaluate(() => window.actor.items.get("bolt").flags["cypher-card-sheet"].socket.artifactId === "rod"));
  check(`${where}: and closes the picker`, !(await q(".ccs-popover.is-side:not(.is-closing)")));

  // Inline confirmation for a single-use cypher; Escape cancels it, not the card.
  await page.evaluate(() => window.CardPopover.refresh(window.sheet)); await wait(200);
  await click('[data-popover-action="useSocketed"][data-cypher-id="fire"]'); await wait(50);
  check(`${where}: Use asks inline`, !!(await q(".ccs-pop-confirm")));
  await escape(); await wait(50);
  check(`${where}: Escape cancels the confirmation only`, !(await q(".ccs-pop-confirm")) && await isOpen());
  await click('[data-popover-action="useSocketed"][data-cypher-id="fire"]'); await wait(50);
  await click('[data-ccs-confirm="yes"]'); await wait(100);
  check(`${where}: confirming uses and archives the cypher`, await page.evaluate(() => window.actor.items.get("fire").system.archived === true));

  // Side card, Escape steps back one layer at a time.
  await page.evaluate(() => window.CardPopover.refresh(window.sheet)); await wait(200);
  await click('[data-popover-action="showSocketed"][data-cypher-id="bolt"]'); await wait(200);
  check(`${where}: socketed cypher's card opens beside`, !!(await q(".ccs-popover.is-side:not(.is-picker)")));
  await escape(); await wait(50);
  check(`${where}: Escape closes the side card first`, !(await q(".ccs-popover.is-side:not(.is-closing)")) && await isOpen());
  await pointerdown(null); await wait(50);
  check(`${where}: clicking outside closes the large card`, !(await isOpen()));

  // Card near the right edge: the picker opens to the left.
  await page.evaluate(() => { window.sheetDoc.querySelector(".ccs-sheet").remove(); window.actor.items.get("bolt").flags["cypher-card-sheet"].socket.artifactId = null; });
  await mountSheet(inFrame ? 920 : 1220, 500, inFrame);
  await open(); await wait(200);
  const main2 = await q(".ccs-popover:not(.is-side)");
  await click('[data-popover-action="socketPick"]'); await wait(200);
  const picker2 = await q(".ccs-popover.is-picker");
  check(`${where}: near the right edge, the picker opens to the left`, !!picker2 && picker2.right <= main2.left + 1);
  await escape(); await escape(); await wait(50);
  check(`${where}: Escape twice closes everything`, !(await isOpen()));
  await page.evaluate(() => { window.sheetDoc.querySelector(".ccs-sheet").remove(); document.querySelector("iframe")?.remove(); });
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s).` : "\nAll large-card checks passed.");
process.exit(failures ? 1 : 0);

// Behaviour test for chat card disclosure (scripts/adapter/chat-cards.js) in Chromium: a card sent
// from the sheet and a system roll card, under each player setting.
// Usage: node chat-test.mjs  (same environment variables as snapshot.mjs)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url);
const {chromium} = require("playwright");

// The sent card's markup comes from the real sendToChat, run in Node with Foundry mocked.
globalThis.foundry = {utils: {getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o)}};
globalThis.game = {i18n: {localize: k => k, format: k => k}, settings: {get() { throw new Error(); }},
  keyboard: {isModifierActive: () => false}, user: {isGM: true}, cyphersystem: {}};
let sent = "";
globalThis.ChatMessage = {create: async d => { sent = d.content; }, getSpeaker: () => ({})};
const {sendToChat} = await import("../../scripts/adapter/item-actions.js");
await sendToChat({}, {type: "cypher", name: "Bolt shard", img: "x.svg", system: {basic: {level: 4}, description: "<p>Lightning.</p>"}});

// A system roll card, as roll-engine-output.js writes it with both world settings off.
const ROLL = `<div class='roll-flavor'><div class='roll-result-box'><a class="chat-description"><b><b>Zap</b><br></a></b>
  <div style="display: none" class="chat-card-item-description"><div>Text</div></div></div>
  <div class="roll-result-box"><b><a class="roll-result-difficulty">Difficulty 3</a></b><br><div class="roll-result-difficulty-details" style="display: none">Base 3</div></div>
  <div class="dice-roll"><div class="dice-tooltip">1d20</div></div></div>`;

const TYPES = {".js": "text/javascript", ".css": "text/css"};
const PAGE = `<!doctype html><html><head><link rel="stylesheet" href="/styles/card-sheet.css"><script>
window.settings = {"cypher-card-sheet.chatItemText": "collapsed", "cypher-card-sheet.chatRollDetails": "default", "cyphersystem.alwaysShowDescriptionOnRoll": false};
window.game = {settings: {get: (ns, k) => window.settings[ns + "." + k]}, i18n: {localize: k => k}};
window.foundry = {utils: {getProperty: () => undefined}};
</script><script type="module">
import {applyChatDisclosure} from "/scripts/adapter/chat-cards.js";
window.render = html => { const li = document.createElement("li"); li.innerHTML = html; document.body.append(li); applyChatDisclosure(li); return li; };
window.ready = true;
</script></head><body></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/test.html") return res.end(PAGE);
  fs.readFile(path.join(ROOT, url), (err, data) => {
    if (err) { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Type", TYPES[path.extname(url)] ?? "application/octet-stream");
    res.end(data);
  });
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const page = await browser.newPage();
page.on("pageerror", e => console.log("PAGE ERROR", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/test.html`);
await page.waitForFunction(() => window.ready);

let failures = 0;
const check = (label, ok) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures++; };
const set = values => page.evaluate(v => Object.assign(window.settings, v), values);
const state = html => page.evaluate(html => {
  const li = window.render(html);
  const shown = sel => { const el = li.querySelector(sel); return !!el && el.offsetParent !== null; };
  const out = {body: shown(".ccs-chat-body"), text: shown(".chat-card-item-description"),
    details: shown(".roll-result-difficulty-details"), dice: li.querySelector(".dice-tooltip")?.classList.contains("expanded")};
  li.remove();
  return out;
}, html);

check("sent card: header is a toggle, text follows it", sent.includes('class="ccs-chat-toggle"') && sent.includes("Lightning."));

let s = await state(sent);
check("default: sent card's item text starts closed", s.body === false);
s = await state(ROLL);
check("default: roll card's item text closed, details left to the game setting", !s.text && !s.details && !s.dice);

// Clicking the header opens and closes the text; so does the keyboard.
const toggles = await page.evaluate(html => {
  const li = window.render(html);
  const toggle = li.querySelector(".ccs-chat-toggle");
  const body = li.querySelector(".ccs-chat-body");
  const seen = [];
  toggle.click(); seen.push(!body.hidden && toggle.getAttribute("aria-expanded") === "true");
  toggle.click(); seen.push(body.hidden && toggle.getAttribute("aria-expanded") === "false");
  toggle.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true})); seen.push(!body.hidden);
  li.remove();
  return seen;
}, sent);
check("clicking the header opens the text", toggles[0]);
check("clicking again closes it", toggles[1]);
check("Enter toggles it too", toggles[2]);

await set({"cypher-card-sheet.chatItemText": "expanded", "cypher-card-sheet.chatRollDetails": "expanded"});
s = await state(sent);
check("Open: sent card's text starts open", s.body === true);
s = await state(ROLL);
check("Open: roll card's text, details and dice start open", s.text && s.details && s.dice);
const classes = await page.evaluate(html => {
  const li = window.render(html);
  const out = ["chat-card-item-description", "roll-result-difficulty-details"].map(c => li.querySelector("." + c).classList.contains("expanded"));
  li.remove();
  return out;
}, ROLL);
check("Open: system blocks carry 'expanded', so the system's click closes them", classes.every(Boolean));

await set({"cypher-card-sheet.chatItemText": "default", "cypher-card-sheet.chatRollDetails": "collapsed", "cyphersystem.alwaysShowDescriptionOnRoll": true});
s = await state(sent);
check("Game default: sent card follows 'always show description'", s.body === true);
s = await state(ROLL.replace('style="display: none" class="chat-card-item-description"', 'class="chat-card-item-description expanded"'));
check("Closed details: roll card details and dice start closed, item text untouched", s.text && !s.details && !s.dice);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s).` : "\nAll chat card checks passed.");
process.exit(failures ? 1 : 0);

// Notes editors on the sheet (Notes, GM Notes, Description), while open for editing: the
// editable area must fill its box, so a click anywhere in it reaches the text, and the toolbar
// keeps its own height. Foundry's <prose-mirror> is stood in by its
// markup, with and without a wrapper around the text area. Run render.mjs first.
// Usage: node editor-test.mjs  (same environment variables as snapshot.mjs)
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url);
const {chromium} = require("playwright");

const CORE = `body{margin:0;background:#333;font-family:Signika,sans-serif} *{box-sizing:border-box}
.application{height:900px;display:flex;flex-direction:column;position:relative}
.window-header{height:30px;background:#111;color:#ddd;padding:6px 10px}
.window-content{flex:1;display:flex;flex-direction:column;min-height:0}`;
const css = fs.readFileSync(path.join(ROOT, "styles/card-sheet.css"), "utf8");
const sheet = fs.readFileSync(path.join(HERE, "out/out-notes.html"), "utf8");
const TEXT = '<div class="editor-content ProseMirror" contenteditable="true"><p>start</p></div>';
const MENU = '<menu class="editor-menu"><button type="button">B</button></menu>';
const variants = {
  wrapped: `${MENU}<div class="editor-container">${TEXT}</div>`,
  direct: `${MENU}${TEXT}`,
  "menu-wrapped": `<div class="editor-menu-wrapper">${MENU}</div><div class="editor-container">${TEXT}</div>`,
  "div-menu": `<div class="editor-menu"><button type="button">B</button></div><div class="editor-container">${TEXT}</div>`
};

const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const page = await browser.newPage({viewport: {width: 1000, height: 950}});
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures++; };

for (const [name, inner] of Object.entries(variants)) {
  const html = sheet.replace(/<prose-mirror([^>]*)>[\s\S]*?<\/prose-mirror>/g, `<prose-mirror$1>${inner}</prose-mirror>`);
  await page.setContent(`<!doctype html><html><head><style>${CORE}${css}</style></head><body><form class="application sheet ccs-sheet" style="width:880px"><header class="window-header">Kira</header><section class="window-content">${html}</section></form></body></html>`);
  const box = await page.evaluate(() => {
    const editor = document.querySelector(".ccs-text-panel:not([hidden]) prose-mirror");
    const text = editor?.querySelector(".ProseMirror");
    if (!text) return null;
    const e = editor.getBoundingClientRect();
    const r = text.getBoundingClientRect();
    // Low in the box, where an empty note has no text.
    const hit = document.elementFromPoint(e.left + e.width / 2, e.bottom - 30);
    return {height: r.height, boxHeight: e.height, hitsText: !!hit?.closest(".ProseMirror"),
      menu: editor.querySelector(".editor-menu").getBoundingClientRect().height,
      button: editor.querySelector(".editor-menu button").getBoundingClientRect().height};
  });
  check(`${name}: the notes tab has an editor`, !!box);
  if (!box) continue;
  check(`${name}: the text area fills the box (${Math.round(box.height)} of ${Math.round(box.boxHeight)}px)`, box.height >= box.boxHeight - 80);
  check(`${name}: a click low in the box reaches the text`, box.hitsText);
  // The toolbar is its buttons plus a little padding: never stretched by the box, never tight.
  const pad = box.menu - box.button;
  check(`${name}: the toolbar is a little taller than its buttons (${Math.round(box.menu)}px for ${Math.round(box.button)}px)`, pad >= 6 && pad <= 12);
}

await browser.close();
console.log(failures ? `\n${failures} failure(s).` : "\nAll editor checks passed.");
process.exit(failures ? 1 : 0);

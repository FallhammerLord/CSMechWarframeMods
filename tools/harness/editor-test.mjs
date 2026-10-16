// Notes editors on the sheet (Notes, GM Notes, Description). Foundry's <prose-mirror> is stood in
// by its markup and the core v14 rules that shape it: the box takes --min-height, the text is
// positioned over the whole box unless the box is "content-sized", where it flows below the
// toolbar. Checks: the toolbar and text never overlap, the text area is tall enough to click
// anywhere in the box, and the text has margins in editing and reading view.
// Usage: node editor-test.mjs  (run render.mjs first; same environment variables as snapshot.mjs)
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
.window-content{flex:1;display:flex;flex-direction:column;min-height:0}
prose-mirror{display:flex;flex-direction:column;position:relative;min-height:var(--min-height)}
prose-mirror menu{display:flex;align-items:center;height:var(--menu-height,32px);margin:0;padding:0 4px;flex:none}
prose-mirror .editor-content{position:absolute;inset:0;overflow:auto}
prose-mirror.content-sized .editor-content{position:unset}
prose-mirror > button.toggle{position:absolute;top:4px;right:4px;width:28px;height:28px}
.application button{display:flex;gap:6px;padding:0 8px;align-items:center} .application button > i{margin-right:4px}`;
const css = fs.readFileSync(path.join(ROOT, "styles/card-sheet.css"), "utf8");
const sheet = fs.readFileSync(path.join(HERE, "out/out-notes.html"), "utf8");
const MENU = '<menu class="editor-menu"><button type="button">B</button><button type="button">Save</button></menu>';
const TEXT = '<div class="editor-content ProseMirror" contenteditable="true"><p>start</p></div>';
const views = {
  editing: `${MENU}<div class="editor-container">${TEXT}</div>`,
  "editing (no wrapper)": `${MENU}${TEXT}`,
  reading: '<div class="editor-content"><p>start</p></div><button type="button" class="toggle"><i style="display:inline-block;width:14px;height:14px"></i></button>'
};

const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const page = await browser.newPage({viewport: {width: 1000, height: 950}});
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok) failures++; };

for (const [name, inner] of Object.entries(views)) {
  const html = sheet.replace(/<prose-mirror([^>]*)>[\s\S]*?<\/prose-mirror>/g, `<prose-mirror$1>${inner}</prose-mirror>`);
  await page.setContent(`<!doctype html><html><head><style>${CORE}${css}</style></head><body><form class="application sheet ccs-sheet" style="width:880px"><header class="window-header">Kira</header><section class="window-content">${html}</section></form></body></html>`);
  const m = await page.evaluate(() => {
    const box = document.querySelector(".ccs-text-panel:not([hidden]) prose-mirror");
    if (!box) return null;
    const rect = el => el?.getBoundingClientRect();
    const b = rect(box);
    const text = rect(box.querySelector(".editor-content"));
    const p = rect(box.querySelector(".editor-content p"));
    const menu = rect(box.querySelector("menu"));
    const editable = box.querySelector(".ProseMirror");
    const hit = editable && document.elementFromPoint(b.left + b.width / 2, b.bottom - 20);
    const toggle = box.querySelector("button.toggle");
    const t = rect(toggle), icon = rect(toggle?.querySelector("i"));
    const off = toggle && Math.max(Math.abs(icon.left + icon.width / 2 - (t.left + t.width / 2)), Math.abs(icon.top + icon.height / 2 - (t.top + t.height / 2)));
    return {box: b.height, textTop: text.top, textHeight: text.height, menuBottom: menu?.bottom,
      left: p.left - b.left, top: p.top - (menu?.bottom ?? b.top), editable: !!editable, hitsText: !!hit?.closest?.(".ProseMirror"), off};
  });
  check(`${name}: the notes tab has an editor`, !!m);
  if (!m) continue;
  if (m.menuBottom !== undefined) check(`${name}: the text starts below the toolbar, never under it`, m.textTop >= m.menuBottom - 0.5);
  check(`${name}: the text has margins (${Math.round(m.left)}px side, ${Math.round(m.top)}px top)`, m.left >= 14 && m.top >= 10);
  if (m.off != null) check(`${name}: the edit button's icon is centred (${m.off.toFixed(1)}px off)`, m.off <= 0.5);
  if (m.editable) {
    check(`${name}: the text area fills the box (${Math.round(m.textHeight)}px of ${Math.round(m.box)}px)`, m.textHeight >= m.box - 80);
    check(`${name}: a click low in the box reaches the text`, m.hitsText);
  }
}

await browser.close();
console.log(failures ? `\n${failures} failure(s).` : "\nAll editor checks passed.");
process.exit(failures ? 1 : 0);

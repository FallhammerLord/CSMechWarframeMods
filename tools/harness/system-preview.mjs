// Screenshots of the system's own windows (from system-render.mjs) in the system's light look
// and in the module's dark theme, one image per tab, in out/sys-shots/.
// Usage: node system-preview.mjs [name-filter]  (same environment variables as snapshot.mjs)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CS = process.env.CYPHER_SYSTEM;
const OUT = path.join(HERE, "out");
const SHOTS = path.join(OUT, "sys-shots");
fs.mkdirSync(SHOTS, {recursive: true});
const require = createRequire(process.env.PLAYWRIGHT_MODULES ?? import.meta.url);
const {chromium} = require("playwright");

// Stand-ins for core Foundry window rules (as in snapshot.mjs), plus AppV1 window chrome.
const CORE = `body{margin:0;background:#333;font-family:Signika,sans-serif;font-size:14px} *{box-sizing:border-box}
*,*::before,*::after{animation:none!important;transition:none!important}
.window-app{position:relative;display:flex;flex-direction:column;min-height:300px;box-shadow:0 0 20px #000}
.window-header{height:30px;background:#111;color:#ddd;padding:6px 10px;flex:0 0 auto}
.window-header h4{margin:0;font-size:14px}
.window-content{flex:1;display:flex;flex-direction:column;padding:8px;overflow:visible}
.flexrow{display:flex;flex-direction:row;flex-wrap:wrap}.flexcol{display:flex;flex-direction:column}.flexrow>*{flex:1}
.tab{display:none}.tab.active{display:block}`;

const PAGE = `<!doctype html><html><head>
<link rel="stylesheet" href="/fa/css/all.min.css">
<link rel="stylesheet" href="/systems/cyphersystem/css/cyphersystem.css">
<style>${CORE}</style>
<link rel="stylesheet" href="/styles/card-sheet.css">
<script>window.game = {settings: {get() { throw new Error(); }}};</script>
<script type="module">
import {applySystemDark} from "/scripts/adapter/system-dark.js";
window.applySystemDark = applySystemDark;
window.ready = true;
</script></head><body><div id="host" style="padding:12px;display:inline-block"></div></body></html>`;

const TYPES = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".woff2": "font/woff2", ".ttf": "font/ttf"};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/test.html") return res.end(PAGE);
  const file = url.startsWith("/systems/cyphersystem/") ? path.join(CS, url.slice(21))
    : url.startsWith("/fa/") ? path.join(HERE, "node_modules/@fortawesome/fontawesome-free", url.slice(4))
      : path.join(ROOT, url);
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
    res.end(data);
  });
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const page = await browser.newPage({viewport: {width: 1000, height: 900}});
page.on("pageerror", e => console.log("PAGE ERROR", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/test.html`);
await page.waitForFunction(() => window.ready);

const filter = process.argv[2] ?? "";
const widths = {pc: 800, npc: 650, companion: 650, community: 650, vehicle: 650, marker: 650};
for (const file of fs.readdirSync(OUT).filter(f => f.startsWith("sys-") && f.endsWith(".html") && f.includes(filter))) {
  const name = file.slice(4, -5);
  const kind = name.startsWith("item-") ? ["ccs-item-sheet", "ccs-sys-sheet"]
    : name.startsWith("form-") ? ["ccs-sys-form", "ccs-sys-sheet"]
      : ["ccs-actor-sheet", "ccs-sys-sheet"];
  const html = fs.readFileSync(path.join(OUT, file), "utf8");
  const tabs = await page.evaluate(html => {
    document.getElementById("host").innerHTML = html;
    return [...document.querySelectorAll("nav.sheet-tabs [data-tab]")].map(a => a.dataset.tab);
  }, html);
  for (const dark of [false, true]) {
    for (const tab of tabs.length ? tabs : [null]) {
      await page.evaluate(([html, dark, kind, tab, width]) => {
        const host = document.getElementById("host");
        host.innerHTML = html;
        const root = host.firstElementChild;
        root.style.width = `${width}px`;
        if (tab) {
          for (const el of root.querySelectorAll("[data-tab]")) el.classList.toggle("active", el.dataset.tab === tab);
        }
        window.applySystemDark(root, dark, ...kind);
      }, [html, dark, kind, tab, widths[name] ?? 575]);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const shot = path.join(SHOTS, `${name}${tab ? `-${tab}` : ""}-${dark ? "dark" : "light"}.png`);
      await page.locator("#host").screenshot({path: shot});
    }
  }
  console.log(name, tabs.join(" ") || "(no tabs)");
}
await browser.close();
server.close();

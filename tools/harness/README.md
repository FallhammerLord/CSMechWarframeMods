# Test harness

Renders the sheet outside Foundry, with Foundry mocked and the real templates, adapter and
stylesheet. Use it to check a change before trying it in a live world.

## Setup

```sh
cd tools/harness
npm install
```

It also needs a Cypher System checkout (for `template.json`, language files, templates and CSS)
and Playwright with Chromium:

```sh
export CYPHER_SYSTEM=/path/to/cyphersystem
export PLAYWRIGHT_MODULES=/path/to/global/node_modules/   # where playwright is installed
export CHROMIUM_PATH=/path/to/chromium                    # optional
```

## Unit tests

```sh
node unit-test.mjs
```

Tests the adapter's own logic with Foundry mocked: depletion parsing, socket layout and
eligibility, charges, artifact links and effect stars. Needs no system checkout or browser.

## Render

```sh
node render.mjs > out/render.log
```

Writes every sheet state to `out/*.html` and logs the adapter's data (groups, cards, pools,
recovery slots, ruler bands). `missing i18n keys: []` at the end means every string resolves.

## Check a refactor for visual changes

```sh
node render.mjs > out/render.log
node snapshot.mjs baseline        # before the change
# …make the change…
node render.mjs > out/render.log
node snapshot.mjs compare         # after
```

`compare` renders each state from the baseline and from the working tree side by side, and
compares the computed style of every element (and `::before` / `::after`), also with every
element forced into `:hover` and `:focus`. It also compares full-page screenshots. Set `ONLY=<state>`
to run one state. Comparing `out/render.log` with `baseline/render.log` checks the adapter's data.

The stand-ins for core Foundry styles are minimal, so this can't catch every interaction with
core CSS. Test in Foundry before release.

## Chat cards

```sh
node chat-test.mjs
```

Checks chat card disclosure in Chromium: a card sent from the sheet and a system roll card, under
each player setting, including click and keyboard toggling.

## System windows (dark theme)

```sh
node system-render.mjs     # the system's real sheet classes and templates → out/sys-*.html
node system-preview.mjs    # screenshots per tab, light and dark → out/sys-shots/
```

Renders the Cypher System's own actor sheets, item sheets and small forms with Foundry mocked,
then screenshots each tab with and without the module's dark theme. Pass a name filter to
`system-preview.mjs` (for example `npc` or `item-`) to shoot fewer.

## Large card behaviour

```sh
node popover-test.mjs
```

Drives the large card in Chromium, in a normal page and inside an iframe (standing in for a
detached window): picker panel placement, selection and preview, sockets, inline confirmations, Escape and outside
clicks. Serves the module over a local HTTP server, since browsers block module imports from
`file://`.


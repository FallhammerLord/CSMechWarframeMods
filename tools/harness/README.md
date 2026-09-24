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

## Large card behaviour

```sh
node popover-test.mjs
```

Drives the large card in Chromium, in a normal page and inside an iframe (standing in for a
detached window): picker panel placement, sockets, inline confirmations, Escape and outside
clicks. Serves the module over a local HTTP server, since browsers block module imports from
`file://`.


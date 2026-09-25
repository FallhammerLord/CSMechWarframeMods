# Release checklist

Run in a live Foundry world before tagging a release, and after any Foundry or Cypher System
update. About 15 minutes. Use a test PC on this sheet, logged in as GM, with a second browser
logged in as a player who owns the PC.

Record the versions tested at the bottom. A failed step blocks the release until fixed or
listed under Known limitations in the README.

## Before Foundry

In `tools/harness`, with the environment from its README:

- [ ] `node unit-test.mjs` passes.
- [ ] `node render.mjs > out/render.log` ends with `missing i18n keys: []`.
- [ ] `node snapshot.mjs compare` shows no differences, or only intended ones.
- [ ] `node popover-test.mjs` passes.

## Load

- [ ] The world loads with no red errors in the console (F12) from `cypher-card-sheet`.
- [ ] Sheet selector in the PC's header offers **Cypher Card Sheet**, and switching to it and back to the default sheet works.

## Sheet

- [ ] Pools: − / + / reset change the value and edge; the default sheet shows the same numbers.
- [ ] Compact layout on, then off (Settings → Sheet layout). The Additional Pool toggle is greyed while Compact is on.
- [ ] High-contrast frames on: cards and effect stars change palette.
- [ ] Recovery tiles roll, and an unused tile can be used out of order.
- [ ] Group by category, type and tag; family filter and search narrow the grid.
- [ ] A tag chip toggles its tag (stats change as on the default sheet).

## Rolls

- [ ] A card's d20 opens the All-in-One dialog; the roll posts to chat and pays its cost.
- [ ] An XP-cost ability opens the dialog with XP selected, and paying takes XP.
- [ ] A natural 19 lights the minor star, a 20 the major; clicking a lit star clears it. Rolling again doesn't clear either.

## Large card

- [ ] Click a card: the large card covers it, leaving the d20 visible. Click again, Escape, or click outside: it closes.
- [ ] **Edit** opens the item sheet beside the large card; typing in the item sheet keeps the large card open.
- [ ] Quantity − / + on equipment; Alt-click adds ten.
- [ ] Alt-click archive asks inline, and **Delete** removes the item.

## Artifacts

- [ ] Charges − / + stay between 0 and the maximum; reaching 0 rolls depletion when that option is set.
- [ ] Battery button on an artifact card rolls depletion and posts Depleted or Holds.
- [ ] An attack linked to the artifact shows the charge badge; spending from either card changes both.
- [ ] Empty socket → picker opens beside the large card. Nothing is selected and **Socket** is greyed.
- [ ] Click a cypher: it highlights and its card previews. **Socket** sockets it and closes both panels.
- [ ] Open the picker again and press Escape: nothing is socketed.
- [ ] **Use** on a single-use socketed cypher asks inline, posts to chat and archives it. A reusable one shows spent until **Refresh sockets**.
- [ ] Socketed cyphers are absent from the Cyphers group and its count.

## Player view

- [ ] The player sees the sheet, rolls, and uses sockets; the GM-only fields on item sheets are read-only for them.
- [ ] An observer (not owner) can open the large card and post to chat, but has no edit controls.

## Detached window

- [ ] Detach the sheet (window header). Large card, picker and preview open in the detached window.
- [ ] Custom card frames show in the detached window.
- [ ] Re-attach: the large card closes, and the sheet works as before.

## Tested with

| Date | Foundry | Cypher System | Result |
|---|---|---|---|
| | | | |

# Cypher Card Sheet

An alternative character sheet for the [Cypher System](https://foundryvtt.com/packages/cyphersystem) on Foundry VTT v14. Items appear as a grid of uniform cards, inspired by Warframe's Mods screen. The sheet keeps every function of the system's default PC sheet and changes only the look.

- **Cards.** Every item type gets the same card shape. The frame colour shows training level (inability, practiced, trained, specialized), or the item family when there is no training.
- **d20 on each card.** It makes the same call as the default sheet, so the All-in-One dialog, Alt-click and multi-roll behave exactly as before. Items that don't roll are posted to chat instead.
- **Detail popover.** Click a card to see its full rules text and that item's controls: pay points, cast spell, quantity, identify, and so on. Delete lives only here, behind a confirmation.
- **Tags.** The system's tags and recursions appear as chips above the grid. Clicking a chip runs the system's tagging engine, unchanged. You can group the grid by category, type or tag.
- **Recovery rolls.** One tile per recovery slot, with timing labels you can rename in the sheet's settings tab.

## Requirements

- Foundry VTT v14
- Cypher System 3.5.0 or later (built against 3.5.2)

## Install for testing

Foundry needs the module folder to be named after the module id, `cypher-card-sheet`:

```sh
cd <FoundryData>/Data/modules
git clone https://github.com/FallhammerLord/CSMechWarframeMods.git cypher-card-sheet
```

Enable **Cypher Card Sheet** in your world. Then, on a PC's sheet, open **Sheet** in the window header and choose **Cypher Card Sheet**.

## Layout

| Path | Purpose |
|---|---|
| `scripts/adapter/` | The only code that reads Cypher System data or calls the system; fix data-path changes here. `cypher.js` re-exports `actor.js`, `options.js` (per-actor settings, sheet design), `items.js` (cards, sorting, grouping) and `item-actions.js`. |
| `scripts/adapter/system-imports.js` | Imports of system functions that are not on `game.cyphersystem`. Highest coupling risk. |
| `scripts/adapter/system-ui.js` | Dark theme and pool names for the system's roll dialog, item sheets and chat cards. |
| `scripts/adapter/ruler.js` | Per-actor movement ranges on the token ruler. |
| `scripts/sheet/card-sheet.js` | The AppV2 sheet. |
| `scripts/sheet/popover.js` | The large card. |
| `scripts/frames/` | Card frames: generated CSS and the GM settings window. |
| `templates/` | Handlebars templates. |
| `styles/card-sheet.css` | Theme and layout. |
| `tools/harness/` | Renders the sheet outside Foundry and checks refactors for visual changes (see its README). |
| `tools/make-frames.py` | Generates the default frame images. |
| `docs/design-spec.md` | Design specification. |

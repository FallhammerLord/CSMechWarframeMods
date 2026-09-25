# Cypher Card Sheet

An alternative character sheet for the [Cypher System](https://foundryvtt.com/packages/cyphersystem) on Foundry VTT v14. Items appear as a grid of uniform cards, inspired by Warframe's Mods screen. The sheet keeps every function of the system's default PC sheet and changes only the look.

- **Cards.** Every item type gets the same card shape. The frame shows training level (inability, practiced, trained, specialized) by texture, colour and rank pips, or the item family when there is no training.
- **d20 on each card.** It makes the same call as the default sheet, so the All-in-One dialog, Alt-click and multi-roll behave exactly as before. Items that don't roll are posted to chat instead.
- **Large card.** Click a card for its full rules text and that item's controls: pay points, cast spell, quantity, identify, edit, and so on. Delete lives only here, behind a confirmation.
- **Tags.** The system's tags and recursions appear as chips above the grid. Clicking a chip runs the system's tagging engine, unchanged. You can group the grid by category, type or tag.
- **Recovery rolls.** One tile per recovery slot, usable in any order, with timing labels you can rename.
- **Sheet layout.** Compact layout for narrow windows, tall portraits, custom pool names and movement ranges for the token ruler, all per character.
- **Card frames.** Warframe-style frame textures, set by the GM, with a high-contrast suite for colour-blind players.
- **Artifacts.** A named counter such as Charges, with depletion rolled at 0; up to three sockets that hold cyphers; any item can link to an artifact to share its charges and sockets.
- **Roll effects.** Minor and major effect stars on the portrait, lit by a natural 19 or 20 and kept until you clear them.
- **XP as a pool** in the All-in-One dialog for abilities that cost XP.
- **Detached windows.** The sheet, its large card and panels work in a detached window (Foundry v14).

Sheet data the system doesn't know about (sockets, links, charges, effect stars, layout options) is stored in module flags. The default sheet ignores it and keeps it.

## Requirements

- Foundry VTT v14
- Cypher System 3.5.0 or later (built against 3.5.2)

## Known limitations

- Giving an artifact to another character leaves its socketed cyphers with the original owner, and items linked to it need the link picked again.
- On a detached sheet, the system's All-in-One dialog, item sheets, the portrait's right-click menu, the add-item dialog and the tag-delete confirmation open in the main window.
- On the default sheet, socketed cyphers show as ordinary cyphers.
- If there isn't room beside the large card, an item sheet opened with **Edit** partly sits under it.
- Rerolling an XP-paid roll from its chat card errors. This is a Cypher System issue.

## Install for testing

Foundry needs the module folder to be named after the module id, `cypher-card-sheet`:

```sh
cd <FoundryData>/Data/modules
git clone https://github.com/FallhammerLord/CSMechWarframeMods.git cypher-card-sheet
```

Enable **Cypher Card Sheet** in your world. Then, on a PC's sheet, open **Sheet** in the window header and choose **Cypher Card Sheet**.

## Testing

`tools/harness/` holds unit tests, a renderer, a visual regression check and a large-card behaviour test (see its README). Before a release, and after a Foundry or Cypher System update, run [docs/testing-checklist.md](docs/testing-checklist.md) in a live world.

## Layout

| Path | Purpose |
|---|---|
| `scripts/adapter/` | The only code that reads Cypher System data or calls the system; fix data-path changes here. `cypher.js` re-exports `actor.js`, `options.js` (per-actor settings, sheet design), `items.js` (cards, sorting, grouping), `item-actions.js` and `sockets.js`. |
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
| `docs/testing-checklist.md` | Release checklist for a live world. |

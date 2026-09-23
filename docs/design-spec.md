# Cypher System Card Sheet — Design Specification (rev. 2)

A Foundry VTT v14 module that adds a new, alternative PC sheet for the Cypher System. Items display as a Warframe Mods-style card grid. The sheet is a fresh build with its own files. It keeps full functional parity with the system's default PC sheet and changes only the look and feel.

Research baseline: `cyphersystem` **v3.5.2** (requires Foundry 14, verified 14.360). File references below point into that release's source.

---

## 1. Architecture

### Framework

- **Sheet class:** `HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2)`.
  - The system's own sheets still extend the legacy `foundry.appv1.sheets.ActorSheet` (`module/actor/actor-sheet.js:40`). A fresh V14 sheet uses AppV2. Confirmed against dnd5e's V14 build (`base-actor-sheet.mjs:56`).
- **Registration:** `foundry.documents.collections.Actors.registerSheet("<module-id>", CardSheet, { types: ["pc"], makeDefault: false, label })`. This matches how the system registers (`cyphersystem.js:187`). Players pick the sheet per actor.
- **Actor types:** `pc` only for MVP. NPC, companion, community and vehicle keep the system sheets.

### Layers

| Layer | Responsibility |
|---|---|
| **Adapter** (`scripts/adapter/`) | The only code that touches `actor.system.*`, `item.system.*`, `item.flags.cyphersystem.*`, `game.cyphersystem.*`, or imports from `/systems/cyphersystem/...`. Everything else calls adapter functions. |
| **Sheet** | AppV2 sheet: header, pools, tabs, card grid, recovery row, settings tab. |
| **Card Grid** | Groups and filters cards. |
| **Collapsed Card** | Uniform card; three click targets. |
| **Detail Popover** | Singleton DOM element on `document.body`; description plus contextual actions. |

### System APIs we reuse (never reimplement)

Exposed on `game.cyphersystem` (`cyphersystem.js:109`):

- `itemRollMacro(actor, itemID, …, noRoll, "", macroUuid, "")`: item roll, the same call the default sheet makes (`actor-sheet.js:832`, `:840`).
- `rollEngineMain({actorUuid, pool})`: stat rolls (`pc-sheet.js:377`).
- `recoveryRollMacro(actor, "", true)`: recovery roll (`pc-sheet.js:392`).
- `diceRollMacro(dice, actor)`: dice tray.
- `tagMacro(actor, item)` / `recursionMacro(actor, item)`: tagging engine entry points.
- `CypherActorSheet`: the legacy class; we borrow its `_onDropItem` (see §7).

Not exported. The adapter imports these directly from the system's module path:
- `changeTagStats`, `removeTagFromItem` (`utilities/tagging-engine/tagging-engine-computation.js`): required for tag deletion.
- `useRecoveries` (`utilities/actor-utilities.js`): spell casting.
- `disableMultiRoll` (`forms/roll-engine-dialog-sheet.js`).

These direct imports are the highest coupling risk. Keep them in one adapter file.

---

## 2. Item types

The system defines 14 (`template.json`): `ability, ammo, armor, artifact, attack, cypher, equipment, lasting-damage, material, oddity, power-shift, recursion, skill, tag`.

- **Card grid:** all types except `tag` and `recursion`.
- **Tag / recursion items:** these drive organization, so they render in the tag bar (§4), not as cards.
- **Teen form:** when `system.basic.unmaskedForm == "Teen"`, show items whose `system.settings.general.unmaskedForm == "Teen"` and the teen pools. Otherwise show the Mask items. This matches `actor-sheet.js:215–277`.

---

## 3. Collapsed card

### Fields

Training level exists only on some types, so the card uses a per-type **key value** slot instead of a fixed "Pool + Cost". Card dimensions stay constant, and empty slots render blank.

| Type | Training | Key value |
|---|---|---|
| skill | `basic.rating` | — |
| attack | `basic.skillRating` | damage (+ range) |
| ability | `settings.rollButton.skill` (hidden when Practiced) | cost + pool (`basic.cost` may be `"3+"`; hidden when 0) |
| armor | — | rating / speed cost; active state |
| cypher, artifact | — | level; cypher type icon; unidentified name when not identified |
| equipment, ammo, material | — | quantity |
| oddity | — | level |
| power-shift | — | shifts; temporary marker |
| lasting-damage | — | damage + pool |

Every card also shows the **name**, the **favorite star**, and the **archived state**.

Tags are **not displayed** on cards; they are backend data for grouping and filtering.

### Click targets

1. **d20 button**
   - Types `ability`, `attack`, `skill` call `game.cyphersystem.itemRollMacro(actor, item.id, "", …, false, "", item.system.settings.rollButton.macroUuid, "")`. This is identical to the default sheet.
     - The system decides between the All-in-One dialog and a direct roll: the world setting `itemMacrosUseAllInOne` decides, Alt inverts it, and an active multi-roll forces the dialog (`roll-engine-main.js:52–53`). We inherit all of that for free.
   - Every other type, or any type when the world setting `rollButtons == 0`, posts the item to chat.
     - The post matches the default sheet's Alt-click description message (`actor-sheet.js:975–1015`).
     - Unidentified cyphers and artifacts are blocked with the system's warning.
2. **Archive button:** toggles `system.archived`.
3. **Card body:** toggles the popover (singleton; §5).

The card body is a focusable `<button>`, so Enter and Space open the popover.

---

## 4. Card grid and tags

### How the system does tags (maintained as-is)

- **Tag definitions:** `tag` and `recursion` items on the actor.
  - Tags have a category: `settings.general.sorting` ∈ `Tag`, `TagTwo`, `TagThree`, `TagFour`. Category labels live at `actor.system.settings.general.tags.labelCategory1–4`.
  - Each has stat modifiers, an optional macro, and `exclusive` (tags only).
- **Membership:** `item.flags.cyphersystem.tags` and `item.flags.cyphersystem.recursions`, arrays of tag item IDs. Membership is assigned on the **item sheet**, which we keep using.
- **Activation:** `taggingEngineMain` toggles `system.active` and applies stat and Edge modifiers to pools. It then **archives every tagged item that shares no active tag**. Untagged items and Teen items are untouched.
  - Exclusive tags disable the other active exclusive tag. Only one recursion can be active, and activating it sets the focus.
  - It fires the `enableTag` and `disableTag` hooks and runs the tag's macro.
  - Alt skips the stat changes.
- **Visibility:** the tags tab appears when `settings.general.tags.active` is on and the form is Mask. Recursions appear only when `gameMode == "Strange"`.

### Our UI

- **Tag bar** above the grid: one chip per tag or recursion item, grouped by tag category.
  - Clicking a chip calls `tagMacro` / `recursionMacro`.
  - The chip's active state reads `system.active`.
  - Chips have their own small popover for edit and delete.
- **Grouping modes** are view-only and never write data:
  - **Category** (default): mirrors the default sheet's sections, including the four user-labelled categories for skills, abilities, equipment and tags, plus Spells.
  - **Type.**
  - **Tag:** reads the membership flags; untagged items fall into an "Untagged" group.
- **Archive visibility** follows `settings.general.hideArchive`, the same toggle the default sheet uses. Archived cards render dimmed.
- **Sorting** matches the system, ported from `sorting.js`:
  - Name first.
  - Then the optional rules: skill rating, cypher type, material level or price.
  - Identified items first, then favorites first, then archived items last.
- **Empty groups** follow `settings.general.hideEmptyCategories`.
- Each group header has a **+ button** (§6).

---

## 5. Detail popover

- A singleton on `document.body`, using the native `popover="manual"` attribute for top-layer stacking. It is positioned in JS relative to its card and flips up or down based on viewport space.
- **Closes on:** clicking the same card, opening a different card, Escape, the sheet closing or minimizing, or the sheet being dragged.
  - The Escape handler runs in the capture phase and stops propagation while a popover is open.
- **Re-render safety:** after every sheet render, the module finds the open item's card by `data-item-id` and re-anchors to it. If the item is gone, the popover closes.
- **Content:** the enriched description (with `secrets` for owners), scrollable, with a fixed max-height.
- **Action bar:** contextual per type. This carries every per-item control from the default sheet, so the card itself stays uniform.

| Control | Types | Source behaviour |
|---|---|---|
| Pay points / AiO without roll | ability | `itemRollMacro(..., noRoll=true, ...)` |
| Cast spell | ability (Spell category) | `useRecoveries(actor, true)` + chat |
| Edit | all | `item.sheet.render(true)` |
| Favorite | all | toggles `system.favorite` |
| Quantity ± (Alt = 10) | equipment, ammo, material | `system.basic.quantity` |
| Identify | cypher, artifact | GM: set identified; player: whisper GM |
| Cypher type cycle (Alt = fantastic) | cypher | `system.basic.type` |
| Roll for level | cypher, artifact with formula level | roll, then set level |
| Armor active | armor | `system.active` |
| Temporary | power-shift | `system.basic.temporary` |
| Damage ± | lasting-damage | `system.basic.damage` |
| Send to chat | all | same as d20 fallback |
| **Delete** (confirm dialog) | all | for tag and recursion items: `changeTagStats` + `removeTagFromItem` first, as `actor-sheet.js:735–748` does |

Items also stay draggable to the hotbar for macros, the same as the default sheet.

---

## 6. Item creation

The **+ button** calls core's creation dialog:
`Item.implementation.createDialog({}, { parent: actor, types: [...] })`.
- It is pre-filtered to the group's types.
- For category groups, it presets `system.settings.general.sorting`.
- The system's `preCreateItem` hook still applies the default icon and Teen form.
- The default sheet opens the new item's sheet after creation, and we match that.
- This signature matches dnd5e's V14 usage. Verify it in-client.

---

## 7. Drag and drop onto the sheet

The system's drop logic carries rules: property types go only to PCs and companions, dropped tags arrive inactive, moving unique items gives an archive-or-delete prompt, quantity items get a move dialog, lists get enabled, and cyphers get their identification status.

We delegate drops to `game.cyphersystem.CypherActorSheet.prototype._onDropItem.call(this, event, dropData)` rather than porting that logic.
- **Risk:** that handler uses the legacy `Dialog`.
- **If the legacy `Dialog` is removed:** port the handler into the adapter.

---

## 8. Recovery rolls

- **The row:** one image per recovery slot, in the system's spend order: one-action slots, then ten-minute slots, then one hour, then ten hours.
  - Default: four images, one per timing.
  - Extra slots come from the system's existing settings, `settings.combat.numberOneActionRecoveries` (1–7) and `numberTenMinuteRecoveries` (0–2). These appear in our settings tab under sheet controls. No new data is needed.
  - The slots bind to `system.combat.recoveries.{oneAction…oneAction7, tenMinutes, tenMinutes2, oneHour, tenHours}`.
  - If a character has many slots, the images shrink or wrap so the row stays one line wide.
- **Two states:** available and spent (desaturated with a check overlay).
- **Clicking an available image** calls `recoveryRollMacro(actor, "", true)`, unmodified. The system spends slots in order, so the next available image is highlighted as the primary target.
- **Clicking a spent image** un-spends it, the same as the default sheet's checkbox.
- **Row controls:** a reset button and the roll formula field (`system.combat.recoveries.roll`).
- **Custom timings:** four editable labels in the settings tab, one per timing group.
  - Stored at `flags.<module-id>.recoveryLabels.{action, tenMinutes, oneHour, tenHours}`.
  - Defaults: Action / 10 min / 1 hour / 10 hours.
  - The labels are cosmetic and sheet-only. The system's chat card keeps its standard wording (see §1, "leave the roll engine alone").

---

## 9. Functional parity checklist (default PC sheet → new sheet)

Only the look changes.

- **Header:** name, portrait (multi-roll overlay, disable multi-roll), descriptor / type / focus, additional sentence, tier, Effort, XP ±, advancements plus reset, Mask/Teen switch, and the teen name and descriptor.
- **Pools:** Might, Speed and Intellect, each with value / max / Edge, ±1 (Alt ±10), reset (minus lasting damage), and a stat roll through `rollEngineMain`. Plus the additional pool with its label, Edge and teen variants. Static stats are disabled when locked or multi-roll is active.
- **Combat:** damage track (with the optional extra step and its label), apply-impaired and apply-debilitated toggles, stress, stress levels and supernatural stress, and armor totals.
- **Dice tray:** left, right or hidden, following the world setting `diceTray`.
- **Currency:** 1–6 categories with labels.
- **Text:** notes, GM notes (GM only) and description, all ProseMirror.
- **Permissions:**
  - Limited: description only.
  - Observer, or a locked compendium: all controls disabled.
- **Settings tab:** every field in `settings-pc.html` (list toggles, category labels, game mode, sheet design), plus our recovery labels.
- **Sheet design:** background image, icon and logo customization, as per-actor, teen and world settings. This yields to the `cyphersheets` module when it is active.

---

## 10. Scope

**MVP:** everything above.

**Deferred:**
- Inline editing in the popover.
- Dragging from the popover.
- A custom tag assignment UI (the item sheet already covers it).
- Sheets for NPCs and other actor types.

---

## 11. Principles

- **Leave the system's roll engine alone.** The All-in-One roller and the recovery roll macro are called with the same arguments the default sheet uses. They are never wrapped, patched or reimplemented. Where our UI and their chat output disagree (for example, custom recovery labels), the system's output wins.

---

## 12. Implementation notes (v0.1.x)

Choices made while building the module, following the "UX/UI standards first, troubleshoot after" rule.

- **Card layout.** The value slot sits top-left, marks (cypher type, spell, favorite) top-right, then the image, name, sub-line, and a footer with training and type. The action bar has archive on the left and the d20 in the centre. Non-rolling items keep the d20 in a dashed style, and its tooltip reads "Send to chat".
- **Frame colour** comes from the training level when the item has one, otherwise from its family (skills, combat, abilities, equipment).
- **Card sub-line removed.** Secondary facts such as attack range, armor speed cost and item level appear only in the popover. Temporary power shifts and permanent damage show as small icons next to the favorite star.
- **Popover** has a fixed size: 360px wide, since card width is too narrow to read rules text, and 420px tall. The height shrinks only when the viewport can't fit it. It also closes on an outside click and when its card scrolls out of view. Keyboard opening moves focus into the popover, and Escape returns focus to the card.
- **Toolbar** additions:
  - A family filter (All / Skills / Combat / Abilities / Equipment), which replaces the default sheet's item tabs.
  - A client-side search.
  - "Hide archived", bound to the actor's existing `hideArchive` setting.
- **Armor totals and the dice tray** sit at the right end of the tab bar, to keep the header short.
- **Unknown category values** (for example, a skill whose `sorting` matches no category) fall back to the type's first category instead of disappearing.
- **Theme** follows Foundry: the per-document Theme in Sheet Configuration, else the global UI theme (the nearest `theme-light` / `theme-dark` class). The sheet has its own light and dark palettes covering every surface, and the popover copies the sheet's theme, since it lives outside the sheet.
- **Pool names** can be renamed per actor in the settings tab (`flags.cypher-card-sheet.poolLabels`). The names apply on the sheet only; system chat messages keep the standard names.
- **Movement per action** is a per-actor distance (`flags.cypher-card-sheet.movePerAction`) in scene units. When it is set, the system's token ruler label also shows how many move actions the path costs. The system's range bands and colours are unchanged, and actors without the setting are untouched. This is done by wrapping the ruler's label method, because the system's Token class creates its ruler class directly.
- **Default grouping** is a client setting, "Default card grouping". The sheet remembers the chosen mode per actor for the rest of the session.
- **Untested in a live Foundry client.** The adapter and templates were exercised against the system's `template.json` in a Node harness, and the layout was checked in Chromium. The AppV2 lifecycle hooks (`_onChangeForm`, drag/drop wiring, `<prose-mirror>` saving) need a first in-client test.

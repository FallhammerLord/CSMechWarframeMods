# Cypher System Card Sheet — Design Specification (rev. 2)

A Foundry VTT v14 module that adds a new, alternative PC sheet for the Cypher System. Items display as a Warframe Mods-style card grid. The sheet is a fresh build with its own files. It keeps full functional parity with the system's default PC sheet and changes only the look and feel.

Research baseline: `cyphersystem` **v3.5.2** (requires Foundry 14, verified 14.360). File references below point into that release's source.
- **Popover header and action bar** are `flex: 0 0 auto`; only the description shrinks and scrolls. Before, a long description squeezed the header and cut off the title.
- **Alt-click** state is taken from the click event (`event.altKey`, remembered for 1.5s by a capture listener on the sheet and popover), with Foundry's key tracker as a fallback.
- **Artifact depletion** button (identified artifacts only) parses `basic.depletion`, stripping inline-roll markup: `N in dX`, `N-M in dX`, `N in [[/r dX]]`. It posts a plain roll with a Depleted/Holds line; it doesn't change the item.

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

- **Card layout** (0.3.0-alpha.3). Marks (cypher type, spell, favorite) sit top-right. The body is a three-row grid: name, then the card's number large and centred (weapon damage, armor value, pool cost, XP cost, ammo count), then training. There is no item-type label; the family filter and popover carry it. The action bar has archive on the left and the d20 in the centre. Non-rolling items keep the d20 in a dashed style, and its tooltip reads "Send to chat".
- **Frame colour** comes from the training level when the item has one, otherwise from its family (skills, combat, abilities, equipment).
- **Small cards** are 114px tall (was 104px; raised so a two-line name clears the centred value); the d20 and Worn buttons use the module's own symmetric SVG icons, because Font Awesome's d20 glyph is off-centre in its em box with the item image full-bleed. Name, training and type are overlaid in light text on a dark shade, which stays dark in both themes for contrast. The bottom button row holds the d20, plus a Worn toggle on armor cards, centred together; archive moved to the popover. Names wrap at word boundaries to two lines, then end with an ellipsis; the full name is in the tooltip and popover. Art that fails to load is hidden rather than shown as a broken image. The system's SVG icons are shown contained rather than cropped.
- **Card sub-line removed.** Secondary facts such as attack range, armor speed cost and item level appear only in the popover. Temporary power shifts and permanent damage show as small icons next to the favorite star.
- **Popover placement.** The large card covers the small one, with its bottom edge just above the small card's d20 so the d20 stays clickable. It grows upward, or downward from below the d20 when there's no room above. It unfolds from the card when opening and folds back when closing (170ms / 120ms; off with reduced motion).
- **Popover layout.** Centred title over the item image as a faint (16%) banner. Clicking the title, clicking outside, or pressing Escape closes it; there is no close button. The actions are one row of icon buttons with tooltips, running right to left from a small archive button in the bottom-right corner.
- **Delete** is Alt-click on the archive button, always with a confirmation, matching the system's default sheet. There is no separate delete button.
- **Popover** has a fixed size: 360px wide, since card width is too narrow to read rules text, and 420px tall. The height shrinks only when the viewport can't fit it. It also closes on an outside click and when its card scrolls out of view. Keyboard opening moves focus into the popover, and Escape returns focus to the card.
- **Toolbar** stays fixed between the tab bar and the scrolling card area. Additions:
  - A family filter (All / Skills / Combat / Abilities / Equipment), which replaces the default sheet's item tabs.
  - A client-side search.
  - "Hide archived", bound to the actor's existing `hideArchive` setting.
- **Armor totals and the dice tray** sit at the right end of the tab bar, to keep the header short.
- **Unknown category values** (for example, a skill whose `sorting` matches no category) fall back to the type's first category instead of disappearing.
- **Theme** follows Foundry: the per-document Theme in Sheet Configuration, else the global UI theme (the nearest `theme-light` / `theme-dark` class). The sheet has its own light and dark palettes covering every surface, and the popover copies the sheet's theme, since it lives outside the sheet.
- **Pool names** can be renamed per actor in the settings tab (`flags.cypher-card-sheet.poolLabels`). The names apply on the sheet only; system chat messages keep the standard names.
- **Movement ranges** are four per-actor distances (Immediate, Short, Long, Very Long; `flags.cypher-card-sheet.movementRanges`) in scene units. When any is set, the system's token ruler bands and colours for that actor use them; empty fields keep the system's distances. This is done by wrapping the ruler's label and style methods, because the system's Token class creates its ruler class directly.
- **World sheet design is not used for backgrounds.** Its default (`cypher-blue`, a light gradient) was built for the system's light sheet and showed through this sheet's panels. Backgrounds and icons come only from the actor's own Custom Sheet Design, under a theme-coloured scrim of at least 60%. The world logo is still used, and the black logo is inverted on the dark theme.
- **Tags** keep the system's model: four tag categories, each holding any number of tags.
- **Features tab.** The card tab is called "Features" by default and can be renamed per actor in the settings tab.
- **Minimum sheet width** is measured in the live client after each render (and again once fonts load): portrait + the header at min-content + padding + window chrome, never below 800px (835px tall). It is enforced in `_updatePosition`, so it holds while dragging the resize handle, so the advancement row stays on one line and the header never overlaps.
- **Armor** shows in the damage track panel: an image with the armor total overlaid and the speed cost below. Clicking it opens a menu of the character's armor items with a Worn toggle for each (the system totals worn, unarchived armor items only). The image is set in Settings → Sheet layout (`flags.cypher-card-sheet.armorImage`).
- **Portrait right-click menu:** View character artwork (the same image popout as the Actors directory, with its share button), View token artwork (when the token image differs), and Change portrait.
- **Card text outline:** small-card text has a medium black outline (text shadows, plus a paint-order stroke on the name where supported), so white text reads over bright art. It doesn't change card sizes.
- **Portrait** fills the height of the name/sentence/advancement block. A "Tall portrait" setting (`flags.cypher-card-sheet.portraitTall`) makes it span the header and the pools, for portrait-shaped images; the pools narrow and the minimum width rises from 840px to 880px.
- **Badge** is the low-opacity image in the lower-right corner, set in its own settings panel. It uses the system's own background-icon fields for the actor, so the same badge shows on the default sheet.
- **Recovery slots** glow on hover only, and have no enforced order. Clicking a free slot marks that slot spent and posts a recovery roll; clicking a spent slot frees it. The chat card copies the system's recovery card (text, reroll button, flags) and names the slot's custom label when one is set. Alt rolls without spending. This replaces the system macro for slot clicks only; the macro's in-order spending is what forced the ordering.
- **All-in-One dialog and roll chat cards.** When the rolling actor uses this sheet, the system's roll dialog follows the sheet's dark theme (backgrounds are set inline, since the system's own `!important` gradient outranks stylesheets), and both the dialog and roll chat cards show the actor's custom pool names. Both are applied at render time through hooks; the system's code and stored messages are unchanged.
- **Default grouping** is a client setting, "Default card grouping". The sheet remembers the chosen mode per actor for the rest of the session.
- **Testing.** `tools/harness/` renders every sheet state against the system's `template.json` with Foundry mocked, and `snapshot.mjs` checks refactors for visual changes. Live testing in Foundry is still the final check, since the harness only stands in for core styles.

- **Ammo cards** carry − / + buttons either side of the d20, calling the same quantity adjustment as the large card.
- **Card number colour** comes from the frame: `frame-none` (steel) is silver; trained levels use their `--frame` colour.
- **Item sheets** (system AppV1 `CypherItemSheet`) get `ccs-item-sheet ccs-sys-dark` from a `renderCypherItemSheet` hook when the item's owner uses this sheet and that sheet is dark. Backgrounds are set inline with priority, as for the All-in-One dialog. Unowned items (sidebar, compendium) keep the system's look.
- **Header tooltips:** name and sentence inputs carry `data-tooltip` with their value, kept current by an input listener.
---

## 13. Custom card frames (prototype in 0.3.0-alpha.1)

**Built so far:** world-level frame sets chosen by training level (the GM-owned library from phase 2, limited to one set per level), the default SVG textures (phase 1), and the Glow and Shimmer effects (part of phase 4). The rendering is 3-slice `border-image` driven by one generated `<style>` (`scripts/frames/frames.js`). The settings window, preview and guide are in `scripts/frames/frames-config.js`. The default art comes from `tools/make-frames.py`.

**Not built yet:** per-tag and per-item frames (phase 3).

The original scoping notes follow.

**Goal:** Warframe-style frame art on the small and large cards. Each card gets a top cap and a bottom cap, with frame sets that vary by rarity or theme.

### What a frame set is

A frame set holds up to four images, each a file path chosen with Foundry's FilePicker:

| Slot | Used on | Notes |
|---|---|---|
| Small top | small card, above the art | ~12–16px of the card's 92px height |
| Small bottom | small card, behind the name/d20 row | must leave the d20 row readable and clickable |
| Large top | large card header | sits behind the centred title |
| Large bottom | large card action bar | sits behind the icon row |

- **Colour mode:**
  - *tinted:* the image is used as a CSS mask, and its colour comes from the card's frame colour (training level or family). One asset then covers every rarity.
  - *full-colour:* the image is drawn as-is.
- **Stretch mode:** frames should work at any card width.
  - `border-image` 9-slice: ends stay fixed and the middle stretches. Best for ornate caps.
  - Stretched to the full width. Best for simple bars.

### Where frame sets come from

1. **Built-in defaults:** a few SVG sets shipped in `assets/frames/`, drawn for the module so the licence is clean. SVG keeps them sharp, and tinted mode lets one set cover all four training levels.
2. **World library:** a GM-only settings menu (an AppV2 form) to add, edit and remove frame sets, stored as a world setting. Every sheet in the world can use them.

### Which card gets which frame

Checked in order; the first match wins:

1. **Per item:** `flags.cypher-card-sheet.frame` on the item. This needs a picker in the large card, a new icon in its action bar. It's the first piece of inline editing, which was deferred in §10.
2. **Per tag:** a frame set assigned to a tag (#Stealth cards glow differently). This needs a tag→frame mapping in the actor's settings.
3. **Per training level:** Inability / Practiced / Trained / Specialized, which matches Warframe's bronze/silver/gold rarity.
4. **Per family or type:** skills, combat, abilities, equipment.
5. **Default frame.**

Levels 3–5 fit in the sheet's Settings tab as a small grid of dropdowns.

### Build notes

- **Rendering:** two decorative layers per card (`::before` / `::after`, or two `<span aria-hidden>`), using CSS `background-image` or `mask-image` from custom properties set per card, e.g. `--ccs-frame-top: url(...)`. The browser then caches each image once, which matters with 50+ cards.
- **Height budget:** at 92px there's little room. The caps should overlay the art (the art is already full-bleed) rather than add height. Name and d20 contrast must survive a busy bottom cap, so keep the dark shade under the text.
- **The large card's placement** is measured from the small card's button row. A bottom cap must not move that row.
- **Themes:** tinted frames follow both light and dark automatically. Full-colour frames look the same in both, which is the user's choice.
- **Accessibility:** frames are decorative, so they're hidden from screen readers and never carry meaning that isn't also in text.
- **Coupling:** none with the Cypher System. This is purely module data (world setting plus module flags).

### Suggested phases

| Phase | Scope | Size |
|---|---|---|
| 1 | Tinted built-in SVG frame sets; choose one set per actor; the frame colour already follows training level | small |
| 2 | World frame library (GM menu) with full-colour images; per-actor mapping by training and family | medium |
| 3 | Per-tag and per-item frames, including the large-card picker | medium |
| 4 | Large-card caps and optional animated effects (shimmer on Specialized) | small–medium |

### Decisions needed before building

- Should frames be chosen per actor (each player styles their own sheet), world-wide (GM sets the look), or both, with the actor overriding the world?
- Is per-item frame choice wanted in phase 1, given that it means starting inline editing?
- Should the module ship default art? Drawing a few tasteful SVG sets is part of the work.

---

## 14. Compact layout (built in 0.4.0-alpha.1) and the earlier "standard window" catalogue

**What was built** (a layout change, not a scale; text and 24px targets keep their sizes):
- Per-actor flag `flags.cypher-card-sheet.compact`, blocked while the Additional Pool is on and vice versa (the blocked toggle is disabled with a tooltip; nothing is switched automatically). An actor with both on (e.g. the pool enabled from the default sheet) shows the full layout, and the Compact toggle stays enabled so it can be turned off.
- `.ccs-top.is-compact` uses three equal columns from `--ccs-third`; `.ccs-header` is `display: contents` so the identity block takes two thirds (less the portrait when square) and Tier/Effort/XP takes the third, directly over the third pool. Tall portrait: the portrait spans both rows and the thirds are taken from the remaining width.
- Two sentence rows with equal-width fields; Advancement as icon checkboxes.
- Minimum width: the smallest top row where a third fits both Tier/Effort/XP and a pool's button-and-Edge row (neither shrinks), and the identity block fits its share, measured in the client (`#compactTopWidth`). Floors 520px / 560px. Verified in Chromium: ~570px square, ~650px tall, with no overflow above those widths and the vitals column matching the third pool to the pixel.

The catalogue below was the original scoping.

### Original catalogue: "standard window" (scaled-down) mode

**Goal:** a smaller sheet, about the size of the system's default PC sheet (650 × 750), that keeps every function of the full card sheet.

### Approaches

| Approach | How | Pros | Cons |
|---|---|---|---|
| **A. CSS `zoom`** on `.ccs-root` and the popover | one `--ccs-zoom` value (e.g. 0.85) | fastest to build; layout reflows correctly; clicks and drags hit the right places | text rendering can soften; browser support varies (Chromium/Electron yes, Firefox 126+, Safari yes); needs a check of `getBoundingClientRect` behaviour for popover placement |
| **B. `transform: scale()`** | scale the window content | none worth it | layout doesn't reflow, hit areas and popover maths break; **rejected** |
| **C. Density tokens** | every size (fonts, padding, card size, button size) becomes a variable, and a "compact" set of values replaces them | crisp text; control over what shrinks and what must not | more work: the whole stylesheet has to move to variables |

**Recommendation:** prototype with A to judge the feel, then build C for the real feature.

### What must keep working (test checklist)

- **Large card placement:** measured from the small card's button row; must stay correct at the smaller scale. The popover lives on `<body>`, so it needs the same zoom or density class applied.
- **Minimum width:** already measured from the rendered header, so it adapts on its own. The default window size needs a compact preset.
- **Armor menu, tag chips, search, drag and drop:** hit areas scale with the layout under A or C.
- **Editors and dialogs:** notes editors, FilePicker, the item creation dialog, and the All-in-One dialog (a separate system window, which does not scale with the sheet).
- **Animations:** the open/close timing stays the same; only the sizes change.
- **Themes:** light and dark are unaffected.

### Accessibility limits (these set how small "small" can go)

- **Button size:** WCAG 2.2 AA asks for at least 24 × 24px (2.5.8). Today's d20 and Worn buttons are exactly 24px, so under C they must stay 24px while everything around them shrinks. Under A they would shrink below it.
- **Text size:** the smallest text (card footer, recovery labels) is about 10px today. Readability, including for dyslexic readers, argues for no smaller than about 11px in compact mode. Compact should shrink space, not type.

### Steps to build (C)

1. **Setting:** a client setting, "Sheet size: Full / Standard", saved per user. An optional per-actor override could come later.
2. **Tokens:** move sizes in `card-sheet.css` to variables (`--ccs-font-*`, `--ccs-pad-*`, `--ccs-card-w/h`, `--ccs-btn`, `--ccs-portrait-w`), with values unchanged, and check visually that nothing moved.
3. **Compact values:** add a `.ccs-compact` set of values: tighter padding, 3 pools per row where needed, 128px cards, the stats and recovery strip stacked into two rows, and the toolbar's family filter collapsed into a dropdown.
4. **Apply:** add the class on render and on the popover, with a compact default window size (~680 × 760).
5. **Check:** the minimum width measurement, popover placement, and the target-size and text-size limits above.
6. **Test in the Foundry desktop app plus Chrome and Firefox**, in both themes.

**Size:** A is small (a few hours, plus a round of feedback). C is medium, mostly the token refactor in step 2.

---

## 15. Artifact resource (built in 0.5.0)

A named counter on an artifact: charges, battery, heat. Module data only; the system and the default sheet ignore it but keep it.

**Data** (`flags.cypher-card-sheet.resource` on the artifact):
- `label`: the resource's name ("Charges"). Empty means no resource.
- `value`, `max`.
- `depleteAtZero` (optional): spending the last point triggers the depletion roll.

**Small card:** the resource is the card's centred number (`3 / 5`), its name in the foot line (artifacts have no training label). No −/+ on the small card: the artifact's main action stays the d20, and the button row belongs to sockets (§16). Ammo keeps its own −/+.

**Large card:** a stepper row, `Charges  − 3 / 5 +` (Alt: ten), between the header and the description.

**Editing:** name, current, maximum and "roll depletion at 0" in the system artifact sheet's Settings tab, added through the `renderCypherItemSheet` hook on every artifact (not only card-sheet actors). The inputs are named by flag path, so the system's own form submit saves them.

**Rules:** no automatic recharge; refills are a manual + or an edit. Value stays within 0 to max.

**Must not change existing cards:** nothing renders unless `label` is set. Checked with the harness snapshot: every existing state identical.

## 16. Cypher sockets (designed, not built)

Materia-style slots: an artifact holds up to three cyphers. A socketed cypher stays a normal item on the actor; the artifact stores links to it.

**Eligibility by identifier:**
- Cypher: a **Socketable** toggle, which reveals a **Socket identifier** field (e.g. `ember-rod`).
- Artifact: a **Has sockets** toggle, which reveals the **socket count** (1-3) and a **Socket identifier**.
- A socket's picker lists the actor's unsocketed cyphers that are socketable and whose identifier matches the artifact's (case and surrounding spaces ignored). One identifier per cypher for now; a list can come later if a cypher needs to fit two artifact families.
- An artifact with sockets but no identifier accepts nothing; the picker says to set one.
- Identifiers and the socket count are GM-only. Players socket and unsocket.
- Set identifiers on the Items directory or compendium entries players buy from, so every copy carries them.

**Data:**
- Artifact: `flags.cypher-card-sheet.sockets = {enabled, count: 1-3, key, ids: [cypherId|null, …]}`.
- Cypher: `flags.cypher-card-sheet.socket = {enabled, key, artifactId, reusable, spent}`.

**Rules:**
- Cyphers are single-use. Use posts the cypher to chat as the system does, then removes it; the socket empties. Buying the same cypher again is a new item.
- Campaign option, per cypher: **Reusable**. Use marks it spent instead of removing it. **Refresh sockets** on the large card clears spent marks (after an intervening scene, at the table's call; no automation).
- Socketed cyphers don't count toward the cypher limit: they leave the Cyphers group (and its count) and appear only in their artifact's sockets.
- Housekeeping: a deleted or transferred cypher empties its socket. Transferring the artifact carries its socketed cyphers with it (custom drop handling; the system's drop logic knows nothing of sockets).

**Large card (where socketing happens):** a Sockets section under the facts row, one slot per socket.
- Empty slot: click opens the picker (icon, name, level of each eligible cypher). With none eligible, it names the artifact's identifier.
- Filled slot: cypher icon and name, **Use**, **Unsocket** (returns it to the Cyphers group).
- **Refresh sockets** shows when any socket is spent.

**Small card:** up to three 18px sockets left of the d20, depletion on the right (row ≈ 126px of 148px), spaced so the 24px target-size spacing exception holds. Display only: clicking one opens the large card. States by shape, not only colour:
- empty: dashed ring
- filled: the cypher's icon in a solid ring in the frame colour
- spent: dimmed, with a diagonal slash.

**Editing:** the toggles and identifiers are added to the system's cypher and artifact item sheets (via `renderCypherItemSheet`), since that is where GMs build items.

**Frames:** no new frame sets; sockets take the card's frame colour.

**Build order:** §15 first (small, self-contained), then §16.

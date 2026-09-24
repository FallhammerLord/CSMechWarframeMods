# Changelog

## 0.9.0

- **Effect stars are independent:** minor and major can both be lit, so a banked effect waits for later. A natural 19 or 20 lights its star; no roll clears one. Click a star to turn it on or off. Tooltips read "Minor effect" and "Major effect". A star lit under 0.8.x carries over.
- **Sockets make the large card taller** by the height of the Sockets section, instead of shrinking the description.
- **Any item can link to an artifact** (was attacks only): the Linked artifact field is on every card item's sheet except artifacts. A linked card shows the charge badge and the artifact's sockets; its large card shows the artifact's Charges and Sockets.
- **Equipment shows its level** as the card's number; the quantity moves to the large card. Equipment without a level still shows its quantity.
- Every other card and sheet state is unchanged (snapshot check).

## 0.8.1

- **Fix:** clicking in a window opened from the large card (the socket picker, the use and delete confirmations) no longer closes the large card, and Escape in those windows closes only them.
- **Roll effects are 4-point stars,** stacked on the portrait's left side. Both are clickable: light one by hand, or click a lit one to clear it. Colours follow the training palette, so the high-contrast suite applies: minor is silver (green in high contrast), major is gold (sky blue). Lit is filled and glowing, unlit is an outline, and major is the larger star.

## 0.8.0

- **Socket picker beside the large card:** it opens directly to the right of the large card, or to its left when the card is near the right edge of the screen.
- **Socketed cyphers open their own card:** click a socketed cypher's icon or name to show its large card beside the artifact's, on the side with room. Click again, or its title, to close it; it closes with the main card. Its buttons act on that cypher.
- **XP in the All-in-One dialog** (for actors using this sheet): the pool list includes XP, which the system's cost code already pays from. Abilities that cost XP now open the dialog (the system blocked them) with XP selected.
  - Known system issue, unchanged: the chat card's reroll button errors on an XP-paid roll.
- **Roll effect lights on the portrait:** a Minor / Major pair. A natural 19 lights Minor and a natural 20 lights Major (not while Impaired); the character's next roll replaces it, and clicking a lit one turns it off once used. Lit is filled and solid, unlit is dim and dashed.
- Every other card and sheet state is unchanged (snapshot check).

## 0.7.0 — linked attacks

- **Attacks can link to an artifact (spec §17):** for artifacts that are also attacks, such as a Fire Rod. The GM picks a **Linked artifact** on the attack's item sheet (Settings tab). Several attacks can link to one artifact.
  - The artifact keeps the only copy of its charges and sockets; linked attack cards read and act on it, so every card always agrees.
  - Attack small card: damage and training unchanged; a charge badge (`3/5`) in the top-left corner, and the artifact's sockets beside the d20.
  - Attack large card: the artifact's Charges stepper and Sockets section, labelled with the artifact's name.
  - Charges are spent by hand; rolling an attack doesn't spend one.
- The link is by item id within one character: moving both items to another character needs the link picked again.
- Every existing card and sheet state is unchanged (snapshot check).

## 0.6.0 — cypher sockets

- **Cypher sockets (spec §16):** artifacts can hold up to three cyphers, materia-style.
  - GM setup, in the system item sheets' Settings tab: an artifact gets **Has sockets**, a count (1 to 3) and a **socket identifier**; a cypher gets **Socketable**, an identifier and **Reusable after refresh**. Identifiers match ignoring case and surrounding spaces. Players can see but not change these.
  - Large card: a Sockets section. Click an empty socket to choose from the character's unsocketed, identified cyphers with a matching identifier. Filled sockets have **Use** and **Unsocket**.
  - **Use** posts the cypher to chat. A single-use cypher is then archived and leaves its socket (after a confirmation); a reusable one is marked spent until **Refresh sockets**.
  - Small card: sockets sit left of the d20, depletion to its right. Empty is a dashed ring, filled shows the cypher, spent is dimmed with a slash. Screen readers get a summary.
  - Socketed cyphers leave the Cyphers group and its count, so they don't count toward the cypher limit.
  - Each cypher stores its own placement, so a deleted or given-away cypher just leaves its socket empty, and one that no longer fits returns to the Cyphers group.
- **Not yet:** giving a socketed artifact to another character doesn't carry its cyphers along. They stay with the original owner, back in the Cyphers group.
- Every existing card and sheet state is unchanged (snapshot check).

## 0.5.0 — artifact resource

- **Artifact resource (spec §15):** a named counter on an artifact, such as Charges.
  - Set it in the artifact's item sheet, Settings tab: name, current, maximum, and "Roll depletion when it reaches 0". The fields appear on every artifact sheet; an empty name means no resource.
  - Small card: the counter is the card's number (`3 / 5`), with its name in the foot line. The level moves to the large card.
  - Large card: a − / + stepper (Alt: ten), kept between 0 and the maximum. Reaching 0 rolls depletion when that option is on.
  - Stored in module flags: the default sheet ignores it but keeps it.
- Every existing card and sheet state is unchanged (snapshot check).

## 0.4.2

- **Rank pips readable:** the training pips on the bottom frame caps are about three times larger (roughly 7.5px on screen, up from 2.4px), with a dark outline against the plate. The small card's bottom cap is 22px tall (was 18px), matching the large card; the bottom caps drop their corner rivets to make room.

## 0.4.1 — code tidy-up

No intended visual or behaviour change except the first item.

- **Frames settings window:** its preview cards now use the sheet's own card template, so they always match real cards. They had drifted to an older layout.
- **Stylesheet consolidated:** override layers merged back into one rule per element, dead rules removed (unused classes, the tag-chip hover reveal that never applied), repeated text outline and dark-window palettes shared. About 300 lines shorter, 15 → 10 `!important` (the rest beat inline, system or core styles).
- **Adapter split** into topic files (`shared`, `actor`, `options`, `items`, `item-actions`) behind the same `cypher.js` import, so no caller changed.
- **Comments shortened** throughout; stale ones corrected.
- **Test harness committed** in `tools/harness/`, with a visual regression check (`snapshot.mjs`) that compares every element's computed style, including forced hover and focus, against a baseline.

## 0.4.0-alpha.2

- **Fix:** at the compact minimum width the pools' Edge field was squeezed. The −/+/reset buttons and Edge no longer shrink, and the compact minimum width now counts that row as well as Tier/Effort/XP, so the window stops before anything is crushed.
- **Compact pools:** a little less spacing (pool side padding 6→4px, gaps 4→3px, buttons 26→24px, the WCAG minimum target size).

## 0.4.0-alpha.1 (compact layout)

- **Compact layout** (per actor, Settings → Sheet layout):
  - Three pools; Tier, Effort and XP sit directly above the third pool, on the same column.
  - Sentence in two rows: "Name *is a* Descriptor Type" / "*who* Focus (additional sentence)", equal-width fields that never run past the second pool. Full text is in each field's tooltip.
  - Advancement as icon checkboxes (pools, effort, edge, skill, other): outlined when open, filled when taken; the name is the tooltip.
  - Minimum width drops from 800px to about 570px (square portrait) or 650px (tall), measured in the client. Below that, fields would overlap.
  - The world logo slot is hidden, since it used the fourth pool position.
- **Compact and Additional Pool exclude each other:** while one is on, the other's toggle is greyed out with a tooltip saying which to turn off. Neither is ever switched for the player; the Additional Pool is a system setting the default sheet also reads.

**Stable before this:** 0.3.0, commit `b649631` (local tag `v0.3.0`).

## 0.3.0 — stable

The card frames prototype (0.3.0-alpha.1 to alpha.4), tested in a live world and marked stable. No changes since alpha.4. Highlights:

- Warframe-style card frames by skill training, with a GM settings window and a high-contrast suite for colour-blind players.
- Small cards with a large centred number; ammo −/+ and artifact depletion buttons on the card.
- Dark item sheets and roll dialog for actors using this sheet.
- Sentence field tooltips; large card header and Alt-click delete fixes.

## 0.3.0-alpha.4

- **Ammo cards:** − and + buttons flank the d20 (Alt: ten at a time, as in the large card).
- **Card number colour follows the frame:** untrained cards (steel frame) show their number in silver instead of the family colour. Trained levels keep their frame colour.
- **Dark item sheets:** the system's item sheets (every type: ability, skill, attack, cypher, artifact, and so on) follow the card sheet's dark theme when the item belongs to an actor using this sheet. Tabs, fields, the description editor, the settings lists and the cypher-type icon are restyled; the system's code is unchanged.
- **Sentence tooltips:** the name, descriptor, type, focus and additional sentence fields show their full text on hover, so long entries cut off by sheet width can be read without clicking in. The tooltip updates as you type.

## 0.3.0-alpha.3

- **Small cards, new layout:** the card's number sits large and centred, clear of the frame caps: weapon damage, armor value, pool cost, XP cost, or ammo count. Name above it, training below. The item-type label ("Ability", "Skill") is gone; the family filter and large card still show it. Cards are 114px tall so two-line names and the value never overlap.
- **Artifact depletion roll:** identified artifacts get a battery button beside the d20. It reads the depletion text ("1 in d6", "1-2 in d10", "1 in [[/r d6]]"), rolls the die, and posts the result with "Depleted" or "Holds". Unreadable text shows a warning instead of rolling.
- **Fix:** the large card's title no longer gets cut off. The header and action bar were shrinking inside the fixed-height card when the description was long; now only the description scrolls.
- **Fix:** Alt-click on the large card's archive button deletes (after confirmation). The Alt state is read from the click itself, since Foundry's key tracker could miss it.

## 0.3.0-alpha.2

- **Fix:** the Card frames settings window now opens. Its template rendered two root elements, and AppV2 requires one.
- **High-contrast frame suite for colour-blind players:** red, orange, green and sky blue, tuned from the Okabe–Ito palette. In simulation, every pair of tiers stays at least ΔE 31 apart for normal, protan, deutan and tritan colour vision; bronze/silver/gold falls to 13. It's a second suite in the GM settings window with its own textures, and each actor switches to it in Settings → Sheet layout.
- **Rank pips as a non-colour cue:** Inability 0 (cracks instead), Practiced 1, Trained 2, Specialized 3.
- **Large card:** takes its card's frame and effect (the Specialized shimmer included); header padding clears the top cap; the title uses the same black outline as the small cards.

## 0.3.0-alpha.1 (prototype: mod textures)

- **Card frames:** Warframe-style top and bottom caps on the small and large cards. They're chosen by skill training level (No training / Inability / Practiced / Trained / Specialized, drawn as Steel / Damaged / Bronze / Silver / Gold), set by the GM for the whole world.
- **Default textures:** five built-in SVG sets that grow more ornate with rarity: rivets, chevrons, rank pips, and a gem on Specialized. Optional Glow (Trained) and Shimmer (Specialized) effects.
- **Card frames settings window** (Module Settings, GM only): per-level images, end width, image height and effect, with a live preview and a guide to making frame images.
- **Fix:** small-card text padding now holds against core button styles, so names no longer ride up into the value line.

**Working version before this prototype:** 0.2.0, commit `e6bf957` (local tag `v0.2.0`).


## 0.2.0 — working card sheet

The first version tested in a live Foundry v14 world. Everything below is on the sheet.

- **Sheet:** AppV2 alternative PC sheet with full parity with the default Cypher System sheet. It follows Foundry's light and dark themes and has a measured minimum width.
- **Cards:** a grid of uniform cards with full-bleed art, grouped by category, type or tag, with a family filter and search in a fixed toolbar.
- **Large card:** covers the small card, leaving the d20 visible, with an open/close animation and an icon action bar. Archive is in the corner; Alt-click deletes.
- **Rolls:** the d20 calls the system's All-in-One roller unchanged. The roll dialog follows the dark theme, and roll chat cards show custom pool names.
- **Recovery rolls:** can be used in any order, with custom timing labels.
- **Armor:** a tile showing the total and speed cost, with a Worn menu; armor cards have a Worn toggle.
- **Portrait:** square or tall, with a right-click menu to view artwork. Plus a badge image and custom pool names.
- **Movement:** per-actor ranges that re-band the token ruler.

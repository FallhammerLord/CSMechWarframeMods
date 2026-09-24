# Changelog

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

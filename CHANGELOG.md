# Changelog

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

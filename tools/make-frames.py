"""
Generate the default card frame caps (assets/frames/*.svg).

Each cap is 512 x 64. The outer 96 px at each end hold the corner arms and ornaments and are
drawn unscaled; the middle 320 px is stretched horizontally, so everything in it is uniform
from left to right (horizontal bands and lines only). Bottom caps mirror the top caps.

Rarity ladder, inspired by Warframe's mod rarities, from plain to ornate:
  none (steel) -> inability (damaged) -> practiced (bronze) -> trained (silver) -> specialized (gold)

Run: python3 tools/make-frames.py
"""

from pathlib import Path

W, H, END = 512, 64, 96
OUT = Path(__file__).resolve().parent.parent / "assets" / "frames"

# Rank pips double as a non-colour cue: Inability 0 (it has cracks instead), then 1, 2, 3.
PALETTES = {
    "none":        dict(hi="#4a5363", lo="#1f252e", edge="#8893a1", accent="#a9b4c2", pips=0),
    "inability":   dict(hi="#6b2a24", lo="#2a100e", edge="#c0503f", accent="#e8735b", pips=0),
    "practiced":   dict(hi="#9a6532", lo="#4a2d12", edge="#dba466", accent="#f4c894", pips=1),
    "trained":     dict(hi="#b4bfcb", lo="#505a67", edge="#eef3f8", accent="#ffffff", pips=2),
    "specialized": dict(hi="#e0b23e", lo="#6e4a0c", edge="#ffe596", accent="#fff6cf", pips=3),
}

# High-contrast suite for colour-blind players: red, orange, green, sky blue, tuned from the
# Okabe-Ito palette so every pair stays apart (CIELAB dE >= 31) under protanopia,
# deuteranopia and tritanopia simulation (Machado 2009), as well as normal vision.
PALETTES_HC = {
    "none":        dict(hi="#e1e5ea", lo="#737b87", edge="#ffffff", accent="#ffffff", pips=0),
    "inability":   dict(hi="#d9621a", lo="#6e2c00", edge="#ffb07a", accent="#ffd6b8", pips=0),
    "practiced":   dict(hi="#ffc23d", lo="#9c6d00", edge="#ffe29a", accent="#fff3d1", pips=1),
    "trained":     dict(hi="#10a877", lo="#004d36", edge="#7fe6c2", accent="#d4fff0", pips=2),
    "specialized": dict(hi="#c2e8ff", lo="#4d93bf", edge="#eaf7ff", accent="#ffffff", pips=3, gem="gold"),
}

# Plate outline: bottom edge is flat at y=26 across the whole middle; the ends carry side arms.
PLATE = "M0,0 H512 V58 L503,62 L494,34 L468,26 H44 L18,34 L9,62 L0,58 Z"


def mirror_x(content):
    """Right-hand copy of left-end ornaments."""
    return f'<g transform="translate({W},0) scale(-1,1)">{content}</g>'


def ornaments(kind, p, bottom=False):
    """Left-end ornaments (x < 96); mirrored to the right end. Bottom caps keep only the
    corner details, leaving room for the rank pips."""
    parts = []
    if kind == "inability":
        # Cracks and a chipped arm: the "damaged mod" look.
        parts.append(f'<path d="M30,4 L38,12 L33,18 L44,24" fill="none" stroke="#120706" stroke-width="2.2" stroke-linecap="round"/>')
        parts.append(f'<path d="M62,2 L58,10 L66,15" fill="none" stroke="#120706" stroke-width="1.8" stroke-linecap="round"/>')
        parts.append(f'<path d="M9,44 L14,48 L10,53" fill="none" stroke="{p["accent"]}" stroke-width="1.5" opacity="0.8"/>')
    if kind in ("practiced", "trained", "specialized") and not bottom:
        # Rivets near the corner (the bottom cap gives the space to the rank pips).
        parts.append(f'<circle cx="26" cy="13" r="3.2" fill="{p["lo"]}" stroke="{p["edge"]}" stroke-width="1.4"/>')
    if kind in ("trained", "specialized") and not bottom:
        # Chevrons pointing inward.
        for x in (52, 64, 76):
            parts.append(f'<path d="M{x},7 L{x + 7},13 L{x},19" fill="none" stroke="{p["accent"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>')
    if kind == "specialized":
        # Gem on the arm and a filigree curl.
        parts.append('<path d="M14,40 L19,34 L24,40 L19,47 Z" fill="url(#gem)" stroke="#e8fbff" stroke-width="1" filter="url(#glow)"/>')
        if not bottom:
            parts.append(f'<path d="M34,22 C40,30 50,30 54,24 C57,19 52,15 48,19" fill="none" stroke="{p["accent"]}" stroke-width="1.6" stroke-linecap="round"/>')
    return "".join(parts)


def pips(p):
    """Rank pips in both ends of the bottom cap (drawn in top-cap coordinates, then mirrored).
    Sized to read as information at card scale (~7.5px), with a dark outline for
    contrast against the plate, and kept inside the unstretched end (x < 96)."""
    out = []
    for i in range(p["pips"]):
        x = 32 + i * 24
        out.append(f'<rect x="{x - 7.75}" y="5.25" width="15.5" height="15.5" transform="rotate(45 {x} 13)" '
                   f'fill="{p["accent"]}" stroke="{p["lo"]}" stroke-width="2"/>')
    return "".join(out)


def cap(kind, bottom, palettes=PALETTES):
    p = palettes[kind]
    gem = ('<stop offset="0" stop-color="#fffbe0"/><stop offset="0.5" stop-color="#f0e442"/><stop offset="1" stop-color="#8a7a00"/>'
           if p.get("gem") == "gold" else
           '<stop offset="0" stop-color="#e8fbff"/><stop offset="0.5" stop-color="#5fe3ff"/><stop offset="1" stop-color="#1b6b8a"/>')
    defs = f'''<defs>
  <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{p["hi"]}"/><stop offset="1" stop-color="{p["lo"]}"/>
  </linearGradient>
  <radialGradient id="gem" cx="0.4" cy="0.35" r="0.8">{gem}</radialGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>'''
    body = [
        f'<path d="{PLATE}" fill="url(#plate)" opacity="0.94"/>',
        f'<path d="{PLATE}" fill="none" stroke="{p["edge"]}" stroke-width="2" stroke-linejoin="round"/>',
        f'<path d="M4,4 H508" stroke="{p["accent"]}" stroke-width="1.2" opacity="0.55"/>',
        f'<path d="M44,20 H468" stroke="{p["edge"]}" stroke-width="1.2" opacity="0.7"/>',
    ]
    if kind in ("trained", "specialized"):
        body.append(f'<path d="M44,16 H468" stroke="{p["edge"]}" stroke-width="0.8" opacity="0.45"/>')
    left = ornaments(kind, p, bottom) + (pips(p) if bottom else "")
    body.append(left + mirror_x(left))
    content = "".join(body)
    if bottom:
        content = f'<g transform="translate(0,{H}) scale(1,-1)">{content}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'{defs}{content}</svg>\n')


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for prefix, palettes in (("", PALETTES), ("hc-", PALETTES_HC)):
        for kind in palettes:
            (OUT / f"{prefix}{kind}-top.svg").write_text(cap(kind, bottom=False, palettes=palettes))
            (OUT / f"{prefix}{kind}-bottom.svg").write_text(cap(kind, bottom=True, palettes=palettes))
    print("wrote", (len(PALETTES) + len(PALETTES_HC)) * 2, "caps to", OUT)

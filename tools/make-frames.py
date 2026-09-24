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

PALETTES = {
    "none":        dict(hi="#4a5363", lo="#1f252e", edge="#8893a1", accent="#a9b4c2", pips=0),
    "inability":   dict(hi="#6b2a24", lo="#2a100e", edge="#c0503f", accent="#e8735b", pips=1),
    "practiced":   dict(hi="#9a6532", lo="#4a2d12", edge="#dba466", accent="#f4c894", pips=1),
    "trained":     dict(hi="#b4bfcb", lo="#505a67", edge="#eef3f8", accent="#ffffff", pips=2),
    "specialized": dict(hi="#e0b23e", lo="#6e4a0c", edge="#ffe596", accent="#fff6cf", pips=3),
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
    if kind in ("practiced", "trained", "specialized"):
        # Rivets near the corner.
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
    """Rank pips in both ends of the bottom cap (drawn in top-cap coordinates, then mirrored)."""
    out = []
    for i in range(p["pips"]):
        x = 44 + i * 13
        out.append(f'<rect x="{x - 3}" y="11" width="6" height="6" transform="rotate(45 {x} 14)" fill="{p["accent"]}" opacity="0.95"/>')
    return "".join(out)


def cap(kind, bottom):
    p = PALETTES[kind]
    defs = f'''<defs>
  <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{p["hi"]}"/><stop offset="1" stop-color="{p["lo"]}"/>
  </linearGradient>
  <radialGradient id="gem" cx="0.4" cy="0.35" r="0.8">
    <stop offset="0" stop-color="#e8fbff"/><stop offset="0.5" stop-color="#5fe3ff"/><stop offset="1" stop-color="#1b6b8a"/>
  </radialGradient>
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
    for kind in PALETTES:
        (OUT / f"{kind}-top.svg").write_text(cap(kind, bottom=False))
        (OUT / f"{kind}-bottom.svg").write_text(cap(kind, bottom=True))
    print("wrote", len(PALETTES) * 2, "caps to", OUT)

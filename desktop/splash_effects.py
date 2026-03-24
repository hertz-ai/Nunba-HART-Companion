"""
splash_effects.py - Animated splash screen engine for Nunba.

All text is rendered via native tkinter canvas text (perfect complex-script
shaping for Tamil, Hindi, etc.). Only graphical elements (hexagons, divider,
version badge) use PIL. The hero animation is a typewriter effect on "NUNBA",
followed by one of 10 greeting effects that rotate each launch (round-robin).

Architecture:
  - Native canvas text for all scripts (Tamil, Devanagari, etc.)
  - PIL for graphical elements (hexagons, divider, badges)
  - PIL for typewriter NUNBA frames (plain Latin, anti-aliased)
  - 10 greeting effects enter from outside the frame edges
"""

import json
import math
import os
import random

# ═══════════════════════════════════════════════════════════════
#  PIL RENDERING ENGINE
# ═══════════════════════════════════════════════════════════════

_HAS_PIL = False
try:
    from PIL import Image as _PILImage
    from PIL import ImageDraw as _PILDraw
    from PIL import ImageFont as _PILFont
    from PIL import ImageTk as _PILTk
    _HAS_PIL = True
except ImportError:
    pass

import sys as _sys

_BUNDLED_FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   'assets', 'fonts')


def _resolve_font_paths():
    """Build font path dict — checks bundled assets/fonts/ first, then system."""
    paths = {}

    # 1. Check bundled fonts (ship these with the app for cross-platform guarantee)
    bundled_map = {
        'nirmala': 'NotoSansTamil-Regular.ttf',
        'consolas': 'JetBrainsMono-Regular.ttf',
        'bahnschrift': 'Inter-Regular.ttf',
        'segoeui': 'Inter-Regular.ttf',
    }
    for key, filename in bundled_map.items():
        bpath = os.path.join(_BUNDLED_FONTS_DIR, filename)
        if os.path.exists(bpath):
            paths[key] = bpath
    if len(paths) == len(bundled_map):
        return paths  # all bundled fonts found — skip system lookup

    # 2. Fallback to system fonts
    plat = _sys.platform
    if plat == 'win32':
        windir = os.environ.get('WINDIR', 'C:/Windows')
        paths = {
            'nirmala': os.path.join(windir, 'Fonts', 'Nirmala.ttf'),
            'consolas': os.path.join(windir, 'Fonts', 'consola.ttf'),
            'bahnschrift': os.path.join(windir, 'Fonts', 'bahnschrift.ttf'),
            'segoeui': os.path.join(windir, 'Fonts', 'segoeui.ttf'),
        }
    elif plat == 'darwin':
        # macOS — use system fonts, fall back to Noto for Indic
        lib = '/Library/Fonts'
        sys_lib = '/System/Library/Fonts'
        supp = '/System/Library/Fonts/Supplemental'
        paths = {
            'nirmala': (os.path.join(lib, 'NotoSansTamil-Regular.ttf')
                        if os.path.exists(os.path.join(lib, 'NotoSansTamil-Regular.ttf'))
                        else os.path.join(supp, 'Arial Unicode.ttf')),
            'consolas': os.path.join(sys_lib, 'Menlo.ttc'),
            'bahnschrift': os.path.join(sys_lib, 'Helvetica.ttc'),
            'segoeui': os.path.join(sys_lib, 'Helvetica.ttc'),
        }
    else:
        # Linux — use Noto / Liberation fonts
        share = '/usr/share/fonts'
        paths = {
            'nirmala': os.path.join(share, 'truetype/noto/NotoSansTamil-Regular.ttf'),
            'consolas': os.path.join(share, 'truetype/liberation/LiberationMono-Regular.ttf'),
            'bahnschrift': os.path.join(share, 'truetype/liberation/LiberationSans-Regular.ttf'),
            'segoeui': os.path.join(share, 'truetype/liberation/LiberationSans-Regular.ttf'),
        }
    # Filter out paths that don't exist — _pil_font will fallback to default
    return {k: v for k, v in paths.items() if os.path.exists(v)}

_FONT_PATHS = _resolve_font_paths()

# Canvas font fallbacks per platform (tkinter uses font family names, not paths)
if _sys.platform == 'darwin':
    _CANVAS_FONTS = {
        'tamil': 'Tamil Sangam MN',    # macOS Tamil
        'mono': 'Menlo',
        'sans': 'Helvetica Neue',
        'heading': 'Helvetica Neue',
    }
elif _sys.platform == 'win32':
    _CANVAS_FONTS = {
        'tamil': 'Nirmala UI',
        'mono': 'Consolas',
        'sans': 'Segoe UI',
        'heading': 'Bahnschrift',
    }
else:
    _CANVAS_FONTS = {
        'tamil': 'Noto Sans Tamil',
        'mono': 'Liberation Mono',
        'sans': 'Liberation Sans',
        'heading': 'Liberation Sans',
    }
_font_cache = {}
# Store all PhotoImage refs here to prevent GC
_photo_store = []

# DPI scale: tkinter uses screen DPI (~96), PIL uses 72. Factor = 96/72 ≈ 1.33
_DPI = 1.35

# Map Windows font family names → platform-appropriate equivalent at runtime.
# This lets all canvas.create_text() calls keep using familiar names.
_FONT_MAP = {
    'Nirmala UI': _CANVAS_FONTS['tamil'],
    'Consolas': _CANVAS_FONTS['mono'],
    'Segoe UI': _CANVAS_FONTS['sans'],
    'Bahnschrift': _CANVAS_FONTS['heading'],
    'Bahnschrift Light': _CANVAS_FONTS['heading'],
}


def _f(family):
    """Resolve a font family name to the platform equivalent."""
    return _FONT_MAP.get(family, family)


def _pil_font(name, size):
    """Get cached PIL ImageFont."""
    key = (name, size)
    if key not in _font_cache:
        path = _FONT_PATHS.get(name)
        try:
            _font_cache[key] = _PILFont.truetype(path, size) if path else _PILFont.load_default()
        except Exception:
            try:
                _font_cache[key] = _PILFont.load_default()
            except Exception:
                _font_cache[key] = None
    return _font_cache[key]


def _hex_rgba(c, a=255):
    """Convert '#RRGGBB' to RGBA tuple."""
    h = c.lstrip('#')
    if len(h) >= 6:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
    return (255, 255, 255, a)


def _render_text(text, font_name, size, color, shadow=True):
    """Render anti-aliased text to PhotoImage. Returns (PhotoImage, width, height) or None."""
    if not text or not _HAS_PIL:
        return None
    pil_size = max(int(size * _DPI), 8)
    font = _pil_font(font_name, pil_size)
    if font is None:
        return None
    try:
        bbox = font.getbbox(text)
    except Exception:
        return None
    pad = 6
    w = max(bbox[2] - bbox[0] + pad * 2, 1)
    h = max(bbox[3] - bbox[1] + pad * 2, 1)
    img = _PILImage.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = _PILDraw.Draw(img)
    ox, oy = -bbox[0] + pad, -bbox[1] + pad
    if shadow:
        draw.text((ox + 1, oy + 1), text, fill=(0, 0, 0, 90), font=font)
    draw.text((ox, oy), text, fill=_hex_rgba(color), font=font)
    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, w, h)



def _render_dot(radius, color_hex, alpha=220):
    """Render a single anti-aliased dot/particle sprite. Returns (PhotoImage, sz, sz)."""
    if not _HAS_PIL:
        return None
    sz = int(radius * 2 + 4)
    img = _PILImage.new('RGBA', (sz, sz), (0, 0, 0, 0))
    draw = _PILDraw.Draw(img)
    c = sz // 2
    r, g, b = _hex_rgba(color_hex)[:3]
    # Soft glow halo
    if radius >= 2:
        draw.ellipse([c - radius - 1, c - radius - 1, c + radius + 1, c + radius + 1],
                     fill=(r, g, b, alpha // 4))
    draw.ellipse([c - radius, c - radius, c + radius, c + radius],
                 fill=(r, g, b, alpha))
    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, sz, sz)


def _render_ring(radius, color_hex, alpha=180):
    """Render an anti-aliased ring/circle outline. Returns (PhotoImage, sz, sz)."""
    if not _HAS_PIL:
        return None
    sz = int(radius * 2 + 6)
    img = _PILImage.new('RGBA', (sz, sz), (0, 0, 0, 0))
    draw = _PILDraw.Draw(img)
    c = sz // 2
    rgba = _hex_rgba(color_hex)[:3] + (alpha,)
    draw.ellipse([c - radius, c - radius, c + radius, c + radius],
                 outline=rgba, width=2)
    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, sz, sz)


# Cache of pre-rendered dots by (radius, color) to avoid duplicates
_dot_cache = {}


def _get_dot(radius, color_hex, alpha=220):
    """Get a cached PIL dot sprite. Returns PhotoImage or None."""
    key = (radius, color_hex, alpha)
    if key not in _dot_cache:
        r = _render_dot(radius, color_hex, alpha)
        _dot_cache[key] = r[0] if r else None
    return _dot_cache[key]


def _render_neutron_star(radius=22):
    """Render a neutron star: bright core, orbital ellipses, orbiting particles.

    Compact and elegant — used on the right-side branding panel.
    """
    if not _HAS_PIL:
        return None
    pad = 6
    sz = radius * 2 + pad * 2
    img = _PILImage.new('RGBA', (sz, sz), (0, 0, 0, 0))
    draw = _PILDraw.Draw(img)
    c = sz // 2

    CORE = (108, 99, 255)       # #6C63FF indigo
    RING = (108, 99, 255, 50)   # faint orbital
    GLOW = (108, 99, 255, 25)
    PARTICLE = (0, 229, 255)    # #00E5FF cyan
    WARM = (255, 160, 0)        # #FFA000 saffron

    # Outer glow halo
    for gr in range(radius + 4, radius - 1, -1):
        a = max(int(20 * (1 - (gr - radius + 1) / 5)), 2)
        draw.ellipse([c - gr, c - gr, c + gr, c + gr],
                     outline=(*CORE[:3], a))

    # 3 tilted orbital ellipses
    import math as _m
    for tilt, alpha in [(0.35, 40), (0.60, 35), (0.85, 30)]:
        pts = []
        for i in range(60):
            angle = _m.radians(i * 6)
            x = c + radius * 0.9 * _m.cos(angle)
            y = c + radius * 0.9 * _m.sin(angle) * tilt
            # Rotate the ellipse slightly
            rot = _m.radians(tilt * 50)
            rx = c + (x - c) * _m.cos(rot) - (y - c) * _m.sin(rot)
            ry = c + (x - c) * _m.sin(rot) + (y - c) * _m.cos(rot)
            pts.append((rx, ry))
        for j in range(len(pts) - 1):
            draw.line([pts[j], pts[j + 1]],
                      fill=(*CORE[:3], alpha), width=1)

    # Orbiting particles (small bright dots on the rings)
    for angle_deg, tilt, color in [(30, 0.35, PARTICLE), (150, 0.60, WARM),
                                    (270, 0.85, PARTICLE), (90, 0.35, WARM),
                                    (210, 0.60, PARTICLE)]:
        angle = _m.radians(angle_deg)
        rot = _m.radians(tilt * 50)
        x = c + radius * 0.9 * _m.cos(angle)
        y = c + radius * 0.9 * _m.sin(angle) * tilt
        px = c + (x - c) * _m.cos(rot) - (y - c) * _m.sin(rot)
        py = c + (x - c) * _m.sin(rot) + (y - c) * _m.cos(rot)
        pr = 2
        draw.ellipse([px - pr, py - pr, px + pr, py + pr],
                     fill=(*color[:3], 200))

    # Bright core
    core_r = max(radius // 5, 3)
    draw.ellipse([c - core_r - 2, c - core_r - 2,
                  c + core_r + 2, c + core_r + 2],
                 fill=(*CORE[:3], 80))
    draw.ellipse([c - core_r, c - core_r, c + core_r, c + core_r],
                 fill=(*CORE[:3], 220))
    # Hot white center
    draw.ellipse([c - 1, c - 1, c + 1, c + 1],
                 fill=(255, 255, 255, 255))

    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, sz, sz)


def _render_divider(width):
    """Render festival-gradient divider (amber→pink→purple, faded edges)."""
    if not _HAS_PIL:
        return None
    h = 3
    img = _PILImage.new('RGBA', (width, h), (0, 0, 0, 0))
    # Gradient: transparent → amber → pink → purple → transparent
    colors = [
        (255, 160, 0),    # #FFA000 amber
        (233, 30, 99),    # #E91E63 pink
        (156, 39, 176),   # #9C27B0 purple
    ]
    for x in range(width):
        t = x / max(width - 1, 1)
        # Edge fade
        alpha = int(min(t * 5, (1 - t) * 5, 1.0) * 200)
        # Color gradient across 3 stops
        if t < 0.5:
            t2 = t * 2
            r = int(colors[0][0] + (colors[1][0] - colors[0][0]) * t2)
            g = int(colors[0][1] + (colors[1][1] - colors[0][1]) * t2)
            b = int(colors[0][2] + (colors[1][2] - colors[0][2]) * t2)
        else:
            t2 = (t - 0.5) * 2
            r = int(colors[1][0] + (colors[2][0] - colors[1][0]) * t2)
            g = int(colors[1][1] + (colors[2][1] - colors[1][1]) * t2)
            b = int(colors[1][2] + (colors[2][2] - colors[1][2]) * t2)
        img.putpixel((x, 1), (r, g, b, alpha))
    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, width, h)


def _render_version_badge(text='v2.0.0', color='#6C63FF'):
    """Render the version badge."""
    if not _HAS_PIL:
        return None
    font = _pil_font('bahnschrift', int(9 * _DPI))
    if not font:
        return None
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    w, h = tw + 20, th + 12
    img = _PILImage.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = _PILDraw.Draw(img)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=4,
                           fill=(18, 16, 32, 255), outline=_hex_rgba(color))
    draw.text(((w - tw) // 2 - bbox[0], (h - th) // 2 - bbox[1]),
              text, fill=_hex_rgba(color), font=font)
    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, w, h)


# ═══════════════════════════════════════════════════════════════
#  SPLASH ELEMENT DEFINITIONS
# ═══════════════════════════════════════════════════════════════

# Greetings for the greeting effects
GREETINGS = [
    ('\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD!', 'Vanakkam!', 'Tamil', '#FFA000'),
    ('\u0928\u092E\u0938\u094D\u0924\u0947!', 'Namaste!', 'Hindi', '#E91E63'),
    ('\u09A8\u09AE\u09B8\u09CD\u0995\u09BE\u09B0!', 'Nomoshkar!', 'Bengali', '#00BCD4'),
    ('\u0C28\u0C2E\u0C38\u0C4D\u0C15\u0C3E\u0C30\u0C02!', 'Namaskaram!', 'Telugu', '#9C27B0'),
    ('\u0CA8\u0CAE\u0CB8\u0CCD\u0C95\u0CBE\u0CB0!', 'Namaskara!', 'Kannada', '#00BFA5'),
    ('\u0D28\u0D2E\u0D38\u0D4D\u0D15\u0D3E\u0D30\u0D02!', 'Namaskaram!', 'Malayalam', '#FFA000'),
    ('\u0AA8\u0AAE\u0AB8\u0ACD\u0AA4\u0AC7!', 'Namaste!', 'Gujarati', '#E91E63'),
    ('\u0A38\u0A24 \u0A38\u0A4D\u0A30\u0A40 \u0A05\u0A15\u0A3E\u0A32!', 'Sat Sri Akal!', 'Punjabi', '#00BCD4'),
]

# Languages diamond lines (native scripts)
_LANG_LINES = [
    ('\u0926\u094b\u0938\u094d\u0924', '#FFA000'),
    ('\u09ac\u09a8\u09cd\u09a7\u09c1 \u00b7 \u0c2e\u0c3f\u0c24\u0c4d\u0c30\u0c41\u0c21\u0c41', '#E91E63'),
    ('\u0c97\u0cc6\u0cb3\u0cc6\u0caf \u00b7 \u0d38\u0d41\u0d39\u0d43\u0d24\u0d4d\u0d24\u0d4d \u00b7 \u0aae\u0abf\u0aa4\u0acd\u0ab0', '#00BCD4'),
    ('\u0a2e\u0a3f\u0a71\u0a24\u0a30 \u00b7 \u0b2c\u0b28\u0b4d\u0b27\u0b41', '#9C27B0'),
    ('\u0938\u093e\u0925\u0940', '#00BFA5'),
]

_STATE_FILE = os.path.join(
    os.environ.get('USERPROFILE', os.path.expanduser('~')),
    'Documents', 'Nunba', 'data', 'splash_effect_state.json')


def _get_next_effect_index(total):
    """Round-robin: return the next effect index, persisting across launches."""
    try:
        os.makedirs(os.path.dirname(_STATE_FILE), exist_ok=True)
        if os.path.exists(_STATE_FILE):
            data = json.loads(open(_STATE_FILE).read())
            idx = (data.get('last_effect', -1) + 1) % total
        else:
            idx = 0
        with open(_STATE_FILE, 'w') as f:
            json.dump({'last_effect': idx}, f)
        return idx
    except Exception:
        return random.randint(0, total - 1)


def _ease_out_cubic(t):
    """Cubic ease-out: fast start, smooth deceleration."""
    return 1 - (1 - t) ** 3


def _render_bloom(radius, color_hex, opacity=0.07):
    """Render a soft radial bloom glow (Holi splash)."""
    if not _HAS_PIL:
        return None
    sz = radius * 2
    img = _PILImage.new('RGBA', (sz, sz), (0, 0, 0, 0))
    r, g, b = _hex_rgba(color_hex)[:3]
    cx = cy = radius
    for y in range(sz):
        for x in range(sz):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            if d < radius:
                a = int((1 - d / radius) ** 2 * opacity * 255)
                if a > 0:
                    img.putpixel((x, y), (r, g, b, a))
    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, sz, sz)


def _render_kolam_loops(radius, color_hex, opacity=0.2):
    """Render concentric kolam circle loops."""
    if not _HAS_PIL:
        return None
    sz = radius * 2 + 4
    img = _PILImage.new('RGBA', (sz, sz), (0, 0, 0, 0))
    draw = _PILDraw.Draw(img)
    c = sz // 2
    rgba = _hex_rgba(color_hex, int(opacity * 255))
    for r in [int(radius * 0.4), int(radius * 0.65), radius]:
        draw.ellipse([c - r, c - r, c + r, c + r], outline=rgba, width=1)
    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, sz, sz)


def _render_festival_bar(width):
    """Render the 5-color festival gradient bar (top/bottom edge)."""
    if not _HAS_PIL:
        return None
    h = 4
    img = _PILImage.new('RGBA', (width, h), (0, 0, 0, 0))
    colors = [(255, 160, 0), (233, 30, 99), (156, 39, 176), (0, 188, 212), (0, 191, 165)]
    seg = width / len(colors)
    for x in range(width):
        idx = min(int(x / seg), len(colors) - 1)
        idx2 = min(idx + 1, len(colors) - 1)
        t = (x - idx * seg) / seg
        r = int(colors[idx][0] + (colors[idx2][0] - colors[idx][0]) * t)
        g = int(colors[idx][1] + (colors[idx2][1] - colors[idx][1]) * t)
        b = int(colors[idx][2] + (colors[idx2][2] - colors[idx][2]) * t)
        for y in range(h):
            img.putpixel((x, y), (r, g, b, 255))
    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, width, h)


def _build_splash_elements(canvas, W, H):
    """Place splash elements: branding RIGHT, animation zone LEFT.

    Layout:
      LEFT  (~45%):  Empty — greeting effects animate here
      RIGHT (~55%):  All branding text vertically centered
      FULL WIDTH:    Festival bars, bloom glows, rangoli particles

    Returns (nunba_y, rx) where rx is the right-side center x.
    """
    # Right-side branding center (55% zone starts at 45%)
    rx = int(W * 0.72)
    # Left-side animation center (stored for greeting effects)
    # Not returned — greeting effects compute it from W

    def _y(pct):
        return int(H * pct)

    def _x(pct):
        return int(W * pct)

    def _txt(text, x, y, font_family, size, color, **kw):
        canvas.create_text(x, y, text=text, fill=color,
                           font=(_f(font_family), size), anchor='center', **kw)

    def _img(photo_tuple, x, y):
        if photo_tuple:
            canvas.create_image(x, y, image=photo_tuple[0], anchor='center')

    # ══════════════════════════════════════════════════
    # BACKGROUND (full width — minimal, clean)
    # ══════════════════════════════════════════════════

    # Festival gradient bars (top + bottom)
    bar = _render_festival_bar(W)
    _img(bar, W // 2, 2)
    _img(bar, W // 2, H - 2)

    # Subtle vertical separator between animation zone and branding
    sep_x = _x(0.47)
    canvas.create_line(sep_x, _y(0.08), sep_x, _y(0.92),
                       fill='#1A1730', width=1)

    # ── LEFT ZONE: Minimalistic hive honeycomb mesh ──
    # Very faint hexagonal grid — the hive mind backdrop
    lx = _x(0.22)
    hex_r = max(int(W * 0.035), 12)  # small hexagons
    hex_color = '#141225'  # barely visible
    hex_accent = '#1A1535'

    # Generate honeycomb grid positions in the left zone
    hex_dx = hex_r * 1.75
    hex_dy = hex_r * 1.52
    hex_x0 = _x(0.04)
    hex_y0 = _y(0.12)
    hex_cols = int((_x(0.43) - hex_x0) / hex_dx) + 1
    hex_rows = int((_y(0.88) - hex_y0) / hex_dy) + 1
    hex_centers = []
    for row in range(hex_rows):
        for col in range(hex_cols):
            hx = hex_x0 + col * hex_dx + (hex_r * 0.87 if row % 2 else 0)
            hy = hex_y0 + row * hex_dy
            if hx > _x(0.44):
                continue
            hex_centers.append((hx, hy))
            # Draw hexagon outline
            pts = []
            for a_i in range(6):
                angle = math.radians(60 * a_i + 30)
                pts.extend([hx + hex_r * math.cos(angle),
                            hy + hex_r * math.sin(angle)])
            canvas.create_polygon(pts, fill='', outline=hex_color, width=1)

    # A few accent hexagons with slightly brighter outlines
    for i in [0, 5, 12, 18, 24]:
        if i < len(hex_centers):
            ahx, ahy = hex_centers[i]
            pts = []
            for a_i in range(6):
                angle = math.radians(60 * a_i + 30)
                pts.extend([ahx + hex_r * math.cos(angle),
                            ahy + hex_r * math.sin(angle)])
            canvas.create_polygon(pts, fill='', outline=hex_accent, width=1)

    # ── Hive connection lines between a few hexagons ──
    # Thin lines suggesting neural/hive connections
    conn_color = '#161330'
    if len(hex_centers) > 20:
        connections = [(0, 5), (5, 12), (12, 18), (1, 6), (6, 13),
                       (3, 8), (8, 15), (15, 20), (10, 17)]
        for a, b in connections:
            if a < len(hex_centers) and b < len(hex_centers):
                ax, ay = hex_centers[a]
                bx, by = hex_centers[b]
                canvas.create_line(ax, ay, bx, by,
                                   fill=conn_color, width=1)

    # ══════════════════════════════════════════════════
    # RIGHT SIDE — BRANDING (vertically centered)
    # ══════════════════════════════════════════════════

    # ── Hero நண்பா — SKIP (typewriter handles it) ──
    nunba_y = _y(0.18)

    # ── Gradient divider ──
    _img(_render_divider(int(W * 0.28)), rx, _y(0.24))

    # ── NUNBA (static) ──
    _txt('N U N B A', rx, _y(0.30),
         'Bahnschrift', max(int(H * 0.05), 14), '#FFFFFE')

    # ── FRIEND ──
    _txt('F R I E N D', rx, _y(0.39),
         'Bahnschrift', max(int(H * 0.022), 7), '#D4A843')

    # ── Languages — stacked in 2 shorter lines ──
    lang_line1 = ('\u0926\u094b\u0938\u094d\u0924 \u00b7 '
                  '\u09ac\u09a8\u09cd\u09a7\u09c1 \u00b7 '
                  '\u0c2e\u0c3f\u0c24\u0c4d\u0c30\u0c41\u0c21\u0c41 \u00b7 '
                  '\u0c97\u0cc6\u0cb3\u0cc6\u0caf')
    lang_line2 = ('\u0d38\u0d41\u0d39\u0d43\u0d24\u0d4d\u0d24\u0d4d \u00b7 '
                  '\u0aae\u0abf\u0aa4\u0acd\u0ab0 \u00b7 '
                  '\u0a2e\u0a3f\u0a71\u0a24\u0a30 \u00b7 '
                  '\u0b2c\u0b28\u0b4d\u0b27\u0b41')
    fs_lang = max(int(H * 0.017), 6)
    _txt(lang_line1, rx, _y(0.46), 'Nirmala UI', fs_lang, '#94A1B2')
    _txt(lang_line2, rx, _y(0.50), 'Nirmala UI', fs_lang, '#94A1B2')

    # ── Neutron star (static parts — core + rings) ──
    # Animated orbiting particles are added in run_splash_animation
    ns_cx, ns_cy = rx, _y(0.59)
    ns_r = 22  # orbital radius

    # ── Tagline ──
    _txt('DEMOCRATIC', rx, _y(0.72),
         'Bahnschrift', max(int(H * 0.022), 8), '#94A1B2')
    _txt('HIVE  INTELLIGENCE', rx, _y(0.76),
         'Bahnschrift', max(int(H * 0.022), 8), '#94A1B2')

    # ── Subtitle ──
    _txt('Taking Human Evolution To Next Step With Hive AI', rx, _y(0.82),
         'Segoe UI', max(int(H * 0.015), 6), '#72757E')
    _txt('', rx, _y(0.86),
         'Segoe UI', max(int(H * 0.015), 6), '#72757E')

    # ── "Connecting To Your HART Region" — matrix-typed in run_splash_animation ──
    # Placeholder: just reserve the y position; animated text placed later

    # ── Footer — centered in left/right halves ──
    # Positioned at 0.91 to leave room for status text (H-32) and progress bar (H-14)
    _ftr_sz = max(int(H * 0.02), 7)
    _ftr_y = _y(0.91)
    _ftr_font = (_f('Segoe UI'), _ftr_sz)
    _sep_x = int(W * 0.47)
    _left_cx = _sep_x // 2          # center of left half
    _right_cx = (_sep_x + W) // 2   # center of right half

    # LEFT: "Powered By Hevolve.ai" — centered in left half
    canvas.create_text(_left_cx, _ftr_y, text='Powered By Hevolve.ai',
                       font=_ftr_font, fill='#5A5D66', anchor='center')

    # RIGHT: "Made With ❤ From India" — centered in right half
    _tmp1 = canvas.create_text(-500, -500, text='Made With', font=_ftr_font)
    _tmp2 = canvas.create_text(-500, -500, text='From India', font=_ftr_font)
    _bb1 = canvas.bbox(_tmp1)
    _bb2 = canvas.bbox(_tmp2)
    _w1 = (_bb1[2] - _bb1[0]) if _bb1 else 55
    _w2 = (_bb2[2] - _bb2[0]) if _bb2 else 60
    _th = ((_bb1[3] - _bb1[1]) if _bb1 else _ftr_sz) + 2
    canvas.delete(_tmp1, _tmp2)

    _heart_slot = _th + max(int(_th * 0.4), 3) * 2
    _total_w = _w1 + _heart_slot + _w2
    _rx = _right_cx - _total_w // 2

    canvas.create_text(_rx + _w1, _ftr_y, text='Made With',
                       font=_ftr_font, fill='#72757E', anchor='e')
    canvas.create_text(_rx + _w1 + _heart_slot, _ftr_y, text='From India',
                       font=_ftr_font, fill='#72757E', anchor='w')

    _heart_x = _rx + _w1 + _heart_slot // 2
    try:
        # Render heart at 4x then downsample for clean anti-aliased result
        _hsz = _th + 2
        _ss = 4  # supersample factor
        _big = _hsz * _ss
        _him = _PILImage.new('RGBA', (_big, _big), (0, 0, 0, 0))
        _hd = _PILDraw.Draw(_him)
        cx, cy = _big / 2, _big * 0.38
        rb = _big * 0.24  # bump radius
        # Two circle bumps at top
        _hd.ellipse([cx - rb * 2, cy - rb, cx, cy + rb],
                     fill=(255, 75, 110, 255))
        _hd.ellipse([cx, cy - rb, cx + rb * 2, cy + rb],
                     fill=(255, 75, 110, 255))
        # Triangle bottom
        _hd.polygon([(cx - rb * 2, cy + rb * 0.3),
                      (cx + rb * 2, cy + rb * 0.3),
                      (cx, _big * 0.88)],
                     fill=(255, 75, 110, 255))
        # Downsample to target size
        _him = _him.resize((_hsz, _hsz), _PILImage.LANCZOS)
        _hph = _PILTk.PhotoImage(_him)
        _photo_store.append(_hph)
        canvas.create_image(_heart_x, _ftr_y, image=_hph, anchor='center')
    except Exception:
        canvas.create_text(_heart_x, _ftr_y, text='\u2764',
                           font=_ftr_font, fill='#FF4B6E', anchor='center')

    return nunba_y, rx, ns_cx, ns_cy, ns_r


# ═══════════════════════════════════════════════════════════════
#  TYPEWRITER ANIMATION for NUNBA  (PIL anti-aliased images)
# ═══════════════════════════════════════════════════════════════

_SHIMMER_COLORS = ['#FFA000', '#E91E63', '#00BCD4', '#9C27B0', '#00BFA5']

# Tamil syllables for நண்பா — these are the visual typing units
_TAMIL_SYLLABLES = ['\u0BA8', '\u0BA3\u0BCD', '\u0BAA\u0BBE']

# ── TRON GLOW SYSTEM ──
# Left animation zone: greeting effects animate here with Tron neon glow
_TRON_CYAN = '#00E5FF'
_TRON_BLUE = '#0288D1'
_TRON_WHITE = '#E0F7FA'
_TRON_DIM = '#004D60'
# Festival-Tron fusion: cyan tech + Indian festival warmth
_TRON_GLOW_COLORS = ['#00E5FF', '#00BCD4', '#80DEEA', '#FFA000', '#E91E63']
_FESTIVAL_TRON = ['#00E5FF', '#FFA000', '#E91E63', '#9C27B0', '#00BFA5']


def _render_tron_border(w, h, color='#00E5FF', glow_layers=6):
    """Render a Tron-style glowing rectangular border (PIL anti-aliased).

    Returns (PhotoImage, total_w, total_h) — place at left zone center.
    """
    if not _HAS_PIL:
        return None
    pad = glow_layers * 2 + 4
    img_w, img_h = w + pad * 2, h + pad * 2
    img = _PILImage.new('RGBA', (img_w, img_h), (0, 0, 0, 0))
    draw = _PILDraw.Draw(img)
    r, g, b = _hex_rgba(color)[:3]
    cx, cy = img_w // 2, img_h // 2
    hw, hh = w // 2, h // 2

    # Layered glow (outer → inner, increasing alpha)
    for i in range(glow_layers, 0, -1):
        alpha = int(18 * (1 - i / (glow_layers + 1)))
        draw.rounded_rectangle(
            [cx - hw - i, cy - hh - i, cx + hw + i, cy + hh + i],
            radius=4 + i,
            outline=(r, g, b, alpha), width=1)

    # Core border (bright)
    draw.rounded_rectangle(
        [cx - hw, cy - hh, cx + hw, cy + hh],
        radius=4,
        outline=(r, g, b, 120), width=1)

    # Corner accents (brighter dots at corners)
    corner_r = 2
    for ccx, ccy in [(cx - hw, cy - hh), (cx + hw, cy - hh),
                      (cx - hw, cy + hh), (cx + hw, cy + hh)]:
        draw.ellipse([ccx - corner_r, ccy - corner_r,
                      ccx + corner_r, ccy + corner_r],
                     fill=(r, g, b, 160))

    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, img_w, img_h)


def _tron_glow_dot(canvas, x, y, r=2, color=None):
    """Create a dot with Tron glow halo on canvas. Returns list of item IDs."""
    c = color or _TRON_CYAN
    items = []
    # Outer glow halo (dim)
    hr = r + 3
    items.append(canvas.create_oval(x - hr, y - hr, x + hr, y + hr,
                                     fill='', outline=_TRON_DIM, width=1))
    # Core dot
    items.append(canvas.create_oval(x - r, y - r, x + r, y + r,
                                     fill=c, outline=''))
    return items


def _run_buildup(canvas, root, W, H, nunba_y, rx, on_done):
    """Typewriter for நண்பா — proper typing cursor that advances right.

    Uses canvas text (not PIL) so Tamil script renders with proper shaping.
    A blinking cursor appears, then each syllable types in at the cursor
    position. Cursor advances right after each keystroke. After all
    syllables: cursor blinks out, shimmer sweep, settle to gold.
    rx = right-side branding center x.
    """
    cx = rx
    SYLLABLES = _TAMIL_SYLLABLES
    FONT_SIZE = max(int(H * 0.075), 20)
    FONT = (_f('Nirmala UI'), FONT_SIZE)
    COLOR_FINAL = '#D4A843'
    COLOR_FLASH = '#FFFFFE'
    COLOR_DIM = '#2A2540'

    # Measure each syllable width for proper cursor positioning
    widths = []
    for s in SYLLABLES:
        tmp = canvas.create_text(0, 0, text=s, font=FONT, anchor='w')
        bb = canvas.bbox(tmp)
        canvas.delete(tmp)
        widths.append(bb[2] - bb[0] if bb else 20)

    GAP = max(int(FONT_SIZE * 0.15), 2)
    total_w = sum(widths) + GAP * (len(SYLLABLES) - 1)

    # Left edges of each syllable (anchor='w')
    x_start = cx - total_w // 2
    left_edges = []
    x_run = x_start
    for w in widths:
        left_edges.append(x_run)
        x_run += w + GAP
    # Cursor positions: before first char, then after each char
    cursor_positions = [x_start]  # before typing starts
    x_run = x_start
    for w in widths:
        x_run += w + GAP
        cursor_positions.append(x_run - GAP)  # right edge of this syllable

    # Thin blinking cursor (narrow rectangle simulated with line)
    cursor_h = FONT_SIZE + 4
    cursor_item = canvas.create_line(
        cursor_positions[0], nunba_y - cursor_h // 2,
        cursor_positions[0], nunba_y + cursor_h // 2,
        fill=COLOR_FLASH, width=2)

    # Syllable items (hidden, revealed one by one at left_edges)
    syl_items = []
    for i, (s, lx) in enumerate(zip(SYLLABLES, left_edges)):
        it = canvas.create_text(
            lx, nunba_y, text=s, fill=COLOR_DIM,
            font=FONT, anchor='w')
        canvas.itemconfig(it, state='hidden')
        syl_items.append(it)

    all_items = syl_items + [cursor_item]

    state = {
        'phase': 'cursor_intro', 'tick': 0,
        'syl_idx': 0,
        'blink_count': 0, 'shimmer_idx': 0,
        'cursor_on': True,
    }

    def _move_cursor(pos_idx):
        """Move cursor line to the given position index."""
        cx_pos = cursor_positions[min(pos_idx, len(cursor_positions) - 1)]
        canvas.coords(cursor_item,
                      cx_pos, nunba_y - cursor_h // 2,
                      cx_pos, nunba_y + cursor_h // 2)

    def tick():
        try:
            p = state['phase']
            state['tick'] += 1

            # ── Phase 1: Cursor blinks at start position ──
            if p == 'cursor_intro':
                if state['tick'] <= 6:
                    if state['tick'] % 3 < 2:
                        canvas.itemconfig(cursor_item, fill=COLOR_FLASH)
                    else:
                        canvas.itemconfig(cursor_item, fill=COLOR_DIM)
                    root.after(90, tick)
                else:
                    canvas.itemconfig(cursor_item, fill=COLOR_FLASH)
                    state['phase'] = 'typing'
                    state['tick'] = 0
                    root.after(80, tick)

            # ── Phase 2: Type each syllable with cursor advancing ──
            elif p == 'typing':
                idx = state['syl_idx']

                # Show syllable — flash white then settle to gold
                canvas.itemconfig(syl_items[idx], state='normal',
                                  fill=COLOR_FLASH)
                canvas.tag_raise(syl_items[idx])

                # Move cursor to right of this syllable
                _move_cursor(idx + 1)
                canvas.tag_raise(cursor_item)

                # Schedule settle to gold
                def _settle(i=idx):
                    try:
                        canvas.itemconfig(syl_items[i], fill=COLOR_FINAL)
                    except Exception:
                        pass
                root.after(80, _settle)

                # Advance to next syllable or finish
                state['syl_idx'] += 1
                if state['syl_idx'] >= len(SYLLABLES):
                    state['phase'] = 'cursor_outro'
                    state['tick'] = 0
                    state['blink_count'] = 0
                    root.after(300, tick)
                else:
                    # Random typing delay (human-like)
                    delay = 160 + random.randint(0, 100)
                    root.after(delay, tick)

            # ── Phase 3: Cursor blinks then vanishes ──
            elif p == 'cursor_outro':
                state['blink_count'] += 1
                if state['blink_count'] > 6:
                    canvas.itemconfig(cursor_item, state='hidden')
                    state['phase'] = 'shimmer'
                    state['tick'] = 0
                    state['shimmer_idx'] = 0
                    root.after(300, tick)
                    return
                state['cursor_on'] = not state['cursor_on']
                canvas.itemconfig(cursor_item,
                                  fill=COLOR_FLASH if state['cursor_on']
                                  else COLOR_DIM)
                root.after(220, tick)

            # ── Phase 4: Shimmer sweep left→right ──
            elif p == 'shimmer':
                si = state['shimmer_idx']
                if si < len(SYLLABLES):
                    sc = _SHIMMER_COLORS[si % len(_SHIMMER_COLORS)]
                    canvas.itemconfig(syl_items[si], fill=sc)
                    if si > 0:
                        canvas.itemconfig(syl_items[si - 1], fill=COLOR_FINAL)
                    state['shimmer_idx'] += 1
                    root.after(120, tick)
                elif si == len(SYLLABLES):
                    canvas.itemconfig(syl_items[-1], fill=COLOR_FINAL)
                    state['shimmer_idx'] += 1
                    state['phase'] = 'glow_pulse'
                    state['tick'] = 0
                    root.after(150, tick)

            # ── Phase 5: Gentle pulse then done ──
            elif p == 'glow_pulse':
                t = state['tick']
                if t <= 8:
                    use_bright = math.sin(t * 0.6) * 0.5 + 0.5 > 0.5
                    c = COLOR_FLASH if use_bright else COLOR_FINAL
                    for li in syl_items:
                        canvas.itemconfig(li, fill=c)
                    root.after(60, tick)
                else:
                    for li in syl_items:
                        canvas.itemconfig(li, fill=COLOR_FINAL)
                    root.after(200, on_done)
                    return

        except Exception:
            pass

    root.after(400, tick)
    return all_items


# ═══════════════════════════════════════════════════════════════
#  GREETING EFFECTS (play after build-up)
# ═══════════════════════════════════════════════════════════════

def _render_wireframe_face(radius=28):
    """Render a wireframe smiley face from hundreds of tiny dots (PIL anti-aliased).

    Returns (PhotoImage, width, height) — a smooth, node-graph style face.
    """
    if not _HAS_PIL:
        return None
    pad = 8
    sz = radius * 2 + pad * 2
    img = _PILImage.new('RGBA', (sz, sz), (0, 0, 0, 0))
    draw = _PILDraw.Draw(img)
    c = sz // 2

    NODE_COLOR = (0, 229, 255)   # Tron cyan #00E5FF
    GLOW_COLOR = (0, 229, 255, 60)
    EYE_COLOR = (224, 247, 250)  # Tron white #E0F7FA
    MOUTH_COLOR = (0, 229, 255)  # Tron cyan

    # Face outline — 120 nodes in a circle
    for i in range(120):
        a = math.radians(i * 3)
        x = c + radius * math.cos(a)
        y = c + radius * math.sin(a)
        r = 1.3 if i % 3 == 0 else 0.8
        draw.ellipse([x - r, y - r, x + r, y + r],
                     fill=NODE_COLOR + (200,))

    # Inner structure — concentric ring of ~40 nodes
    for i in range(40):
        a = math.radians(i * 9)
        ir = radius * 0.65
        x = c + ir * math.cos(a)
        y = c + ir * math.sin(a)
        draw.ellipse([x - 0.7, y - 0.7, x + 0.7, y + 0.7],
                     fill=NODE_COLOR + (100,))

    # Left eye — 25 nodes in small circle
    ex_l, ey = c - radius * 0.32, c - radius * 0.2
    for i in range(25):
        a = math.radians(i * 14.4)
        er = radius * 0.15
        x = ex_l + er * math.cos(a)
        y = ey + er * math.sin(a)
        draw.ellipse([x - 1, y - 1, x + 1, y + 1],
                     fill=EYE_COLOR + (220,))
    # Pupil
    draw.ellipse([ex_l - 2, ey - 2, ex_l + 2, ey + 2],
                 fill=EYE_COLOR + (255,))

    # Right eye — 25 nodes
    ex_r = c + radius * 0.32
    for i in range(25):
        a = math.radians(i * 14.4)
        er = radius * 0.15
        x = ex_r + er * math.cos(a)
        y = ey + er * math.sin(a)
        draw.ellipse([x - 1, y - 1, x + 1, y + 1],
                     fill=EYE_COLOR + (220,))
    draw.ellipse([ex_r - 2, ey - 2, ex_r + 2, ey + 2],
                 fill=EYE_COLOR + (255,))

    # Smile — arc of 30 nodes (20°→160° = downward bow in screen coords)
    for i in range(30):
        a = math.radians(20 + i * (140 / 30))
        mr = radius * 0.45
        x = c + mr * math.cos(a)
        y = c + radius * 0.15 + mr * math.sin(a)
        draw.ellipse([x - 1, y - 1, x + 1, y + 1],
                     fill=MOUTH_COLOR + (220,))

    # Connection lines (very faint, between some outer nodes)
    for i in range(0, 120, 8):
        a1 = math.radians(i * 3)
        a2 = math.radians((i + 15) * 3)
        x1 = c + radius * math.cos(a1)
        y1 = c + radius * math.sin(a1)
        x2 = c + radius * math.cos(a2)
        y2 = c + radius * math.sin(a2)
        draw.line([(x1, y1), (x2, y2)], fill=NODE_COLOR + (30,), width=1)

    # Faint glow behind
    for gr in [radius + 4, radius + 7]:
        draw.ellipse([c - gr, c - gr, c + gr, c + gr],
                     outline=GLOW_COLOR)

    photo = _PILTk.PhotoImage(img)
    _photo_store.append(photo)
    return (photo, sz, sz)


def _greeting_classic(canvas, root, W, H):
    """Wireframe node face assembles from scattered nodes, then 'Hi Nunba' text."""
    face_radius = 28
    target_fx = int(W * 0.22)
    fy = int(H * 0.45)

    # Pre-render the final wireframe face (PIL anti-aliased)
    face_img = _render_wireframe_face(face_radius)

    # 120 scattered nodes that converge to form the face
    NODE_COUNT = 120
    NODE_COLOR = _TRON_CYAN
    NODE_DIM = _TRON_DIM
    nodes = []
    for i in range(NODE_COUNT):
        # Start from random edge
        edge = random.choice(['top', 'bottom', 'left', 'right'])
        if edge == 'top':
            sx = random.uniform(target_fx - 80, target_fx + 80)
            sy = -random.randint(10, 50)
        elif edge == 'bottom':
            sx = random.uniform(target_fx - 80, target_fx + 80)
            sy = H + random.randint(10, 50)
        elif edge == 'left':
            sx = -random.randint(10, 50)
            sy = random.uniform(fy - 40, fy + 40)
        else:
            sx = W + random.randint(10, 50)
            sy = random.uniform(fy - 40, fy + 40)

        # Target: point on/inside face circle
        a = math.radians(i * (360 / NODE_COUNT))
        tr = random.uniform(0, face_radius)
        tx = target_fx + tr * math.cos(a)
        ty = fy + tr * math.sin(a)

        dot = canvas.create_oval(sx - 1.5, sy - 1.5, sx + 1.5, sy + 1.5,
                                 fill=NODE_DIM, outline='')
        nodes.append({'item': dot, 'x': float(sx), 'y': float(sy),
                      'tx': tx, 'ty': ty})

    # Matrix-style typing text items — type char by char with scramble
    _LINE1 = 'Hi, Nunba!'
    _LINE2 = "your \u0BA8\u0BA3\u0BCD\u0BAA\u0BBE is here"
    text_y1 = fy + face_radius + 14
    text_y2 = fy + face_radius + 32
    txt1 = canvas.create_text(target_fx, text_y1, text='',
                              fill=_TRON_CYAN, font=(_f('Bahnschrift'), 14),
                              anchor='center')
    txt2 = canvas.create_text(target_fx, text_y2, text='',
                              fill=_TRON_WHITE, font=(_f('Segoe UI'), 9),
                              anchor='center')

    # Face image item (hidden initially, shown after nodes converge)
    face_item = None
    if face_img:
        face_item = canvas.create_image(target_fx, fy, image=face_img[0],
                                        anchor='center')
        canvas.itemconfig(face_item, state='hidden')

    node_items = [n['item'] for n in nodes]
    all_items = node_items + [txt1, txt2] + ([face_item] if face_item else [])

    _SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'

    state = {'phase': 'converge', 'tick': 0, 'hold': 0, 'pulse': 0.0,
             'type_line': 1, 'type_idx': 0, 'type_text': '',
             'scramble_count': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'converge':
                t = min(state['tick'] / 35.0, 1.0)
                for n in nodes:
                    n['x'] += (n['tx'] - n['x']) * 0.09
                    n['y'] += (n['ty'] - n['y']) * 0.09
                    canvas.coords(n['item'],
                                  n['x'] - 1.5, n['y'] - 1.5,
                                  n['x'] + 1.5, n['y'] + 1.5)
                    if t > 0.5:
                        canvas.itemconfig(n['item'], fill=NODE_COLOR)
                if t >= 1.0:
                    if face_item:
                        canvas.itemconfig(face_item, state='normal')
                        canvas.tag_raise(face_item)
                    for n in nodes:
                        canvas.itemconfig(n['item'], state='hidden')
                    state['phase'] = 'type_text'
                    state['tick'] = 0
                    state['type_line'] = 1
                    state['type_idx'] = 0
                    state['type_text'] = ''
                    state['scramble_count'] = 0

            elif p == 'type_text':
                line = _LINE1 if state['type_line'] == 1 else _LINE2
                item = txt1 if state['type_line'] == 1 else txt2
                idx = state['type_idx']

                if idx < len(line):
                    target_ch = line[idx]
                    if state['scramble_count'] < 2 and target_ch != ' ':
                        # Show random scramble character
                        scrambled = state['type_text'] + random.choice(_SCRAMBLE_CHARS)
                        canvas.itemconfigure(item, text=scrambled)
                        state['scramble_count'] += 1
                        root.after(35, anim)
                    else:
                        # Settle to real character
                        state['type_text'] += target_ch
                        canvas.itemconfigure(item, text=state['type_text'])
                        state['type_idx'] += 1
                        state['scramble_count'] = 0
                        delay = 20 if target_ch == ' ' else 40 + random.randint(0, 20)
                        root.after(delay, anim)
                else:
                    # Line done — advance to line 2 or hold
                    if state['type_line'] == 1:
                        state['type_line'] = 2
                        state['type_idx'] = 0
                        state['type_text'] = ''
                        state['scramble_count'] = 0
                        root.after(120, anim)
                    else:
                        state['phase'] = 'hold'
                        state['tick'] = 0
                        root.after(30, anim)
                return  # type_text manages its own scheduling

            elif p == 'hold':
                state['hold'] += 1
                state['pulse'] += 0.12
                if face_item:
                    dy = math.sin(state['pulse']) * 1.0
                    canvas.coords(face_item, target_fx, fy + dy)
                if state['hold'] >= 80:
                    state['phase'] = 'scatter'
                    state['tick'] = 0
                    for n in nodes:
                        canvas.itemconfig(n['item'], state='normal',
                                          fill=NODE_COLOR)
                        canvas.coords(n['item'],
                                      n['tx'] - 1.5, n['ty'] - 1.5,
                                      n['tx'] + 1.5, n['ty'] + 1.5)
                    if face_item:
                        canvas.itemconfig(face_item, state='hidden')

            elif p == 'scatter':
                state['tick'] += 1
                for n in nodes:
                    canvas.move(n['item'],
                                random.uniform(-4, 4), random.uniform(-4, 4))
                canvas.move(txt1, 5, 0)
                canvas.move(txt2, 5, 0)
                if state['tick'] >= 20:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(25, anim)
        except Exception:
            pass
    anim()


def _greeting_matrix(canvas, root, W, H):
    """Matrix rain of Indian language scripts in festival colors, then greeting."""
    # Character pools from each script with their colors
    _SCRIPT_CHARS = [
        # Tamil
        ('\u0B85\u0B86\u0B87\u0B88\u0B89\u0B8A\u0B8E\u0B8F\u0B90\u0B92\u0B93'
         '\u0B95\u0B99\u0B9A\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8\u0BAA\u0BAE\u0BAF'
         '\u0BB0\u0BB2\u0BB5\u0BB4\u0BB3\u0BB1', '#FFA000'),
        # Hindi / Devanagari
        ('\u0905\u0906\u0907\u0908\u0909\u090A\u090F\u0910\u0913\u0914'
         '\u0915\u0916\u0917\u0918\u091A\u091B\u091C\u091D\u091F\u0920'
         '\u0921\u0922\u0923\u0924\u0925\u0926\u0927\u0928\u092A\u092B'
         '\u092C\u092D\u092E\u092F\u0930\u0932\u0935\u0936\u0937\u0938\u0939', '#E91E63'),
        # Bengali
        ('\u0985\u0986\u0987\u0988\u0989\u098A\u098F\u0990\u0993\u0994'
         '\u0995\u0996\u0997\u0998\u099A\u099B\u099C\u099D\u099F\u09A0'
         '\u09A1\u09A2\u09A3\u09A4\u09A5\u09A6\u09A7\u09A8\u09AA\u09AB'
         '\u09AC\u09AD\u09AE\u09AF\u09B0\u09B2\u09B6\u09B7\u09B8\u09B9', '#00BCD4'),
        # Telugu
        ('\u0C05\u0C06\u0C07\u0C08\u0C09\u0C0A\u0C0E\u0C0F\u0C10\u0C12'
         '\u0C15\u0C16\u0C17\u0C18\u0C1A\u0C1B\u0C1C\u0C1E\u0C1F\u0C20'
         '\u0C21\u0C22\u0C23\u0C24\u0C25\u0C26\u0C27\u0C28\u0C2A\u0C2B'
         '\u0C2C\u0C2D\u0C2E\u0C2F\u0C30\u0C32\u0C35\u0C36\u0C37\u0C38\u0C39', '#9C27B0'),
        # Kannada
        ('\u0C85\u0C86\u0C87\u0C88\u0C89\u0C8A\u0C8E\u0C8F\u0C90\u0C92'
         '\u0C95\u0C96\u0C97\u0C98\u0C9A\u0C9B\u0C9C\u0C9E\u0C9F\u0CA0'
         '\u0CA1\u0CA2\u0CA3\u0CA4\u0CA5\u0CA6\u0CA7\u0CA8\u0CAA\u0CAB'
         '\u0CAC\u0CAD\u0CAE\u0CAF\u0CB0\u0CB2\u0CB5\u0CB6\u0CB7\u0CB8\u0CB9', '#00BFA5'),
        # Malayalam
        ('\u0D05\u0D06\u0D07\u0D08\u0D09\u0D0A\u0D0E\u0D0F\u0D10\u0D12'
         '\u0D15\u0D16\u0D17\u0D18\u0D1A\u0D1B\u0D1C\u0D1E\u0D1F\u0D20'
         '\u0D21\u0D22\u0D23\u0D24\u0D25\u0D26\u0D27\u0D28\u0D2A\u0D2B'
         '\u0D2C\u0D2D\u0D2E\u0D2F\u0D30\u0D32\u0D35\u0D36\u0D37\u0D38\u0D39', '#FFA000'),
        # Gujarati
        ('\u0A85\u0A86\u0A87\u0A88\u0A89\u0A8A\u0A8F\u0A90\u0A93\u0A94'
         '\u0A95\u0A96\u0A97\u0A98\u0A9A\u0A9B\u0A9C\u0A9E\u0A9F\u0AA0'
         '\u0AA1\u0AA2\u0AA3\u0AA4\u0AA5\u0AA6\u0AA7\u0AA8\u0AAA\u0AAB'
         '\u0AAC\u0AAD\u0AAE\u0AAF\u0AB0\u0AB2\u0AB5\u0AB6\u0AB7\u0AB8\u0AB9', '#E91E63'),
        # Punjabi / Gurmukhi
        ('\u0A05\u0A06\u0A07\u0A08\u0A09\u0A0A\u0A0F\u0A10\u0A13\u0A14'
         '\u0A15\u0A16\u0A17\u0A18\u0A1A\u0A1B\u0A1C\u0A1E\u0A1F\u0A20'
         '\u0A21\u0A22\u0A23\u0A24\u0A25\u0A26\u0A27\u0A28\u0A2A\u0A2B'
         '\u0A2C\u0A2D\u0A2E\u0A2F\u0A30\u0A32\u0A35\u0A36\u0A38\u0A39', '#00BCD4'),
    ]

    # Build a flat pool of (char, bright_color, dim_color) for variety
    _all_chars = []
    for chars, bright in _SCRIPT_CHARS:
        # Dim version: low-alpha-ish by darkening the hex
        r, g, b = _hex_rgba(bright)[:3]
        dim = f'#{r//4:02x}{g//4:02x}{b//4:02x}'
        for ch in chars:
            _all_chars.append((ch, bright, dim))

    COLS = 18
    rows_per_col = 5
    lx = int(W * 0.22)
    lzone_w = int(W * 0.42)  # left zone width

    # Rain columns — start ABOVE the canvas, confined to left zone
    rain = []
    for c in range(COLS):
        x = int(lx - lzone_w // 2 + c * (lzone_w / COLS)) + 3
        col_items = []
        for r in range(rows_per_col):
            y = -random.randint(20, 200)
            ch_data = random.choice(_all_chars)
            it = canvas.create_text(x, y, text=ch_data[0],
                                    fill=ch_data[2], font=(_f('Nirmala UI'), 8))
            col_items.append({'item': it, 'y': float(y),
                              'speed': random.uniform(2.0, 5.0),
                              'bright': ch_data[1], 'dim': ch_data[2]})
        rain.append(col_items)

    # Head of each column glows bright, rest stays dim
    for col in rain:
        if col:
            col[0]['head'] = True

    # Greeting text (native canvas text for proper script rendering)
    greeting = random.choice(GREETINGS)
    txt1 = canvas.create_text(lx, H + 40, text='> ' + greeting[0],
                              fill=_TRON_CYAN, font=(_f('Nirmala UI'), 13))
    txt2 = canvas.create_text(lx, H + 60, text="> Hello, \u0BA8\u0BA3\u0BCD\u0BAA\u0BBE",
                              fill=_TRON_WHITE, font=(_f('Segoe UI'), 10))

    flat_rain = [ri['item'] for col in rain for ri in col]
    all_items = flat_rain + [txt1, txt2]
    state = {'phase': 'rain', 'tick': 0, 'hold': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            # Rain always falls (except during fade-out)
            if p != 'fade':
                for col in rain:
                    for idx, ri in enumerate(col):
                        ri['y'] += ri['speed']
                        if ri['y'] > H + 20:
                            ri['y'] = -random.randint(10, 100)
                            ri['speed'] = random.uniform(2.0, 5.0)
                            # Pick a new random script character
                            ch_data = random.choice(_all_chars)
                            ri['bright'] = ch_data[1]
                            ri['dim'] = ch_data[2]
                            canvas.itemconfig(ri['item'], text=ch_data[0])
                        coords = canvas.coords(ri['item'])
                        if coords:
                            canvas.coords(ri['item'], coords[0], ri['y'])
                        # Randomly swap characters for the shimmer
                        if random.random() < 0.15:
                            ch_data = random.choice(_all_chars)
                            canvas.itemconfig(ri['item'], text=ch_data[0])
                        # Leading char in column glows bright
                        if idx == 0:
                            canvas.itemconfig(ri['item'], fill=ri['bright'])
                        else:
                            canvas.itemconfig(ri['item'], fill=ri['dim'])

            if p == 'rain':
                if state['tick'] >= 40:
                    state['phase'] = 'reveal'
                    state['tick'] = 0

            elif p == 'reveal':
                t = min(state['tick'] / 20.0, 1.0)
                et = _ease_out_cubic(t)
                # Text slides up from bottom
                ty = int(H * 0.55)
                canvas.coords(txt1, lx, H + 40 - (H + 40 - ty + 10) * et)
                canvas.coords(txt2, lx, H + 60 - (H + 60 - ty - 10) * et)
                if t >= 1.0:
                    state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                if state['hold'] >= 70:
                    state['phase'] = 'fade'
                    state['tick'] = 0

            elif p == 'fade':
                state['tick'] += 1
                if state['tick'] >= 20:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(30, anim)
        except Exception:
            pass
    anim()


def _greeting_bee(canvas, root, W, H):
    """Honey bee flies in from top-right corner, buzzes across to left zone."""
    bx, by = int(W * 0.44) + 30, -30  # start off-screen above left zone
    target_x, target_y = int(W * 0.22), int(H * 0.45)

    # Bee parts
    bee_body = canvas.create_oval(0, 0, 16, 11, fill='#FFD700', outline='#B8860B', width=1)
    bee_head = canvas.create_oval(0, 0, 10, 9, fill='#FFA000', outline='#B8860B', width=1)
    bee_s1 = canvas.create_line(0, 0, 0, 0, fill='#1A1730', width=2)
    bee_s2 = canvas.create_line(0, 0, 0, 0, fill='#1A1730', width=2)
    bee_wl = canvas.create_oval(0, 0, 12, 7, fill='', outline='#CCCCCC', width=1)
    bee_wr = canvas.create_oval(0, 0, 12, 7, fill='', outline='#CCCCCC', width=1)
    bee_eye = canvas.create_oval(0, 0, 3, 3, fill='white', outline='')
    bee_parts = [bee_body, bee_s1, bee_s2, bee_head, bee_wl, bee_wr, bee_eye]

    # Greeting (native canvas text for Tamil)
    txt1 = canvas.create_text(-200, target_y - 10,
                              text='\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD!',
                              fill=_TRON_CYAN, font=(_f('Nirmala UI'), 11), anchor='center')
    txt2 = canvas.create_text(-200, target_y + 10,
                              text="Buzz! I'm your \u0BA8\u0BA3\u0BCD\u0BAA\u0BBE",
                              fill=_TRON_WHITE, font=(_f('Segoe UI'), 9), anchor='center')
    all_items = bee_parts + [txt1, txt2]

    state = {'phase': 'fly_in', 't': 0.0, 'wing': 0.0, 'hold': 0}

    def _place_bee(x, y, wp=0):
        canvas.coords(bee_body, x - 8, y - 5, x + 8, y + 6)
        canvas.coords(bee_s1, x - 2, y - 4, x - 2, y + 5)
        canvas.coords(bee_s2, x + 3, y - 4, x + 3, y + 5)
        canvas.coords(bee_head, x + 6, y - 4, x + 16, y + 5)
        canvas.coords(bee_eye, x + 12, y - 2, x + 15, y + 1)
        wy = math.sin(wp) * 4
        canvas.coords(bee_wl, x - 3, y - 8 + wy, x + 9, y - 3 + wy)
        canvas.coords(bee_wr, x - 3, y + 3 - wy, x + 9, y + 8 - wy)

    def anim():
        try:
            p = state['phase']
            state['wing'] += 0.8

            if p == 'fly_in':
                state['t'] += 0.025
                t = min(state['t'], 1.0)
                # Quadratic bezier: P0=start, P1=control, P2=target
                u = 1 - t
                cx = u * u * bx + 2 * u * t * (W // 2) + t * t * target_x
                cy = u * u * by + 2 * u * t * 80 + t * t * target_y
                _place_bee(cx, cy, state['wing'])
                if t >= 1.0:
                    state['phase'] = 'show_text'
                    state['t'] = 0

            elif p == 'show_text':
                state['t'] += 1
                # Slide text in from left
                t = min(state['t'] / 15.0, 1.0)
                et = _ease_out_cubic(t)
                canvas.coords(txt1, -200 + (target_x - 120 + 200) * et, target_y - 10)
                canvas.coords(txt2, -200 + (target_x - 120 + 200) * et, target_y + 10)
                _place_bee(target_x, target_y, state['wing'])
                if t >= 1.0:
                    state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                _place_bee(target_x + math.sin(state['hold'] * 0.1) * 2,
                           target_y, state['wing'])
                if state['hold'] >= 70:
                    state['phase'] = 'fly_out'
                    state['t'] = 0

            elif p == 'fly_out':
                state['t'] += 0.035
                t = min(state['t'], 1.0)
                fx = target_x + (W + 50 - target_x) * t
                fy = target_y + (target_y - 150) * t * (1 - t) * 4
                _place_bee(fx, fy, state['wing'])
                canvas.move(txt1, 6, 0)
                canvas.move(txt2, 6, 0)
                if t >= 1.0:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(25, anim)
        except Exception:
            pass
    anim()


def _greeting_multilingual(canvas, root, W, H):
    """Random Indian language greeting sweeps in from the left edge with Tron glow."""
    greeting = random.choice(GREETINGS)
    script, roman, lang, color = greeting
    lx = int(W * 0.22)
    ly = int(H * 0.50)

    # Native canvas text (Indic scripts need OS text shaping)
    txt1 = canvas.create_text(-200, ly, text=script,
                              fill=_TRON_CYAN, font=(_f('Nirmala UI'), 16), anchor='center')
    txt2 = canvas.create_text(-200, ly + 22, text=f'{roman}  ({lang})',
                              fill=_TRON_WHITE, font=(_f('Segoe UI'), 9), anchor='center')

    # Decorative sparkles with Tron glow colors
    sparkles = []
    for _ in range(12):
        sx = -random.randint(50, 300)
        sy = ly + random.randint(-30, 50)
        sc = random.choice(_TRON_GLOW_COLORS)
        s = canvas.create_oval(sx, sy, sx + 2, sy + 2, fill=sc, outline='')
        sparkles.append({'item': s, 'start_x': float(sx), 'start_y': float(sy),
                         'target_x': lx + random.uniform(-60, 60),
                         'target_y': ly + random.uniform(-20, 50),
                         'drift_dy': random.uniform(-0.5, -0.1)})

    all_items = [txt1, txt2] + [sp['item'] for sp in sparkles]
    state = {'phase': 'enter', 'tick': 0, 'hold': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'enter':
                t = min(state['tick'] / 30.0, 1.0)
                et = _ease_out_cubic(t)
                canvas.coords(txt1, -200 + (lx + 200) * et, ly)
                canvas.coords(txt2, -200 + (lx + 200) * et, ly + 22)
                for sp in sparkles:
                    sx = sp['start_x'] + (sp['target_x'] - sp['start_x']) * et
                    sy = sp['start_y'] + (sp['target_y'] - sp['start_y']) * et
                    canvas.coords(sp['item'], sx, sy, sx + 2, sy + 2)
                if t >= 1.0:
                    state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                for sp in sparkles:
                    canvas.move(sp['item'], 0, sp['drift_dy'])
                if state['hold'] >= 80:
                    state['phase'] = 'exit'
                    state['tick'] = 0

            elif p == 'exit':
                t = min(state['tick'] / 20.0, 1.0)
                # Exit to the right
                dx = t * 10
                for it in all_items:
                    canvas.move(it, dx, 0)
                if t >= 1.0:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(25, anim)
        except Exception:
            pass
    anim()


def _greeting_neural(canvas, root, W, H):
    """Neural network nodes converge from edges, words light up: TEACH LEARN COLLABORATE."""
    words = ['TEACH', 'LEARN', 'COLLABORATE']
    colors = [_TRON_CYAN, '#FFA000', '#E91E63']  # tech + saffron + pink
    cx, cy = int(W * 0.22), int(H * 0.50)

    # Render word images
    word_imgs = []
    for w, c in zip(words, colors):
        r = _render_text(w, 'bahnschrift', 11, c)
        if r:
            word_imgs.append(r[0])
        else:
            word_imgs.append(None)

    # 3 word positions
    positions = [(cx - 80, cy - 10), (cx, cy + 10), (cx + 85, cy)]

    # Satellite nodes — start from all 4 edges
    NODE_COUNT = 30
    nodes = []
    for i in range(NODE_COUNT):
        # Random edge start
        edge = random.choice(['top', 'bottom', 'left', 'right'])
        if edge == 'top':
            sx, sy = random.uniform(cx - 120, cx + 120), -20
        elif edge == 'bottom':
            sx, sy = random.uniform(cx - 120, cx + 120), H + 20
        elif edge == 'left':
            sx, sy = -20, random.uniform(cy - 40, cy + 40)
        else:
            sx, sy = W + 20, random.uniform(cy - 40, cy + 40)

        # Target near one of the 3 clusters
        cluster = random.randint(0, 2)
        tx = positions[cluster][0] + random.uniform(-30, 30)
        ty = positions[cluster][1] + random.uniform(-20, 20)
        color = colors[cluster]

        dot = canvas.create_oval(sx - 2, sy - 2, sx + 2, sy + 2,
                                 fill=color, outline='')
        nodes.append({'item': dot, 'sx': sx, 'sy': sy, 'tx': tx, 'ty': ty, 'color': color})

    # Word items (hidden initially, far away)
    word_items = []
    for i, (pos, img) in enumerate(zip(positions, word_imgs)):
        it = canvas.create_image(pos[0], pos[1] - 18, image=img)
        canvas.move(it, 0, H)  # hide below
        word_items.append(it)

    all_items = [n['item'] for n in nodes] + word_items
    state = {'phase': 'converge', 'tick': 0, 'hold': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'converge':
                t = min(state['tick'] / 35.0, 1.0)
                et = _ease_out_cubic(t)
                for n in nodes:
                    nx = n['sx'] + (n['tx'] - n['sx']) * et
                    ny = n['sy'] + (n['ty'] - n['sy']) * et
                    canvas.coords(n['item'], nx - 2, ny - 2, nx + 2, ny + 2)
                if t >= 1.0:
                    state['phase'] = 'words'
                    state['tick'] = 0

            elif p == 'words':
                t = min(state['tick'] / 15.0, 1.0)
                et = _ease_out_cubic(t)
                for wi in word_items:
                    canvas.move(wi, 0, -H * et / 15.0 if state['tick'] <= 15 else 0)
                if state['tick'] == 15:
                    # Snap to correct position
                    for i, wi in enumerate(word_items):
                        canvas.coords(wi, positions[i][0], positions[i][1] - 18)
                    state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                # Gentle pulse
                pulse = math.sin(state['hold'] * 0.12) * 1
                for n in nodes:
                    dx = n['tx'] - cx
                    dy = n['ty'] - cy
                    d = math.sqrt(dx * dx + dy * dy) + 0.01
                    nx = n['tx'] + dx / d * pulse
                    ny = n['ty'] + dy / d * pulse
                    canvas.coords(n['item'], nx - 2, ny - 2, nx + 2, ny + 2)
                if state['hold'] >= 75:
                    state['phase'] = 'scatter'
                    state['tick'] = 0

            elif p == 'scatter':
                state['tick'] += 1
                for n in nodes:
                    canvas.move(n['item'], random.uniform(-3, 3), random.uniform(-3, 3))
                for wi in word_items:
                    canvas.move(wi, 0, 2)
                if state['tick'] >= 20:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(25, anim)
        except Exception:
            pass
    anim()


def _greeting_cosmic(canvas, root, W, H):
    """Stars bloom from center outward, message: EVERYTHING IS POSSIBLE."""
    cx, cy = int(W * 0.22), int(H * 0.45)
    STAR_COUNT = 50
    star_colors = [_TRON_CYAN, '#FFA000', '#E91E63', '#9C27B0', '#00BFA5', _TRON_WHITE]

    stars = []
    for _ in range(STAR_COUNT):
        angle = random.uniform(0, 2 * math.pi)
        speed = random.uniform(1.0, 3.5)
        max_r = random.uniform(30, 100)
        color = random.choice(star_colors)
        sz = random.uniform(1, 2.5)
        dot = canvas.create_oval(cx - sz, cy - sz, cx + sz, cy + sz, fill='', outline='')
        stars.append({'item': dot, 'angle': angle, 'speed': speed,
                      'max_r': max_r, 'dist': 0, 'color': color, 'sz': sz})

    txt1 = canvas.create_text(cx, cy + 50, text='EVERYTHING IS POSSIBLE',
                              fill=_TRON_CYAN, font=(_f('Bahnschrift'), 12), anchor='center')
    txt2 = canvas.create_text(cx, cy + 66,
                              text='\u0BA8\u0BA3\u0BCD\u0BAA\u0BBE believes in you',
                              fill=_TRON_WHITE, font=(_f('Nirmala UI'), 9), anchor='center')
    canvas.move(txt1, 0, H)
    canvas.move(txt2, 0, H)

    all_items = [s['item'] for s in stars] + [txt1, txt2]
    state = {'phase': 'expand', 'tick': 0, 'hold': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'expand':
                all_done = True
                for s in stars:
                    if s['dist'] < s['max_r']:
                        s['dist'] += s['speed']
                        x = cx + s['dist'] * math.cos(s['angle'])
                        y = cy + s['dist'] * math.sin(s['angle'])
                        canvas.coords(s['item'], x - s['sz'], y - s['sz'],
                                      x + s['sz'], y + s['sz'])
                        canvas.itemconfig(s['item'], fill=s['color'])
                        all_done = False
                if all_done:
                    # Show text
                    canvas.coords(txt1, cx, cy + 50)
                    canvas.coords(txt2, cx, cy + 66)
                    state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                for s in stars:
                    s['angle'] += 0.003
                    x = cx + s['dist'] * math.cos(s['angle'])
                    y = cy + s['dist'] * math.sin(s['angle'])
                    canvas.coords(s['item'], x - s['sz'], y - s['sz'],
                                  x + s['sz'], y + s['sz'])
                    if random.random() < 0.03:
                        canvas.itemconfig(s['item'], fill='')
                    elif random.random() < 0.1:
                        canvas.itemconfig(s['item'], fill=s['color'])
                if state['hold'] >= 80:
                    state['phase'] = 'collapse'

            elif p == 'collapse':
                all_back = True
                for s in stars:
                    if s['dist'] > 0:
                        s['dist'] -= s['speed'] * 2
                        if s['dist'] < 0:
                            s['dist'] = 0
                        x = cx + s['dist'] * math.cos(s['angle'])
                        y = cy + s['dist'] * math.sin(s['angle'])
                        canvas.coords(s['item'], x - s['sz'], y - s['sz'],
                                      x + s['sz'], y + s['sz'])
                        all_back = False
                if all_back:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(25, anim)
        except Exception:
            pass
    anim()


def _greeting_thought_cloud(canvas, root, W, H):
    """Thought clouds with real ideas float up, then the tagline appears.

    Each cloud is a proper puffy shape (overlapping ovals) containing a
    thought/idea phrase.  They drift upward with gentle wobble, settle
    in the left zone, then the tagline fades in:
        'Do Thought Experiments'
        'With Crowdsourced Compute'
    """
    cx, cy = int(W * 0.22), int(H * 0.48)

    # ── Thoughts — actual ideas, not single words ──
    thoughts = [
        'What if gravity\nis information?',
        'Cure ageing\nwith AI',
        'Decode\ndreams',
        'Simulate\nthe Big Bang',
        'Map every\nneuron',
        'Reverse\nentropy',
    ]
    colors = [_TRON_CYAN, '#FFA000', '#E91E63', '#9C27B0', '#00BFA5', '#80DEEA']

    # ── Light pastel hue fills — actual cloud colors ──
    LIGHT_FILLS = {
        _TRON_CYAN:  '#B2EBF2',   # light cyan
        '#FFA000':   '#FFE0B2',   # light amber
        '#E91E63':   '#F8BBD0',   # light pink
        '#9C27B0':   '#E1BEE7',   # light lavender
        '#00BFA5':   '#B2DFDB',   # light mint
        '#80DEEA':   '#B2EBF2',   # light ice
    }

    def _make_cloud(x, y, w, h, accent_col):
        """Create a puffy thought cloud filled with a light hue.
        Multiple overlapping filled ovals = soft cloudy silhouette.
        Returns list of canvas item ids."""
        items = []
        fill = LIGHT_FILLS.get(accent_col, '#1A2A35')
        # Build cloud from overlapping filled bumps (no outline)
        bumps = [
            # (cx_off, cy_off, rx_frac, ry_frac) relative to (x, y, w, h)
            (0,     -0.05,  0.50, 0.42),   # main body
            (-0.30, -0.02,  0.30, 0.35),   # left bump
            (0.30,  -0.02,  0.30, 0.35),   # right bump
            (-0.15, -0.28,  0.25, 0.28),   # top-left puff
            (0.15,  -0.28,  0.25, 0.28),   # top-right puff
            (0,     -0.35,  0.18, 0.22),   # crown puff
            (-0.38,  0.10,  0.20, 0.25),   # bottom-left
            (0.38,   0.10,  0.20, 0.25),   # bottom-right
        ]
        for (cox, coy, rx, ry) in bumps:
            bx = x + w * cox
            by = y + h * coy
            brx = w * rx
            bry = h * ry
            items.append(canvas.create_oval(
                bx - brx, by - bry, bx + brx, by + bry,
                fill=fill, outline='', width=0))
        # Thin accent edge on the outermost body for definition
        items.append(canvas.create_oval(
            x - w * 0.48, y - h * 0.40,
            x + w * 0.48, y + h * 0.38,
            fill='', outline=accent_col, width=1))
        return items

    # ── Create the clouds below the visible frame ──
    clouds = []
    zone_w = int(W * 0.38)
    cloud_w = max(int(zone_w * 0.28), 55)
    cloud_h = max(int(H * 0.10), 30)
    # Arrange in 2 rows x 3 columns
    positions = []
    cols, rows = 3, 2
    col_sp = zone_w // (cols + 1)
    row_sp = int(H * 0.14)
    for ri in range(rows):
        for ci in range(cols):
            tx = (cx - zone_w // 2) + (ci + 1) * col_sp
            ty = cy - int(H * 0.08) + ri * row_sp
            positions.append((tx, ty))

    for i, (thought, col) in enumerate(zip(thoughts, colors)):
        tx, ty = positions[i]
        sx = tx                         # start x = final x
        sy = H + 40 + i * 25           # start below frame, staggered

        cloud_parts = _make_cloud(sx, sy, cloud_w, cloud_h, col)
        # Text inside the cloud — dark color for readability on light fill
        txt = canvas.create_text(sx, sy, text=thought,
                                 fill='#1A1A2E', font=(_f('Segoe UI'), 7, 'bold'),
                                 anchor='center', justify='center')
        # Small thought-tail bubbles (filled with same light hue)
        tail_fill = LIGHT_FILLS.get(col, '#B2EBF2')
        tail1 = canvas.create_oval(sx - 3, sy + cloud_h * 0.4,
                                   sx + 3, sy + cloud_h * 0.4 + 6,
                                   fill=tail_fill, outline=col, width=1)
        tail2 = canvas.create_oval(sx - 1.5, sy + cloud_h * 0.4 + 9,
                                   sx + 1.5, sy + cloud_h * 0.4 + 13,
                                   fill=tail_fill, outline=col, width=1)

        all_parts = cloud_parts + [txt, tail1, tail2]
        clouds.append({
            'parts': all_parts, 'y': float(sy), 'x': float(sx),
            'target_x': float(tx), 'target_y': float(ty),
            'speed': 2.5 + random.uniform(0, 1.5),
            'wobble_phase': random.uniform(0, math.pi * 2),
            'arrived': False,
        })

    # ── Tagline (hidden initially) ──
    tag_y = cy + int(H * 0.18)
    r1 = _render_text('Do Thought Experiments', 'bahnschrift', 11, _TRON_CYAN)
    r2 = _render_text('With Crowdsourced Compute', 'bahnschrift', 9, '#FFA000')
    tag1 = canvas.create_image(cx, tag_y, image=r1[0] if r1 else None)
    tag2 = canvas.create_image(cx, tag_y + 16, image=r2[0] if r2 else None)
    canvas.move(tag1, 0, H)
    canvas.move(tag2, 0, H)

    flat_cloud_items = []
    for c in clouds:
        flat_cloud_items.extend(c['parts'])
    all_items = flat_cloud_items + [tag1, tag2]

    state = {'phase': 'rise', 'tick': 0, 'hold': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'rise':
                all_arrived = True
                for c in clouds:
                    if c['arrived']:
                        # Gentle idle wobble
                        c['wobble_phase'] += 0.06
                        dx = math.sin(c['wobble_phase']) * 0.3
                        for it in c['parts']:
                            canvas.move(it, dx, 0)
                        continue
                    # Move upward
                    dy = -c['speed']
                    c['y'] += dy
                    # Slight horizontal wobble while rising
                    c['wobble_phase'] += 0.08
                    dx = math.sin(c['wobble_phase']) * 0.6
                    for it in c['parts']:
                        canvas.move(it, dx, dy)
                    if c['y'] <= c['target_y']:
                        c['arrived'] = True
                    else:
                        all_arrived = False

                if all_arrived:
                    # Show tagline
                    canvas.coords(tag1, cx, tag_y)
                    canvas.coords(tag2, cx, tag_y + 16)
                    state['phase'] = 'hold'
                    state['tick'] = 0

            elif p == 'hold':
                state['hold'] += 1
                # Keep clouds gently bobbing
                for c in clouds:
                    c['wobble_phase'] += 0.04
                    dy = math.sin(c['wobble_phase']) * 0.25
                    dx = math.cos(c['wobble_phase'] * 0.7) * 0.15
                    for it in c['parts']:
                        canvas.move(it, dx, dy)
                if state['hold'] >= 80:
                    state['phase'] = 'fade'
                    state['tick'] = 0

            elif p == 'fade':
                if state['tick'] >= 18:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(28, anim)
        except Exception:
            pass
    anim()


def _greeting_pulse(canvas, root, W, H):
    """Pulse rings expand from center with Tron glow, text: THINK · RESEARCH."""
    cx, cy = int(W * 0.22), int(H * 0.45)
    colors = [_TRON_CYAN, '#FFA000', '#E91E63', '#9C27B0', '#00BFA5']
    rings = []
    for i, c in enumerate(colors):
        r = canvas.create_oval(cx, cy, cx, cy, outline=c, width=2, fill='')
        rings.append({'item': r, 'radius': 0, 'target': 12 + i * 14,
                      'active': False, 'color': c})

    r1 = _render_text('THINK  \u00b7  RESEARCH', 'bahnschrift', 12, _TRON_CYAN)
    r2 = _render_text('curiosity drives evolution', 'segoeui', 9, _TRON_WHITE)
    txt1 = canvas.create_image(cx, cy + 55, image=r1[0] if r1 else None)
    txt2 = canvas.create_image(cx, cy + 72, image=r2[0] if r2 else None)
    canvas.move(txt1, 0, H)
    canvas.move(txt2, 0, H)

    all_items = [r['item'] for r in rings] + [txt1, txt2]
    state = {'phase': 'expand', 'tick': 0, 'ring_idx': 0, 'hold': 0, 'pulse': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'expand':
                all_done = True
                for i, ring in enumerate(rings):
                    if i <= state['ring_idx']:
                        ring['active'] = True
                    if ring['active'] and ring['radius'] < ring['target']:
                        ring['radius'] += 2
                        r = ring['radius']
                        canvas.coords(ring['item'], cx - r, cy - r, cx + r, cy + r)
                        all_done = False
                if state['tick'] % 8 == 0 and state['ring_idx'] < len(rings) - 1:
                    state['ring_idx'] += 1
                if all_done and state['ring_idx'] >= len(rings) - 1:
                    canvas.coords(txt1, cx, cy + 55)
                    canvas.coords(txt2, cx, cy + 72)
                    state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                state['pulse'] += 0.12
                for ring in rings:
                    pr = ring['target'] + math.sin(state['pulse']) * 3
                    canvas.coords(ring['item'], cx - pr, cy - pr, cx + pr, cy + pr)
                if state['hold'] >= 75:
                    state['phase'] = 'fade'
                    state['tick'] = 0

            elif p == 'fade':
                if state['tick'] >= 20:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(25, anim)
        except Exception:
            pass
    anim()


def _greeting_stack(canvas, root, W, H):
    """Blocks drop in from above the frame: DO, WORK, EARN with Tron glow."""
    cx = int(W * 0.22)
    base_y = int(H * 0.72)
    bw, bh = int(W * 0.28), 28
    words = ['DO', 'WORK', 'EARN']
    colors = [_TRON_CYAN, '#FFA000', '#E91E63']

    blocks = []
    for i, (w, c) in enumerate(zip(words, colors)):
        y = base_y - (i + 1) * bh
        rect = canvas.create_rectangle(cx - bw // 2, y, cx + bw // 2, y + bh - 2,
                                       fill='#061A20', outline=c, width=2)
        r = _render_text(w, 'bahnschrift', 14, c)
        txt = canvas.create_image(cx, y + bh // 2, image=r[0] if r else None)
        # Start above the frame
        start_offset = -(y + 60 + i * 40)
        canvas.move(rect, 0, start_offset)
        canvas.move(txt, 0, start_offset)
        blocks.append({'rect': rect, 'txt': txt, 'target_y': y,
                       'offset': float(start_offset), 'landed': False})

    r = _render_text('everything starts with action', 'segoeui', 8, _TRON_CYAN)
    comp_txt = canvas.create_image(cx, base_y + 16, image=r[0] if r else None)
    canvas.move(comp_txt, 0, H)

    all_items = [b['rect'] for b in blocks] + [b['txt'] for b in blocks] + [comp_txt]
    state = {'phase': 'drop', 'tick': 0, 'block_idx': 0, 'hold': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'drop':
                if state['block_idx'] < len(blocks):
                    b = blocks[state['block_idx']]
                    speed = 14
                    b['offset'] += speed
                    canvas.move(b['rect'], 0, speed)
                    canvas.move(b['txt'], 0, speed)
                    if b['offset'] >= 0:
                        ov = b['offset']
                        if ov > 0:
                            canvas.move(b['rect'], 0, -ov)
                            canvas.move(b['txt'], 0, -ov)
                        b['offset'] = 0
                        b['landed'] = True
                        state['block_idx'] += 1
                        state['tick'] = 0
                        if state['block_idx'] >= len(blocks):
                            canvas.coords(comp_txt, cx, base_y + 16)
                            state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                if state['hold'] % 20 < 10:
                    for b in blocks:
                        canvas.itemconfig(b['rect'], fill='#0A2A33')
                else:
                    for b in blocks:
                        canvas.itemconfig(b['rect'], fill='#061A20')
                if state['hold'] >= 80:
                    state['phase'] = 'fade'
                    state['tick'] = 0

            elif p == 'fade':
                if state['tick'] >= 15:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(25, anim)
        except Exception:
            pass
    anim()


def _greeting_wireframe(canvas, root, W, H):
    """Wireframe node face assembles from scattered nodes entering from all edges."""
    cx, cy = int(W * 0.22), int(H * 0.45)
    NODE_COUNT = 100

    targets = []
    for i in range(35):
        a = math.radians(i * 10.3)
        targets.append((cx + 20 * math.cos(a), cy + 22 * math.sin(a)))
    for i in range(10):
        a = math.radians(i * 36)
        targets.append((cx - 8 + 4 * math.cos(a), cy - 6 + 3 * math.sin(a)))
    for i in range(10):
        a = math.radians(i * 36)
        targets.append((cx + 8 + 4 * math.cos(a), cy - 6 + 3 * math.sin(a)))
    for i in range(12):
        a = math.radians(200 + i * 11.7)
        targets.append((cx + 10 * math.cos(a), cy + 6 + 6 * math.sin(a)))
    while len(targets) < NODE_COUNT:
        rx, ry = cx + random.uniform(-18, 18), cy + random.uniform(-20, 20)
        if (rx - cx) ** 2 / 400 + (ry - cy) ** 2 / 484 < 1:
            targets.append((rx, ry))

    nodes = []
    for i in range(NODE_COUNT):
        # Start from random edge
        edge = random.choice(['top', 'bottom', 'left', 'right'])
        if edge == 'top':
            sx, sy = random.uniform(cx - 100, cx + 100), -random.randint(10, 60)
        elif edge == 'bottom':
            sx, sy = random.uniform(cx - 100, cx + 100), H + random.randint(10, 60)
        elif edge == 'left':
            sx, sy = -random.randint(10, 60), random.uniform(cy - 50, cy + 50)
        else:
            sx, sy = W + random.randint(10, 60), random.uniform(cy - 50, cy + 50)
        dot = canvas.create_oval(sx - 1.5, sy - 1.5, sx + 1.5, sy + 1.5,
                                 fill=_TRON_CYAN, outline='')
        nodes.append({'item': dot, 'x': sx, 'y': sy,
                      'tx': targets[i][0], 'ty': targets[i][1]})

    txt1 = canvas.create_text(cx, cy + 30, text='SYSTEM ONLINE',
                              fill=_TRON_CYAN, font=(_f('Consolas'), 11), anchor='center')
    txt2 = canvas.create_text(cx, cy + 48,
                              text="I'm Nunba, your \u0BA8\u0BA3\u0BCD\u0BAA\u0BBE",
                              fill=_TRON_WHITE, font=(_f('Segoe UI'), 9), anchor='center')
    canvas.move(txt1, -W, 0)
    canvas.move(txt2, -W, 0)

    all_items = [n['item'] for n in nodes] + [txt1, txt2]
    state = {'phase': 'converge', 'tick': 0, 'hold': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'converge':
                t = min(state['tick'] / 40.0, 1.0)
                for n in nodes:
                    n['x'] += (n['tx'] - n['x']) * 0.08
                    n['y'] += (n['ty'] - n['y']) * 0.08
                    canvas.coords(n['item'], n['x'] - 1.5, n['y'] - 1.5,
                                  n['x'] + 1.5, n['y'] + 1.5)
                    if t > 0.7:
                        canvas.itemconfig(n['item'], fill='#E0F7FA')
                if t >= 1.0:
                    # Show text sliding from left
                    state['phase'] = 'show_text'
                    state['tick'] = 0

            elif p == 'show_text':
                t = min(state['tick'] / 15.0, 1.0)
                et = _ease_out_cubic(t)
                canvas.coords(txt1, -W + (cx + W) * et, cy + 30)
                canvas.coords(txt2, -W + (cx + W) * et, cy + 48)
                if t >= 1.0:
                    state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                pulse = math.sin(state['hold'] * 0.1) * 0.8
                for n in nodes:
                    dx = n['tx'] - cx
                    dy = n['ty'] - cy
                    d = math.sqrt(dx * dx + dy * dy) + 0.01
                    nx = n['tx'] + dx / d * pulse
                    ny = n['ty'] + dy / d * pulse
                    canvas.coords(n['item'], nx - 1.5, ny - 1.5, nx + 1.5, ny + 1.5)
                if state['hold'] >= 70:
                    state['phase'] = 'scatter'
                    state['tick'] = 0

            elif p == 'scatter':
                state['tick'] += 1
                for n in nodes:
                    canvas.move(n['item'], random.uniform(-4, 4), random.uniform(-4, 4))
                canvas.move(txt1, 5, 0)
                canvas.move(txt2, 5, 0)
                if state['tick'] >= 18:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(25, anim)
        except Exception:
            pass
    anim()


def _greeting_hourglass(canvas, root, W, H):
    """Hevolve logo — H-shaped hourglass with ribbon pillars.

    Faithful to the actual Hevolve logo:
    - Two vertical ribbon/pennant pillars (5 color bands each:
      cyan → blue → black → magenta → purple) with pointed bottoms.
    - Center hourglass: square-topped upper bulb (neural network inside),
      yellow plug connector at the neck, rounded lower bulb (brain inside).
    - The overall silhouette forms the letter H.

    Knowledge particles flow NN→Brain (cyan, downward) and Brain→NN
    (magenta, upward) through the neck connector simultaneously.

    Three taglines phase in:
      1. Self-Evolving AI
      2. At Core — HART Agentic Intelligence
      3. Hyper-Personalised UI/UX
    """
    cx, cy = int(W * 0.22), int(H * 0.48)

    # ── Overall dimensions ──
    total_h = int(H * 0.36)
    half_h = total_h // 2
    glass_w = int(W * 0.055)      # hourglass bulb half-width
    ribbon_w = max(int(W * 0.018), 6)  # ribbon strip width
    ribbon_gap = glass_w + int(W * 0.015)  # distance from cx to ribbon center

    top_y = cy - half_h
    bot_y = cy + half_h
    neck_y = cy                    # hourglass pinch point

    # ── Logo colors (from the actual image) ──
    CYAN = '#00FFCC'
    BLUE = '#0097F6'
    BLACK_BAND = '#111111'
    MAGENTA = '#E91E63'
    PURPLE = '#7B1FA2'
    NN_COLOR = '#2196F3'          # neural net blue
    BRAIN_COLOR = '#E91E63'       # brain magenta
    PLUG_YELLOW = '#FFD600'
    FRAME_UPPER = '#80DEEA'       # upper bulb outline (light cyan)
    FRAME_LOWER = '#F48FB1'       # lower bulb outline (light pink)

    # ── Helper: draw a 3D ribbon pillar (stacked strips, Y-rotation at top) ──
    BAND_COLORS = [CYAN, BLUE, BLACK_BAND, MAGENTA, PURPLE]
    STRIP_COUNT = 3
    # Horizontal gap between stacked strips (pure lateral offset, no tilt)
    STRIP_GAP = max(int(ribbon_w * 0.55), 3)

    def _dim(hex_col, d):
        """Darken a hex color by factor d (0=none, 1=black)."""
        rv = int(hex_col[1:3], 16)
        gv = int(hex_col[3:5], 16)
        bv = int(hex_col[5:7], 16)
        rv = int(rv * (1 - d))
        gv = int(gv * (1 - d))
        bv = int(bv * (1 - d))
        return f'#{rv:02x}{gv:02x}{bv:02x}'

    def _draw_ribbon(pil_cx, side='left'):
        """Draw 3 stacked vertical ribbon strips.  All strips are perfectly
        vertical (no skew/tilt).  The 3D depth comes from lateral stacking:
        back strips are offset outward from the hourglass center and slightly
        darkened, front strip sits closest to center.
        """
        items = []
        band_h = (total_h - 8) / len(BAND_COLORS)
        hw = ribbon_w // 2
        direction = -1 if side == 'left' else 1

        for si in range(STRIP_COUNT):
            # si=0 → back (furthest from hourglass), si=last → front (closest)
            depth = STRIP_COUNT - 1 - si
            # Lateral offset: back strips pushed outward
            lateral_dx = direction * depth * STRIP_GAP
            darken = 0.12 * depth   # dim back strips

            for bi, col in enumerate(BAND_COLORS):
                by1 = top_y + bi * band_h
                by2 = top_y + (bi + 1) * band_h
                pts = [pil_cx - hw + lateral_dx, by1,
                       pil_cx + hw + lateral_dx, by1,
                       pil_cx + hw + lateral_dx, by2,
                       pil_cx - hw + lateral_dx, by2]
                r = canvas.create_polygon(pts, fill=_dim(col, darken),
                                          outline='', width=0)
                items.append(r)

            # Pointed/pennant bottom
            last_y = top_y + len(BAND_COLORS) * band_h
            tip_y = last_y + int(band_h * 0.6)
            tri = canvas.create_polygon(
                pil_cx - hw + lateral_dx, last_y,
                pil_cx + hw + lateral_dx, last_y,
                pil_cx + lateral_dx, tip_y,
                fill=_dim(PURPLE, darken), outline='')
            items.append(tri)

        return items

    # Left and right ribbon pillars
    left_ribbon_cx = cx - ribbon_gap
    right_ribbon_cx = cx + ribbon_gap
    ribbon_items = _draw_ribbon(left_ribbon_cx, side='left')
    ribbon_items += _draw_ribbon(right_ribbon_cx, side='right')

    # ── Upper bulb (square-topped, downward-pointing NN) ──
    upper_hw = glass_w
    upper_top = top_y + int(total_h * 0.08)
    neck_hw = max(3, int(W * 0.005))
    # Square-ish top corners, tapering to narrow neck (single output neuron)
    upper_pts = [
        cx - upper_hw, upper_top,
        cx + upper_hw, upper_top,
        cx + upper_hw, upper_top + int(total_h * 0.10),
        cx + neck_hw, neck_y,
        cx - neck_hw, neck_y,
        cx - upper_hw, upper_top + int(total_h * 0.10),
    ]
    upper_glass = canvas.create_polygon(upper_pts, fill='', outline=FRAME_UPPER,
                                        width=1, smooth=False)

    # ── Lower bulb (rounded dome for brain cross-section) ──
    lower_hw = glass_w
    lower_bot = bot_y - int(total_h * 0.08)
    dome_pts = [cx - neck_hw, neck_y, cx + neck_hw, neck_y]
    steps = 16
    for i in range(steps + 1):
        t = i / steps
        angle = math.radians(-90 + t * 180)
        px = cx + lower_hw * math.cos(angle)
        py = neck_y + (lower_bot - neck_y) * 0.5 + (lower_bot - neck_y) * 0.5 * math.sin(angle)
        dome_pts.extend([px, py])
    lower_glass = canvas.create_polygon(dome_pts, fill='', outline=FRAME_LOWER,
                                        width=1, smooth=True)

    # ── Neural Network inside upper bulb — proper layered architecture ──
    # Layer widths narrow from input(top) → hidden → output(bottom=1 neuron)
    nn_items = []
    nn_layers = []  # list of lists of (x, y) positions per layer
    nn_dots = []    # flat list of all node canvas items
    layer_sizes = [5, 4, 3, 1]  # input → hidden1 → hidden2 → output
    nn_region_top = upper_top + 6
    nn_region_bot = neck_y - 6
    layer_spacing = (nn_region_bot - nn_region_top) / (len(layer_sizes) - 1)

    for li, count in enumerate(layer_sizes):
        ly = nn_region_top + li * layer_spacing
        # Width narrows per layer (matching the tapered bulb)
        frac_down = li / (len(layer_sizes) - 1)
        layer_w = upper_hw * 0.75 * (1.0 - frac_down * 0.85)
        positions = []
        for ni in range(count):
            if count == 1:
                nx = cx
            else:
                nx = cx - layer_w + ni * (2 * layer_w / (count - 1))
            positions.append((nx, ly))
        nn_layers.append(positions)

    # Connection lines between adjacent layers
    for li in range(len(nn_layers) - 1):
        for (ax, ay) in nn_layers[li]:
            for (bx, by) in nn_layers[li + 1]:
                l = canvas.create_line(ax, ay, bx, by,
                                       fill='#0D3B66', width=1)
                nn_items.append(l)
    # Nodes on top (start dim, will light up during animation)
    NN_DIM = '#0D3B66'
    for layer in nn_layers:
        for (nx, ny) in layer:
            d = canvas.create_oval(nx - 3, ny - 3, nx + 3, ny + 3,
                                   fill=NN_DIM, outline=NN_COLOR)
            nn_items.append(d)
            nn_dots.append(d)
    # Output neuron (bottom of NN, right at neck) — special highlight
    output_neuron = nn_dots[-1]

    # ── Yellow plug connector at neck ──
    plug_items = []
    pr = max(3, int(W * 0.006))
    plug_body = canvas.create_rectangle(cx - pr, neck_y - pr,
                                        cx + pr, neck_y + pr,
                                        fill=PLUG_YELLOW, outline='#FFA000', width=1)
    plug_items.append(plug_body)
    # Two prongs above plug
    prong_w = max(1, pr // 3)
    for pdx in (-prong_w - 1, prong_w):
        prong = canvas.create_line(cx + pdx, neck_y - pr,
                                   cx + pdx, neck_y - pr - 3,
                                   fill=PLUG_YELLOW, width=max(1, prong_w))
        plug_items.append(prong)

    # ── Brain cross-section (transverse / top-down view) inside lower bulb ──
    brain_items = []
    brain_cy = neck_y + (lower_bot - neck_y) * 0.55
    brain_rx = int(glass_w * 0.62)     # horizontal radius
    brain_ry = int(glass_w * 0.45)     # vertical radius (shorter = top-down oval)

    # Outer brain outline (full oval)
    brain_outline = canvas.create_oval(cx - brain_rx, brain_cy - brain_ry,
                                       cx + brain_rx, brain_cy + brain_ry,
                                       fill='', outline=BRAIN_COLOR, width=1)
    brain_items.append(brain_outline)

    # Longitudinal fissure (vertical center line, top to bottom of oval)
    fissure = canvas.create_line(cx, brain_cy - brain_ry,
                                 cx, brain_cy + brain_ry,
                                 fill='#AD1457', width=1)
    brain_items.append(fissure)

    # Left hemisphere fill (starts empty, fills with color as knowledge arrives)
    # Pre-draw fill arcs as hidden crescents from bottom up
    BRAIN_FILL_STEPS = 14  # many thin slices for smooth liquid fill
    brain_fill_left = []
    brain_fill_right = []
    fill_step_h = (2 * brain_ry) / BRAIN_FILL_STEPS
    for fi in range(BRAIN_FILL_STEPS):
        # Each step is a thin horizontal slice of the hemisphere
        fy = brain_cy + brain_ry - (fi + 1) * fill_step_h  # bottom-up
        fh = fill_step_h
        # Left hemisphere slice
        lf = canvas.create_rectangle(cx - brain_rx + 1, fy,
                                     cx - 1, fy + fh,
                                     fill=BRAIN_COLOR, outline='', width=0)
        canvas.itemconfig(lf, state='hidden')
        brain_fill_left.append(lf)
        brain_items.append(lf)
        # Right hemisphere slice
        rf = canvas.create_rectangle(cx + 1, fy,
                                     cx + brain_rx - 1, fy + fh,
                                     fill=BRAIN_COLOR, outline='', width=0)
        canvas.itemconfig(rf, state='hidden')
        brain_fill_right.append(rf)
        brain_items.append(rf)

    # Sulci / gyri folds (wavy lines across each hemisphere)
    for side in (-1, 1):
        for fi in range(3):
            fy = brain_cy - brain_ry * 0.5 + fi * (brain_ry * 0.5)
            fw = brain_rx * 0.6
            fold_pts = []
            for si in range(8):
                t = si / 7
                fx = (cx + side * brain_rx * 0.1) + side * fw * t
                wobble = math.sin(t * math.pi * 2.5) * (brain_ry * 0.08)
                fold_pts.extend([fx, fy + wobble])
            fold = canvas.create_line(*fold_pts, fill='#880E4F', width=1,
                                      smooth=True)
            brain_items.append(fold)

    # ── Knowledge particles — continuous liquid stream (always fall down) ──
    PARTICLE_COUNT = 18  # dense stream for liquid feel
    particles = []
    flow_src = nn_region_bot - 4
    flow_dst = brain_cy - brain_ry + 4
    for i in range(PARTICLE_COUNT):
        delay = i * 2  # rapid staggering = continuous stream
        dot = canvas.create_oval(0, 0, 0, 0, fill=NN_COLOR, outline='')
        canvas.itemconfig(dot, state='hidden')
        particles.append({
            'item': dot,
            'sy': float(flow_src), 'ty': float(flow_dst),
            'y': float(flow_src),
            'x': cx + random.uniform(-neck_hw, neck_hw),
            'delay': delay, 'active': False,
            'speed': 1.8 + random.uniform(0, 0.6),
        })

    # ── Tagline texts (phased reveal) ──
    taglines = [
        ('Self-Evolving AI', BLUE, (_f('Bahnschrift'), 8)),
        ('At Core \u2014 HART Agentic Intelligence', NN_COLOR, (_f('Bahnschrift'), 7)),
        ('Hyper-Personalised UI/UX', MAGENTA, (_f('Segoe UI'), 7)),
    ]
    tag_items = []
    tag_y_start = bot_y + 8
    for i, (txt, col, fnt) in enumerate(taglines):
        t = canvas.create_text(cx, tag_y_start + i * 13,
                               text=txt, fill=col, font=fnt, anchor='center')
        canvas.move(t, 0, H)
        tag_items.append(t)

    # Collect all items that are part of the hourglass (for flip + cleanup)
    hourglass_items = (ribbon_items +
                       [upper_glass, lower_glass] +
                       nn_items + plug_items + brain_items)
    all_items = (hourglass_items +
                 [p['item'] for p in particles] + tag_items)

    state = {'phase': 'flow_nn', 'tick': 0, 'hold': 0,
             'tags_shown': 0,
             'brain_filled': 0,
             'nn_lit': 0,
             'arrivals': 0,
             'flipped': False}

    def _move_particles_down():
        """Move all active particles downward continuously; recycle on arrival."""
        for pt in particles:
            if not pt['active']:
                continue
            pt['y'] += pt['speed']
            # Narrow funnel near neck, spread in bulbs
            dist_to_neck = abs(pt['y'] - cy)
            if dist_to_neck < half_h * 0.25:
                pt['x'] += (cx - pt['x']) * 0.25  # converge to center
            else:
                pt['x'] += random.uniform(-0.4, 0.4)
            r = 1.5
            canvas.coords(pt['item'],
                          pt['x'] - r, pt['y'] - r,
                          pt['x'] + r, pt['y'] + r)
            if pt['y'] >= pt['ty']:
                state['arrivals'] += 1
                pt['y'] = float(pt['sy'])
                pt['x'] = cx + random.uniform(-neck_hw, neck_hw)

    def _fill_brain():
        """Fill brain like liquid from bottom up — every arrival adds a slice."""
        target = min(state['arrivals'], BRAIN_FILL_STEPS)
        while state['brain_filled'] < target:
            idx = state['brain_filled']
            canvas.itemconfig(brain_fill_left[idx], state='normal')
            canvas.itemconfig(brain_fill_right[idx], state='normal')
            state['brain_filled'] += 1

    def _fill_nn():
        """Light NN nodes from output upward — every arrival adds a node."""
        target = min(state['arrivals'], len(nn_dots))
        while state['nn_lit'] < target:
            idx = len(nn_dots) - 1 - state['nn_lit']  # bottom-up
            canvas.itemconfig(nn_dots[idx], fill=NN_COLOR)
            state['nn_lit'] += 1

    def _do_flip():
        """Flip the hourglass vertically around cy — brain goes to top,
        NN goes to bottom.  Particles restart as brain-colored liquid."""
        for pt in particles:
            canvas.itemconfig(pt['item'], state='hidden')
            pt['active'] = False

        for it in hourglass_items:
            canvas.scale(it, cx, cy, 1, -1)

        new_src = 2 * cy - flow_dst   # brain side (now top)
        new_dst = 2 * cy - flow_src   # NN side (now bottom)
        for i, pt in enumerate(particles):
            pt['sy'] = float(new_src)
            pt['ty'] = float(new_dst)
            pt['y'] = float(new_src)
            pt['x'] = cx + random.uniform(-neck_hw, neck_hw)
            canvas.itemconfig(pt['item'], fill=BRAIN_COLOR)
            pt['delay'] = i * 2  # rapid restart

        state['arrivals'] = 0
        state['flipped'] = True

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            # ── Phase 1: NN on top → liquid falls → brain fills ──
            if p == 'flow_nn':
                for pt in particles:
                    if not pt['active'] and state['tick'] >= pt['delay']:
                        pt['active'] = True
                        pt['y'] = float(pt['sy'])
                        pt['x'] = cx + random.uniform(-neck_hw, neck_hw)
                        canvas.itemconfig(pt['item'], state='normal')

                _move_particles_down()
                _fill_brain()

                canvas.itemconfig(output_neuron, fill=PLUG_YELLOW)

                # Phase-in taglines
                if state['tags_shown'] < len(taglines):
                    interval = 28
                    if state['tick'] >= 20 + state['tags_shown'] * interval:
                        idx = state['tags_shown']
                        canvas.coords(tag_items[idx],
                                      cx, tag_y_start + idx * 13)
                        state['tags_shown'] += 1

                if state['tick'] >= 110:
                    state['phase'] = 'flip'
                    state['tick'] = 0

            # ── Flip transition ──
            elif p == 'flip':
                if state['tick'] == 1:
                    _do_flip()
                if state['tick'] >= 12:
                    state['phase'] = 'flow_brain'
                    state['tick'] = 0

            # ── Phase 2: Brain on top → liquid falls → NN lights up ──
            elif p == 'flow_brain':
                for pt in particles:
                    if not pt['active'] and state['tick'] >= pt['delay']:
                        pt['active'] = True
                        pt['y'] = float(pt['sy'])
                        pt['x'] = cx + random.uniform(-neck_hw, neck_hw)
                        canvas.itemconfig(pt['item'], state='normal')

                _move_particles_down()
                _fill_nn()

                if state['tick'] >= 110:
                    state['phase'] = 'hold'
                    state['tick'] = 0

            # ── Hold (particles keep flowing) ──
            elif p == 'hold':
                state['hold'] += 1
                _move_particles_down()
                if not state['flipped']:
                    _fill_brain()
                else:
                    _fill_nn()

                if state['hold'] % 16 < 8:
                    canvas.itemconfig(plug_body, fill='#FFFF00')
                else:
                    canvas.itemconfig(plug_body, fill=PLUG_YELLOW)

                if state['hold'] >= 55:
                    state['phase'] = 'fade'
                    state['tick'] = 0

            # ── Fade out ──
            elif p == 'fade':
                if state['tick'] >= 18:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(28, anim)
        except Exception:
            pass
    anim()


def _greeting_hive_mind(canvas, root, W, H):
    """Hexagonal hive nodes connect and pulse — the collective intelligence."""
    cx, cy = int(W * 0.22), int(H * 0.48)
    HEX_R = max(int(W * 0.028), 8)
    NODE_COLOR = _TRON_DIM
    GLOW_COLOR = _TRON_CYAN

    # Honeycomb positions (3 rings around center)
    positions = [(cx, cy)]  # center
    for ring in range(1, 3):
        for i in range(6 * ring):
            a = math.radians(i * (360 / (6 * ring)))
            r = HEX_R * 2.2 * ring
            positions.append((cx + r * math.cos(a), cy + r * math.sin(a)))

    # Draw hexagons (start hidden, reveal sequentially)
    hexes = []
    for i, (hx, hy) in enumerate(positions):
        pts = []
        for a_i in range(6):
            angle = math.radians(60 * a_i + 30)
            pts.extend([hx + HEX_R * math.cos(angle),
                        hy + HEX_R * math.sin(angle)])
        item = canvas.create_polygon(pts, fill='', outline=NODE_COLOR, width=1)
        canvas.itemconfig(item, state='hidden')
        # Center dot
        dot = canvas.create_oval(hx - 2, hy - 2, hx + 2, hy + 2,
                                 fill=NODE_COLOR, outline='')
        canvas.itemconfig(dot, state='hidden')
        hexes.append({'hex': item, 'dot': dot, 'x': hx, 'y': hy,
                      'revealed': False})

    # Connection lines (to be drawn during animation)
    conn_items = []

    # Text
    txt1 = canvas.create_text(cx, cy + int(H * 0.22),
                               text='HIVE MIND',
                               fill=_TRON_CYAN, font=(_f('Bahnschrift'), 12),
                               anchor='center')
    txt2 = canvas.create_text(cx, cy + int(H * 0.22) + 18,
                               text='connected. collective. caring.',
                               fill='#FFA000', font=(_f('Segoe UI'), 8),
                               anchor='center')
    canvas.move(txt1, 0, H)
    canvas.move(txt2, 0, H)

    all_items = ([h['hex'] for h in hexes] + [h['dot'] for h in hexes] +
                 [txt1, txt2])
    state = {'phase': 'reveal', 'tick': 0, 'idx': 0, 'hold': 0, 'pulse': 0}

    def anim():
        try:
            p = state['phase']
            state['tick'] += 1

            if p == 'reveal':
                # Reveal hexagons one by one (center → outward)
                if state['tick'] % 3 == 0 and state['idx'] < len(hexes):
                    h = hexes[state['idx']]
                    canvas.itemconfig(h['hex'], state='normal',
                                      outline=GLOW_COLOR)
                    canvas.itemconfig(h['dot'], state='normal',
                                      fill=GLOW_COLOR)
                    h['revealed'] = True
                    # Draw connection to a previous hex
                    if state['idx'] > 0:
                        prev = hexes[max(0, state['idx'] - 1)]
                        line = canvas.create_line(
                            prev['x'], prev['y'], h['x'], h['y'],
                            fill=_TRON_DIM, width=1)
                        conn_items.append(line)
                        all_items.append(line)
                    state['idx'] += 1

                # After reveal, dim to steady state
                if state['idx'] >= len(hexes):
                    for h in hexes:
                        canvas.itemconfig(h['hex'], outline=_TRON_DIM)
                        canvas.itemconfig(h['dot'], fill=_TRON_DIM)
                    state['phase'] = 'connect'
                    state['tick'] = 0
                    state['idx'] = 0

            elif p == 'connect':
                # Light up connection paths sequentially
                if state['tick'] % 4 == 0 and state['idx'] < len(conn_items):
                    canvas.itemconfig(conn_items[state['idx']],
                                      fill=GLOW_COLOR)
                    state['idx'] += 1
                if state['idx'] >= len(conn_items):
                    # Show text
                    canvas.coords(txt1, cx, cy + int(H * 0.22))
                    canvas.coords(txt2, cx, cy + int(H * 0.22) + 18)
                    state['phase'] = 'hold'

            elif p == 'hold':
                state['hold'] += 1
                state['pulse'] += 0.15
                # Pulse random hexes
                pi = int(state['pulse']) % len(hexes)
                for i, h in enumerate(hexes):
                    if i == pi:
                        canvas.itemconfig(h['hex'], outline=GLOW_COLOR)
                        canvas.itemconfig(h['dot'], fill=GLOW_COLOR)
                    else:
                        canvas.itemconfig(h['hex'], outline=_TRON_DIM)
                        canvas.itemconfig(h['dot'], fill=_TRON_DIM)
                if state['hold'] >= 75:
                    state['phase'] = 'fade'
                    state['tick'] = 0

            elif p == 'fade':
                if state['tick'] >= 18:
                    for it in all_items:
                        canvas.delete(it)
                    return

            root.after(30, anim)
        except Exception:
            pass
    anim()


# ═══════════════════════════════════════════════════════════════
#  REGISTRY AND MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════

GREETING_EFFECTS = [
    _greeting_classic,        # 0: Wireframe face from scattered nodes
    _greeting_wireframe,      # 1: Node face from all edges
    _greeting_matrix,         # 2: Matrix rain — Indian scripts
    _greeting_bee,            # 3: Bee buzzes into left zone
    _greeting_multilingual,   # 4: Indian greeting sweeps in
    _greeting_neural,         # 5: TEACH LEARN COLLABORATE nodes
    _greeting_hive_mind,      # 6: Hexagonal hive connections pulse
    _greeting_thought_cloud,  # 7: Thought bubbles from below
    _greeting_cosmic,         # 8: Stars bloom, EVERYTHING IS POSSIBLE
]

EFFECT_NAMES = [
    'Classic Friend', 'Wireframe Node', 'Matrix Rain', 'Honey Bee',
    'Multilingual', 'Neural Network', 'Hive Mind',
    'Thought Cloud', 'Cosmic Bloom',
]




def run_splash_animation(canvas, root, W, H, force_index=None):
    """Main entry point: typewrite நண்பா, then loop greeting effects forever.

    The animation keeps cycling through all 10 greeting effects until
    root.destroy() is called (when the main Nunba window is ready).
    Each greeting cleans up its own canvas items before the next starts.

    Args:
        canvas: tk.Canvas to draw on (should have dark bg already)
        root: tk.Tk root window
        W, H: canvas dimensions
        force_index: override starting greeting index
    """
    import logging
    log = logging.getLogger(__name__)

    if not _HAS_PIL:
        log.debug("PIL not available, skipping splash animation")
        return

    # 1. Place all static elements (native canvas text) + get நண்பா y
    nunba_y, rx, ns_cx, ns_cy, ns_r = _build_splash_elements(canvas, W, H)

    # 1b. Persistent Tron ambient particles — float in left zone forever
    lx = int(W * 0.22)
    lzone_hw = int(W * 0.19)  # half-width of left zone
    _TRON_PARTICLE_COUNT = 12
    tron_particles = []
    for _ in range(_TRON_PARTICLE_COUNT):
        px = lx + random.uniform(-lzone_hw + 5, lzone_hw - 5)
        py = random.uniform(H * 0.12, H * 0.88)
        pc = random.choice(_TRON_GLOW_COLORS)
        pr = random.uniform(1.0, 2.0)
        speed = random.uniform(0.15, 0.45)
        drift_x = random.uniform(-0.2, 0.2)
        alpha_phase = random.uniform(0, math.pi * 2)
        dot = canvas.create_oval(px - pr, py - pr, px + pr, py + pr,
                                 fill=pc, outline='')
        tron_particles.append({
            'item': dot, 'x': px, 'y': py, 'r': pr,
            'speed': speed, 'drift_x': drift_x,
            'color': pc, 'phase': alpha_phase,
        })

    # Tron data stream — dots flowing down the separator line
    sep_x = int(W * 0.47)
    _DATA_DOTS = 5
    data_stream = []
    for i in range(_DATA_DOTS):
        dy = random.uniform(H * 0.08, H * 0.92)
        dd = canvas.create_oval(sep_x - 1, dy - 1, sep_x + 1, dy + 1,
                                fill=_TRON_DIM, outline='')
        data_stream.append({'item': dd, 'y': dy,
                            'speed': random.uniform(0.8, 1.8)})

    def _tron_ambient():
        """Animate floating particles + data stream — runs forever alongside greetings."""
        try:
            # Float particles gently
            for p in tron_particles:
                p['y'] -= p['speed']
                p['x'] += p['drift_x']
                p['phase'] += 0.04
                # Wrap around
                if p['y'] < H * 0.08:
                    p['y'] = H * 0.90
                    p['x'] = lx + random.uniform(-lzone_hw + 5, lzone_hw - 5)
                # Gentle horizontal bounds
                if p['x'] < lx - lzone_hw + 3 or p['x'] > lx + lzone_hw - 3:
                    p['drift_x'] *= -1
                # Pulse visibility (flicker like Tron particles)
                vis = math.sin(p['phase']) * 0.5 + 0.5
                if vis > 0.3:
                    canvas.coords(p['item'],
                                  p['x'] - p['r'], p['y'] - p['r'],
                                  p['x'] + p['r'], p['y'] + p['r'])
                    canvas.itemconfig(p['item'], fill=p['color'])
                else:
                    canvas.itemconfig(p['item'], fill=_TRON_DIM)

            # Data stream dots flow down separator
            for d in data_stream:
                d['y'] += d['speed']
                if d['y'] > H * 0.92:
                    d['y'] = H * 0.08
                    d['speed'] = random.uniform(0.8, 1.8)
                canvas.coords(d['item'],
                              sep_x - 1, d['y'] - 1, sep_x + 1, d['y'] + 1)
                # Brighten occasionally — Tron cyan or festival color flash
                if random.random() < 0.03:
                    canvas.itemconfig(d['item'],
                                      fill=random.choice(_FESTIVAL_TRON))
                elif random.random() < 0.08:
                    canvas.itemconfig(d['item'], fill=_TRON_DIM)

            root.after(50, _tron_ambient)
        except Exception:
            pass  # Window destroyed — stop naturally

    _tron_ambient()

    # 1c. Animated neutron star — electrons orbit the nucleus
    # Static parts: glowing core + 3 tilted orbital rings
    core_r = max(ns_r // 5, 3)
    # Layered glow halo (outermost → innermost, increasing brightness)
    for gr, gc in [(core_r + 10, '#0D0A20'), (core_r + 7, '#1A1545'),
                   (core_r + 5, '#2A2060'), (core_r + 3, '#3A3080')]:
        canvas.create_oval(ns_cx - gr, ns_cy - gr,
                           ns_cx + gr, ns_cy + gr,
                           fill=gc, outline='')
    # Core
    canvas.create_oval(ns_cx - core_r, ns_cy - core_r,
                       ns_cx + core_r, ns_cy + core_r,
                       fill='#6C63FF', outline='#9A92FF')
    # Hot white center
    canvas.create_oval(ns_cx - 2, ns_cy - 2, ns_cx + 2, ns_cy + 2,
                       fill='#FFFFFE', outline='')

    # Orbital ring definitions: (tilt_factor, rotation_deg)
    _orbits = [
        (0.35, 18),
        (0.60, -30),
        (0.85, 45),
    ]
    # Draw static orbital ellipse paths (faint)
    for tilt, rot_deg in _orbits:
        rot = math.radians(rot_deg)
        pts = []
        for i in range(48):
            a = math.radians(i * 7.5)
            x = ns_r * 0.92 * math.cos(a)
            y = ns_r * 0.92 * math.sin(a) * tilt
            rx_pt = ns_cx + x * math.cos(rot) - y * math.sin(rot)
            ry_pt = ns_cy + x * math.sin(rot) + y * math.cos(rot)
            pts.extend([rx_pt, ry_pt])
        canvas.create_line(*pts, fill='#1E1845', width=1, smooth=True)

    # Orbiting electron particles (animated)
    _electrons = []
    electron_defs = [
        # (orbit_idx, start_angle, speed, color, radius)
        (0, 0, 0.06, '#FFA000', 2.5),
        (0, 180, 0.06, '#E8A317', 2.0),
        (1, 90, 0.045, '#FFB300', 2.0),
        (1, 270, 0.045, '#E91E63', 2.5),   # the one red
        (2, 45, 0.035, '#FFA000', 2.0),
        (2, 200, 0.035, '#D4A843', 2.5),
    ]
    for orbit_idx, start_deg, speed, color, er in electron_defs:
        dot = canvas.create_oval(0, 0, 0, 0, fill=color, outline='')
        _electrons.append({
            'item': dot, 'orbit': orbit_idx,
            'angle': math.radians(start_deg), 'speed': speed,
            'color': color, 'r': er,
        })

    def _neutron_spin():
        """Spin electrons around the nucleus — runs forever."""
        try:
            for e in _electrons:
                tilt, rot_deg = _orbits[e['orbit']]
                rot = math.radians(rot_deg)
                e['angle'] += e['speed']
                x = ns_r * 0.92 * math.cos(e['angle'])
                y = ns_r * 0.92 * math.sin(e['angle']) * tilt
                px = ns_cx + x * math.cos(rot) - y * math.sin(rot)
                py = ns_cy + x * math.sin(rot) + y * math.cos(rot)
                r = e['r']
                canvas.coords(e['item'], px - r, py - r, px + r, py + r)
            root.after(30, _neutron_spin)
        except Exception:
            pass

    _neutron_spin()

    # 1d. Matrix-style typing: "Connecting To Your HART Region" — left half, above progress bar
    _CONNECT_TEXT = 'Connecting To Your HART Region'
    _CONNECT_FONT = (_f('Consolas'), max(int(H * 0.023), 7))
    _CONNECT_X = int(W * 0.23)            # centered in left half
    _CONNECT_Y = int(H * 0.83)           # just above status/progress bar area
    _connect_item = canvas.create_text(
        _CONNECT_X, _CONNECT_Y, text='', fill=_TRON_CYAN,
        font=_CONNECT_FONT, anchor='center')
    # Cursor block that sits at the end of typed text
    _cursor_item = canvas.create_text(
        _CONNECT_X, _CONNECT_Y, text='\u2588', fill=_TRON_CYAN,
        font=(_f('Consolas'), max(int(H * 0.023), 7)), anchor='w')
    _matrix_state = {'idx': 0, 'text': '', 'phase': 'typing',
                     'blink': 0, 'scramble': 0}

    def _matrix_type():
        """Type out 'Connecting To Your HART Region' one char at a time,
        with random matrix-style character scramble before each settles."""
        try:
            ms = _matrix_state
            if ms['phase'] == 'typing':
                if ms['idx'] < len(_CONNECT_TEXT):
                    target_ch = _CONNECT_TEXT[ms['idx']]
                    if ms['scramble'] < 3:
                        # Show random scramble character before the real one
                        scramble_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*'
                        rnd = random.choice(scramble_chars) if target_ch != ' ' else ' '
                        display = ms['text'] + rnd
                        canvas.itemconfig(_connect_item, text=display,
                                          fill=_TRON_CYAN)
                        ms['scramble'] += 1
                        root.after(35, _matrix_type)
                    else:
                        # Settle to the real character
                        ms['text'] += target_ch
                        canvas.itemconfig(_connect_item, text=ms['text'],
                                          fill=_TRON_CYAN)
                        ms['idx'] += 1
                        ms['scramble'] = 0
                        # Move cursor to end of text
                        bb = canvas.bbox(_connect_item)
                        if bb:
                            canvas.coords(_cursor_item, bb[2] + 1, _CONNECT_Y)
                        delay = 30 if target_ch == ' ' else 55 + random.randint(0, 30)
                        root.after(delay, _matrix_type)
                else:
                    # Typing done — blink cursor then hide it
                    ms['phase'] = 'cursor_blink'
                    ms['blink'] = 0
                    # Final color: warm gold
                    canvas.itemconfig(_connect_item, fill='#94A1B2')
                    root.after(200, _matrix_type)

            elif ms['phase'] == 'cursor_blink':
                # Blink forever until splash is destroyed
                ms['blink'] += 1
                if ms['blink'] % 2 == 0:
                    canvas.itemconfig(_cursor_item, fill=_TRON_CYAN)
                else:
                    canvas.itemconfig(_cursor_item, fill='#0F0E17')
                root.after(500, _matrix_type)
        except Exception:
            pass

    # Start the matrix typing after a brief delay (let typewriter start first)
    root.after(600, _matrix_type)

    # 2. Pick starting greeting effect — always start with Classic Friend (index 0)
    #    so the first thing users see is "Hi, Nunba! / your நண்பா is here"
    if force_index is not None:
        start_idx = force_index % len(GREETING_EFFECTS)
    else:
        start_idx = 0

    # 3. Greeting loop — cycles through effects until window is destroyed
    loop_state = {'idx': start_idx, 'active_items_tag': 0}

    def _play_next_greeting():
        """Start the next greeting effect, schedule the one after it."""
        idx = loop_state['idx']
        log.info(f"Splash greeting: '{EFFECT_NAMES[idx]}' (#{idx})")

        # Snapshot canvas item count before greeting adds its items
        before_count = len(canvas.find_all())

        try:
            GREETING_EFFECTS[idx](canvas, root, W, H)
        except Exception as e:
            log.debug(f"Greeting effect {idx} failed: {e}")

        # Advance to next effect for the loop
        loop_state['idx'] = (idx + 1) % len(GREETING_EFFECTS)

        # Poll: wait for this greeting to finish (it deletes its items),
        # then start the next one after a brief pause
        def _poll_done():
            try:
                current_count = len(canvas.find_all())
                # Greeting is done when it's cleaned up its items
                # (item count is back to what it was before, give or take)
                if current_count <= before_count + 2:
                    # Brief pause between greetings
                    root.after(800, _play_next_greeting)
                else:
                    root.after(200, _poll_done)
            except Exception:
                pass  # Window destroyed — stop naturally

        # Start polling after a minimum time (shortest greeting is ~2s)
        root.after(2000, _poll_done)

    # 4. Typewrite நண்பா AND start greeting loop simultaneously
    log.info(f"Splash: typewriter + greeting loop starting at '{EFFECT_NAMES[start_idx]}'")
    _run_buildup(canvas, root, W, H, nunba_y, rx, on_done=lambda: None)
    _play_next_greeting()


# Legacy alias for backwards compatibility
def run_splash_effect(canvas, root, W, H, force_index=None):
    """Legacy entry point — redirects to run_splash_animation."""
    run_splash_animation(canvas, root, W, H, force_index)

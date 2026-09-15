# SPDX-License-Identifier: AGPL-3.0-or-later
"""Catalog of dynamically-generated frontend backgrounds.

A "dynbg" (dynamic background) is a CSS-driven, optionally-animated
backdrop that any frontend surface (page, container block, hero,
section card, etc.) can opt into instead of a solid colour, gradient,
or uploaded image. Each preset:

  * renders as a `<div class="fe-dynbg fe-dynbg-<key>">` with a fixed
    set of inner spans the partial owns, so the consumer just stamps
    one tag and CSS does the rest;
  * relies on per-theme design tokens (`--fe-accent`, `--fe-color-bg`)
    so the same key produces a brand-coloured backdrop on every site
    without per-install tweaking;
  * has a dark-mode rule so the recipe stays legible when the visitor
    flips the theme toggle;
  * uses *only* CSS — no JS dependency. Animations are paused under
    `prefers-reduced-motion: reduce`.

Adding a new preset is two changes:

  1. Append an entry to ``CATALOG`` below.
  2. Add the matching ``.fe-dynbg-<key>`` rule (and dark-mode twin)
     to ``app/static/css/frontend.css``.

The picker UI (``_dynbg_picker.html`` macro) reads ``CATALOG`` on
each render, so a new preset shows up everywhere the picker is
embedded the moment the CSS is wired up.
"""


CATALOG = [
    {
        "key": "aurora-blobs",
        "name": "Aurora blobs",
        "description": (
            "Three brand-tinted blurred circles drifting on a soft "
            "tinted backdrop. Calm, premium feel. Best for hero / "
            "page-level backgrounds."
        ),
    },
    {
        "key": "mesh-gradient",
        "name": "Mesh gradient",
        "description": (
            "Static multi-stop mesh of brand colours layered with "
            "conic gradients. No motion — quiet but interesting."
        ),
    },
    {
        "key": "pattern-tile",
        "name": "Pattern tile",
        "description": (
            "A seamless geometric pattern over a solid or gradient "
            "backdrop. Pick a motif or let it spawn a random one each "
            "load, then dial in scale, line weight and rotation."
        ),
    },
    {
        "key": "dotted-grid",
        "name": "Dotted grid",
        "description": (
            "Subtle dot pattern on a flat backdrop. Adds texture "
            "without competing with content."
        ),
    },
    {
        "key": "diagonal-lines",
        "name": "Diagonal lines",
        "description": (
            "Soft diagonal stripe pattern. Quiet structural texture "
            "for cards and section bands."
        ),
    },
    # ── Classic recipes ─────────────────────────────────────────
    # The pre-per-mode-rework versions of the soft presets, kept as
    # their own catalog entries so an install designed against them
    # can reproduce its original look surface by surface instead of
    # being migrated wholesale.
    #
    # The rework pulled the hard-coded pale layer opacities out of the
    # soft recipes (they were what kept every palette washed out, and
    # they made the new Saturation / Brightness / Colour-fill sliders
    # no-ops) and retired the `pastel_light` treatment. Existing
    # surfaces keep their saved key and therefore render with the new,
    # fuller recipe — which is the right default, but it does change
    # designs that were tuned against the old pale render. These three
    # entries ARE the old CSS, verbatim, under their own keys.
    #
    # `legacy: True` groups them behind a divider in the picker with a
    # "Classic" badge; everything else (per-mode colours, tone, fill,
    # overlays, randomisation) works on them exactly as it does on the
    # current presets.
    {
        "key": "aurora-blobs-classic",
        "name": "Aurora blobs (classic)",
        "legacy": True,
        "description": (
            "The original Aurora blobs recipe — same drifting circles "
            "at their old pale opacity, with the pre-rework fixed "
            "tempo. For designs built before the tone sliders landed."
        ),
    },
    {
        "key": "mesh-gradient-classic",
        "name": "Mesh gradient (classic)",
        "legacy": True,
        "description": (
            "The original Mesh gradient recipe — the same conic mesh "
            "at its old washed-out opacity. For designs built before "
            "the tone sliders landed."
        ),
    },
    {
        "key": "aurora-bands",
        "name": "Aurora bands (classic)",
        "legacy": True,
        "description": (
            "Wide angled colour bands sweeping across the surface "
            "with a slow drift. Reads as soft northern lights. "
            "Retired in the rework and restored here, under its "
            "original key, so surfaces that still point at it render "
            "again."
        ),
    },
]


VALID_KEYS = {entry["key"] for entry in CATALOG}


# ── Pattern-tile motif library ──────────────────────────────────
# Vendored from Pattern Monster (https://pattern.monster), MIT licensed
# — see dynbg_patterns.LICENSE.md, and scripts/import_pattern_monster.py
# to refresh. 330 seamless SVG patterns; each has a tile size, a render
# mode and one raw `<path d='…'/>` per ink colour:
#
#   mode 'fill'        → path is filled
#   mode 'stroke'      → path is stroked at the admin's line weight
#   mode 'stroke-join' → stroked, with round caps and joins
#
# The paths are used as a CSS `mask-image`, so they carry GEOMETRY
# ONLY — the ink colour comes from the surface's palette var and
# therefore follows the light/dark swap for free. A motif only needs
# re-encoding when the pattern or its weight changes; scale is applied
# with `mask-size`, so the scale slider never touches the URL.
import json as _json_patterns
from pathlib import Path as _Path

with open(_Path(__file__).resolve().parent / "dynbg_patterns.json", encoding="utf-8") as _fh:
    _PATTERN_DATA = _json_patterns.load(_fh)
PATTERNS = _PATTERN_DATA["patterns"]
PATTERNS_SOURCE = _PATTERN_DATA.get("_source", "")
PATTERN_BY_KEY = {p["key"]: p for p in PATTERNS}
PATTERN_KEYS = [p["key"] for p in PATTERNS]
# Attributes injected into each raw path per render mode. `{w}` is the
# line-weight knob. Mask colour is always black: only alpha matters.
PATTERN_MODE_ATTRS = {
    "fill": " fill='#000' stroke='none'",
    "stroke": " fill='none' stroke='#000' stroke-width='{w}'",
    "stroke-join": (" fill='none' stroke='#000' stroke-width='{w}'"
                    " stroke-linecap='round' stroke-linejoin='round'"),
}


def pattern_groups():
    """Catalogue grouped by its first tag, for the picker's <select>."""
    groups = {}
    for p in PATTERNS:
        g = (p.get("tags") or ["other"])[0].title()
        groups.setdefault(g, []).append({"value": p["key"], "label": p["name"]})
    return [{"label": g, "options": groups[g]} for g in sorted(groups)]


def normalize_pattern(key):
    """Coerce a pattern choice to a known motif key, or 'random'."""
    key = (key or "").strip()
    return key if key in PATTERN_BY_KEY or key == "random" else "random"


def pattern_mask_layers(pattern_key, weight=2, rng=None):
    """Resolve a motif to ``(key, [mask_url, ...], width, height)`` — one
    URL per ink layer, ready for `mask-image`, plus the tile size the
    caller needs for `mask-size`.

    ``pattern_key`` may be 'random', in which case a motif is chosen
    fresh (per render on the server, per repaint in the picker). The
    render mode decides which attributes the raw path gets, mirroring
    the generator at pattern.monster; line weight is baked in for the
    stroked modes. Layer N is painted with palette slot N, so a
    four-ink tile reads as four colours without the SVG carrying any.
    """
    key = normalize_pattern(pattern_key)
    if key == "random":
        import random as _random
        key = (rng or _random).choice(PATTERN_KEYS)
    entry = PATTERN_BY_KEY[key]
    w = normalize_float(weight, 0.5, 14, 2)
    w = int(w) if float(w).is_integer() else round(w, 2)
    attrs = PATTERN_MODE_ATTRS[entry["mode"]].replace("{w}", str(w))
    tw, th = entry["w"], entry["h"]
    urls = []
    for body in entry["layers"]:
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 "
            f"{tw} {th}' width='{tw}' height='{th}'>"
            + body.replace("/>", attrs + "/>", 1)
            + "</svg>"
        )
        # Percent-encode the characters that would break out of
        # url('...') or confuse a data-URL parser. Matches
        # noise_grain_data_url's approach so the two read alike.
        enc = (svg.replace("%", "%25").replace("#", "%23")
                  .replace("<", "%3C").replace(">", "%3E")
                  .replace('"', "%22").replace("'", "%27"))
        urls.append("data:image/svg+xml;utf8," + enc)
    return key, urls, tw, th



# ── Per-preset capability spec ──────────────────────────────────
# Drives which Options-tab controls the picker modal shows for the
# active background ("don't show settings that won't apply"), and
# declares each preset's tunable knobs. The modal reads this via the
# ``dynbg_preset_caps`` Jinja global (stamped as JSON on the modal),
# so adding a knob here surfaces it in the UI with no template edit.
#
#   colors              — number of custom-colour slots that matter
#                         (0 hides the colour fieldset entirely).
#   color_labels        — optional per-slot labels. When present they
#                         replace the generic "Colour 1/2/3" headings,
#                         so e.g. the pattern presets read "Dots" /
#                         "Background" instead. The renderer maps slot
#                         N → --fe-dynbg-cN regardless of label.
#   randomize_positions — show the "randomize positions" toggle.
#   randomize_default   — when an admin first PICKS this preset, default
#                         the randomize-colours toggle on. False for the
#                         pattern presets (dots/lines), whose whole point
#                         is a deliberate fg/bg pair the admin sets.
#   animate             — show the "freeze movement" toggle (and the
#                         preset's CSS actually animates).
#   soft                — True for the blurred-layer recipes whose base
#                         the per-mode Colour fill slider
#                         (--fe-dynbg-fill) paints. Dots / lines set
#                         their own background colour slot instead.
#   knobs               — ordered list of numeric sliders unique to
#                         this preset. Each: key (stored under
#                         cfg['knobs'][key] + stamped as the css_var),
#                         label, min/max/step, default, unit, and the
#                         CSS custom property it feeds.
PRESET_CAPS = {
    "aurora-blobs": {
        "soft": True,
        "colors": 3, "randomize_positions": True, "randomize_default": True,
        "animate": True,
        "knobs": [
            # Drift speed as a % of the recipe's hand-tuned tempo; the
            # CSS divides each layer's keyframe duration by this (0-1+
            # fraction), so 200% = twice as fast, 25% = a slow crawl.
            {"key": "speed", "label": "Speed", "min": 25, "max": 300,
             "step": 5, "default": 100, "unit": "%", "css_var": "--fe-dynbg-speed"},
        ],
    },
    "mesh-gradient": {
        "soft": True,
        "colors": 3, "randomize_positions": True, "randomize_default": True,
        "animate": False, "knobs": [],
    },
    "pattern-tile": {
        # Four ink slots (a few Pattern Monster tiles use all four;
        # simpler motifs hide the unused ones) plus the backdrop pair.
        # `tone` opts the preset out of the Saturation / Brightness
        # sliders — these colours are picked literally, not tinted.
        "colors": 6, "tone": False,
        "color_labels": ["Pattern 1", "Pattern 2", "Pattern 3", "Pattern 4",
                         "Background", "Gradient end"],
        "randomize_positions": False, "randomize_default": False,
        "animate": False,
        "knobs": [
            # Enumerated knobs render as a <select>; "random" re-rolls
            # the motif on every page load. Options are grouped by the
            # catalogue's own tags so 330 entries stay navigable.
            {"key": "pattern", "label": "Pattern", "kind": "select",
             "default": "random",
             "options": [{"value": "random", "label": "Random each load"}],
             "groups": pattern_groups()},
            # Scale is a multiplier on the tile's native size (as on
            # pattern.monster), since tiles aren't square.
            {"key": "scale", "label": "Scale", "min": 0.25, "max": 8,
             "step": 0.25, "default": 1, "unit": "x", "css_var": "--fe-dynbg-pat-scale"},
            {"key": "weight", "label": "Line weight", "min": 0.5, "max": 14,
             "step": 0.5, "default": 2, "unit": "px"},
            {"key": "angle", "label": "Rotation", "min": 0, "max": 180,
             "step": 5, "default": 0, "unit": "deg", "css_var": "--fe-dynbg-pat-angle"},
            # Opacity, backdrop mode and gradient direction are PER MODE
            # (see normalize_mode / the picker's mode columns), not here.
        ],
    },
    "dotted-grid": {
        "colors": 2, "color_labels": ["Dots", "Background"],
        "randomize_positions": False, "randomize_default": False,
        "animate": False,
        "knobs": [
            {"key": "dot_size", "label": "Dot size", "min": 1, "max": 5,
             "step": 0.5, "default": 1, "unit": "px", "css_var": "--fe-dynbg-dot-size"},
            {"key": "dot_gap", "label": "Spacing", "min": 8, "max": 48,
             "step": 2, "default": 18, "unit": "px", "css_var": "--fe-dynbg-dot-gap"},
            {"key": "dot_angle", "label": "Rotation", "min": 0, "max": 360,
             "step": 5, "default": 0, "unit": "deg", "css_var": "--fe-dynbg-dot-angle"},
            {"key": "dot_opacity", "label": "Opacity", "min": 5, "max": 100,
             "step": 5, "default": 50, "unit": "%", "css_var": "--fe-dynbg-dot-opacity"},
        ],
    },
    "diagonal-lines": {
        "colors": 2, "color_labels": ["Lines", "Background"],
        "randomize_positions": False, "randomize_default": False,
        "animate": False,
        "knobs": [
            {"key": "line_angle", "label": "Angle", "min": 0, "max": 180,
             "step": 5, "default": 135, "unit": "deg", "css_var": "--fe-dynbg-line-angle"},
            {"key": "line_gap", "label": "Spacing", "min": 6, "max": 40,
             "step": 2, "default": 14, "unit": "px", "css_var": "--fe-dynbg-line-gap"},
            {"key": "line_opacity", "label": "Opacity", "min": 3, "max": 100,
             "step": 1, "default": 7, "unit": "%", "css_var": "--fe-dynbg-line-opacity"},
            {"key": "line_thickness", "label": "Thickness", "min": 1, "max": 6,
             "step": 0.5, "default": 1, "unit": "px", "css_var": "--fe-dynbg-line-thickness"},
        ],
    },
    # Classic recipes — same capabilities as the presets they mirror,
    # minus knobs those recipes never had (the speed slider is new, and
    # the old blob keyframes drift by fixed px). `soft` still opts them
    # into the Colour-fill slider: fill defaults to 0, so leaving it
    # alone reproduces the old render exactly, and dialling it up is a
    # purely additive escape hatch.
    "aurora-blobs-classic": {
        "soft": True,
        "colors": 3, "randomize_positions": True, "randomize_default": True,
        "animate": True, "knobs": [],
    },
    "mesh-gradient-classic": {
        "soft": True,
        "colors": 3, "randomize_positions": True, "randomize_default": True,
        "animate": False, "knobs": [],
    },
    "aurora-bands": {
        "soft": True,
        "colors": 2, "randomize_positions": True, "randomize_default": True,
        "animate": True, "knobs": [],
    },
}

# Flattened lookup: {preset_key: {knob_key: spec}} for O(1) validation.
KNOB_SPECS = {pk: {k["key"]: k for k in caps["knobs"]}
              for pk, caps in PRESET_CAPS.items()}


def preset_caps(key):
    """Return the capability dict for a preset key, or a safe empty
    shape (no colours, no knobs) for unknown / blank keys so callers
    can read fields without guards."""
    return PRESET_CAPS.get(key, {"colors": 0, "randomize_positions": False,
                                  "animate": False, "knobs": []})


def normalize_knobs(preset_key, raw):
    """Validate a raw {knob_key: value} mapping against ``preset_key``'s
    spec. Drops unknown keys and any value equal to the knob's default
    (so a vanilla config stores nothing). Numeric values are clamped to
    the knob's [min, max]; ``kind: "select"`` knobs are checked against
    their declared options. Returns a dict (possibly empty)."""
    specs = KNOB_SPECS.get(preset_key) or {}
    if not specs or not isinstance(raw, dict):
        return {}
    out = {}
    for k, spec in specs.items():
        if k not in raw:
            continue
        if spec.get("kind") == "select":
            val = (raw.get(k) or "")
            val = val.strip() if isinstance(val, str) else ""
            allowed = {o["value"] for o in spec.get("options", [])}
            for g in spec.get("groups", []):
                allowed |= {o["value"] for o in g.get("options", [])}
            if val in allowed and val != spec.get("default"):
                out[k] = val
            continue
        v = normalize_float(raw.get(k), spec["min"], spec["max"], None)
        if v is None:
            continue
        # Drop values that round-trip to the default (keep JSON tiny).
        if abs(v - spec["default"]) < 1e-9:
            continue
        # Integer-valued knobs (step is a whole number) store as int.
        out[k] = int(round(v)) if float(spec["step"]).is_integer() and v == int(v) else round(v, 3)
    return out


def knobs_to_css_vars(preset_key, knobs):
    """Stamp a preset's knob values as their CSS custom properties for
    inline ``style`` use, appending the unit. Returns '' when empty.
    Only emits vars for knobs the preset actually declares."""
    specs = KNOB_SPECS.get(preset_key) or {}
    if not specs or not knobs:
        return ""
    def _num(v):
        # Render whole numbers without a trailing `.0` (3.0 → "3") so
        # the stamped CSS reads cleanly; keep the fraction otherwise.
        f = float(v)
        return str(int(f)) if f == int(f) else str(round(f, 3))
    parts = []
    for k, spec in specs.items():
        if k not in knobs:
            continue
        unit = spec.get("unit", "")
        val = knobs[k]
        # Not every knob feeds CSS — the pattern line weight is baked
        # into the mask URL instead, so it declares no css_var.
        if not spec.get("css_var") and spec.get("kind") != "select":
            continue
        if spec.get("kind") == "select":
            # A select only stamps CSS when the chosen option declares
            # some (e.g. "gradient" supplies the second gradient stop);
            # otherwise the value is consumed elsewhere, like the
            # pattern choice that drives the mask URL.
            opt = next((o for o in spec.get("options", []) if o["value"] == val), None)
            if opt and opt.get("css") and spec.get("css_var"):
                parts.append(f"{spec['css_var']}: {opt['css']};")
            continue
        if unit == "deg":
            parts.append(f"{spec['css_var']}: {_num(val)}deg;")
        elif unit == "px":
            parts.append(f"{spec['css_var']}: {_num(val)}px;")
        elif unit == "%":
            # Stamp as a 0-1 fraction so recipes can use it directly as
            # an opacity / alpha without a calc() divide.
            parts.append(f"{spec['css_var']}: {round(float(val) / 100.0, 4)};")
        else:
            parts.append(f"{spec['css_var']}: {_num(val)};")
    return " ".join(parts)


# ── Overlays ────────────────────────────────────────────────────
# Independent visual layer that paints ABOVE the base dynbg (and
# above content, with `pointer-events: none`) to add a tactile
# texture / mood pass over the whole surface. Inspired by the
# Hyprlab project's fixed-position fractal-noise grain — the
# subtle 3% noise overlay that gave that site its premium feel.
# Overlays compose with any base dynbg (or none — an admin can run
# a solid colour with just an overlay on top).
OVERLAYS = [
    {
        "key": "noise-grain",
        "name": "Noise grain",
        "description": (
            "Subtle SVG fractal-noise sandpaper texture across the "
            "whole surface. The Hyprlab-recipe overlay — sits at "
            "~3% opacity so content stays crisp."
        ),
    },
    {
        "key": "scanlines",
        "name": "Scanlines",
        "description": (
            "Faint 2px horizontal scanline pattern at ~1.5% alpha. "
            "CRT / film-still vibe; pairs well with bold heros."
        ),
    },
    {
        "key": "linen",
        "name": "Linen weave",
        "description": (
            "Crossed two-direction stripe pattern reading as a soft "
            "fabric weave. Adds material warmth without competing "
            "with photography or typography."
        ),
    },
    {
        "key": "vignette",
        "name": "Vignette",
        "description": (
            "Radial darken from the corners — focuses the eye on "
            "centred content. Strong on heros, subtle on cards."
        ),
    },
    {
        "key": "crosshatch",
        "name": "Crosshatch",
        "description": (
            "Two-direction diagonal lines forming an editorial "
            "crosshatch. Ink-on-paper feel for long-form pages."
        ),
    },
    {
        "key": "dot-weave",
        "name": "Dot weave",
        "description": (
            "Tiny dotted lattice with a soft falloff. Reads as "
            "halftone newsprint at a quiet 4% intensity."
        ),
    },
]


VALID_OVERLAY_KEYS = {entry["key"] for entry in OVERLAYS}


def by_key(key):
    """Return the catalog entry for ``key`` or None when unknown."""
    if not key:
        return None
    for entry in CATALOG:
        if entry["key"] == key:
            return entry
    return None


def overlay_by_key(key):
    """Return the overlay catalog entry for ``key`` or None."""
    if not key:
        return None
    for entry in OVERLAYS:
        if entry["key"] == key:
            return entry
    return None


def normalize(key):
    """Coerce a possibly-tampered request value to a known key or None.

    Any value not in ``VALID_KEYS`` collapses to None so the caller
    can render "no dynamic background" instead of crashing.
    """
    if not key:
        return None
    key = str(key).strip()
    return key if key in VALID_KEYS else None


def normalize_overlay(key):
    """Same gate as ``normalize`` but for the OVERLAYS catalog."""
    if not key:
        return None
    key = str(key).strip()
    return key if key in VALID_OVERLAY_KEYS else None


# Hex colour validation. Up to three custom colours travel alongside
# each dynbg via the shared persistence helpers. The colour gate is
# permissive (3-digit + 6-digit hex with optional alpha) but rejects
# anything that doesn't look like a colour so a tampered POST can't
# inject arbitrary CSS via the inline style stamp.
import re as _re

_HEX_COLOR_RE = _re.compile(r"^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def normalize_color(value):
    """Return the value if it parses as a hex colour, else None."""
    if not value:
        return None
    v = str(value).strip()
    return v if _HEX_COLOR_RE.match(v) else None


# Palette width. Most presets use 1-3 slots; the pattern preset needs
# more (up to three ink colours for a multi-colour motif, plus the
# backdrop and its gradient end), so the persistence layer carries
# MAX_COLOR_SLOTS and each preset declares how many it actually shows.
MAX_COLOR_SLOTS = 6


def normalize_colors(raw):
    """Normalise an iterable / sequence of colour values into a
    fixed-shape list of (hex|None) for the persistence layer.

    Always returns a MAX_COLOR_SLOTS-element list — None for any slot
    the admin didn't fill or that didn't parse as a colour. The callers
    then drop trailing Nones when persisting / stamping CSS so an empty
    palette costs nothing in storage or DOM weight.
    """
    if raw is None:
        raw = []
    if isinstance(raw, str):
        # Comma-separated form ("#aaa,#bbb") — defensive against
        # callers that pre-joined the values.
        raw = [s for s in raw.split(",")]
    out = [None] * MAX_COLOR_SLOTS
    for i, v in enumerate(raw[:MAX_COLOR_SLOTS]):
        out[i] = normalize_color(v)
    return out


VALID_OVERLAY_SCOPES = {"all", "bg"}

# Subset of CATALOG keys whose CSS recipes include keyframe
# animations. Drives the "Disable animation" toggle in the modal —
# the picker only shows the toggle when the active preset is one of
# these, so admins never see a useless control on static presets.
ANIMATED_KEYS = {"aurora-blobs", "aurora-blobs-classic", "aurora-bands"}

# Noise-grain admin-tunable ranges. baseFrequency on `<feTurbulence>`
# controls grain SIZE — lower values produce bigger particles, higher
# values produce finer ones. Intensity is the SVG-encoded rect alpha;
# tuned together with baseFrequency, the duo covers everything from
# heavy film grain (size 0.4, intensity 0.06) to barely-there sand
# (size 1.5, intensity 0.02). Defaults match the Hyprlab recipe.
NOISE_SIZE_DEFAULT = 0.9
NOISE_SIZE_MIN, NOISE_SIZE_MAX = 0.1, 2.0
NOISE_INTENSITY_DEFAULT = 0.03
NOISE_INTENSITY_MIN, NOISE_INTENSITY_MAX = 0.005, 0.5

# Persisted overlay size/intensity clamp — a UNION range wide enough to
# hold both the noise-grain ranges above AND the pattern-overlay ranges
# below, so a single pair of stored fields (overlay_size /
# overlay_intensity) round-trips for any overlay. The modal sets the
# per-overlay slider bounds from OVERLAY_KNOBS; decode only needs to
# not reject a valid value.
OVERLAY_SIZE_MIN, OVERLAY_SIZE_MAX = 0.1, 3.0
OVERLAY_INTENSITY_MIN, OVERLAY_INTENSITY_MAX = 0.0, 1.0

# Per-overlay Size + Intensity knob specs. EVERY overlay exposes both
# sliders now (the admin asked for size+intensity on all textures), but
# the meaning differs by overlay family:
#   • noise-grain — size = feTurbulence baseFrequency (lower = bigger
#     particles), intensity = the SVG rect's alpha. Baked into a data-
#     URL at render (the SVG can't read CSS vars).
#   • every other (pattern) overlay — size = a pattern-scale multiplier
#     stamped as `--fe-dynbg-ov-scale` (×1 = the recipe's hand-tuned
#     dimensions), intensity = layer opacity stamped as
#     `--fe-dynbg-ov-opacity`. Defaults of 1.0/1.0 reproduce the
#     original look so existing saves render unchanged.
OVERLAY_KNOBS = {
    "noise-grain": {
        "size": {"min": NOISE_SIZE_MIN, "max": NOISE_SIZE_MAX, "step": 0.05,
                 "default": NOISE_SIZE_DEFAULT, "label": "Grain size",
                 "lo": "coarse", "hi": "fine"},
        "intensity": {"min": NOISE_INTENSITY_MIN, "max": NOISE_INTENSITY_MAX,
                      "step": 0.005, "default": NOISE_INTENSITY_DEFAULT,
                      "label": "Intensity", "lo": "whisper", "hi": "heavy"},
    },
}
# Pattern overlays all share the same scale + opacity knob shape.
for _ov in ("scanlines", "linen", "vignette", "crosshatch", "dot-weave"):
    OVERLAY_KNOBS[_ov] = {
        "size": {"min": 0.25, "max": 3.0, "step": 0.05, "default": 1.0,
                 "label": "Scale", "lo": "tight", "hi": "wide"},
        "intensity": {"min": 0.0, "max": 1.0, "step": 0.05, "default": 1.0,
                      "label": "Intensity", "lo": "faint", "hi": "bold"},
    }


def overlay_knobs(key):
    """Return the Size/Intensity knob spec dict for an overlay key, or
    None for unknown/blank. Drives the modal's per-overlay sliders."""
    return OVERLAY_KNOBS.get(key)


def normalize_scope(value):
    """Coerce overlay scope to 'all' (above content — Hyprlab-style)
    or 'bg' (between base dynbg and content). Default is None which
    consumers treat as 'all'."""
    if not value:
        return None
    v = str(value).strip().lower()
    return v if v in VALID_OVERLAY_SCOPES else None


def normalize_float(value, lo, hi, default=None):
    """Clamp a string/number to [lo, hi] or fall back to default."""
    if value is None or value == "":
        return default
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, f))


_PASTEL_HEX_RE = __import__("re").compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

MODES = ("light", "dark")
TONE_DEFAULT = 100  # saturation sits at "full vivid" unless dialled back
FILL_DEFAULT = 0    # colour fill: 0 = page white/black shows through the recipe
BRIGHT_DEFAULT = 100  # brightness: 100 = colours as picked; <100 darker, >100 lighter
TONE_DEFAULTS = {"sat": TONE_DEFAULT, "bright": BRIGHT_DEFAULT, "fill": FILL_DEFAULT}
# Pattern-tile per-mode defaults (see normalize_mode).
PAT_DEFAULTS = {"pat_opacity": 100, "pat_bg": "solid", "pat_bg_angle": 135}


TONE_MAX = {"sat": 100, "bright": 200, "fill": 100}


def _tone_int(v, hi=100):
    """Coerce one slider value to an int 0-``hi``, or None when absent /
    unparseable (None = use the key's default)."""
    if v is None or v == "" or isinstance(v, bool):
        return None
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return None
    return max(0, min(hi, n))


def normalize_mode(raw, fill_defaults=True):
    """Normalise ONE mode's block of the per-mode config::

        {"colors": [...], "randomize_colors": bool, "randomize_positions": bool,
         "sat": 0-100, "bright": 0-200, "fill": 0-100,
         "overlay": key|None, "overlay_scope": 'all'|'bg'|None,
         "overlay_size": float|None, "overlay_intensity": float|None}

    ``sat`` sets every palette colour's HSL saturation for the mode
    (hue + lightness preserved); ``bright`` (default 100) scales its
    lightness — below 100 toward black, above 100 toward white;
    ``fill`` (default 0)
    paints the recipe's BASE with the palette via ``--fe-dynbg-fill``
    so at 100 none of the page's white / black shows through; the
    overlay quartet is the mode's own texture pass. With ``fill_defaults`` every key is
    present (sat → 100, fill → 0) so consumers can index
    without guards; without it only explicitly-set, non-default values
    survive (the storage shape).
    """
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    cols = normalize_colors(raw.get("colors") or [])
    while cols and cols[-1] is None:
        cols.pop()
    if fill_defaults:
        out["colors"] = [c for c in cols if c]
    elif cols:
        out["colors"] = cols
    rc = bool(raw.get("randomize_colors"))
    if fill_defaults or rc:
        out["randomize_colors"] = rc
    rp = bool(raw.get("randomize_positions"))
    if fill_defaults or rp:
        out["randomize_positions"] = rp
    for k, dflt in TONE_DEFAULTS.items():
        n = _tone_int(raw.get(k), TONE_MAX.get(k, 100))
        if fill_defaults:
            out[k] = dflt if n is None else n
        elif n is not None and n != dflt:
            out[k] = n
    # Pattern-tile per-mode settings: the motif's opacity and the
    # backdrop (solid vs gradient, and the gradient's direction). These
    # are per mode so light can sit on a flat cream while dark runs a
    # gradient, without touching the shared motif choice.
    po = _tone_int(raw.get("pat_opacity"), 100)
    pb = raw.get("pat_bg") if raw.get("pat_bg") in ("solid", "gradient") else None
    pa = _tone_int(raw.get("pat_bg_angle"), 355)
    if fill_defaults:
        out["pat_opacity"] = PAT_DEFAULTS["pat_opacity"] if po is None else po
        out["pat_bg"] = pb or PAT_DEFAULTS["pat_bg"]
        out["pat_bg_angle"] = PAT_DEFAULTS["pat_bg_angle"] if pa is None else pa
    else:
        if po is not None and po != PAT_DEFAULTS["pat_opacity"]:
            out["pat_opacity"] = po
        if pb and pb != PAT_DEFAULTS["pat_bg"]:
            out["pat_bg"] = pb
        if pa is not None and pa != PAT_DEFAULTS["pat_bg_angle"]:
            out["pat_bg_angle"] = pa
    ov = normalize_overlay(raw.get("overlay"))
    sc = normalize_scope(raw.get("overlay_scope"))
    _ovk = OVERLAY_KNOBS.get(ov) if ov else None
    _sz_def = _ovk["size"]["default"] if _ovk else NOISE_SIZE_DEFAULT
    _int_def = _ovk["intensity"]["default"] if _ovk else NOISE_INTENSITY_DEFAULT
    ns = normalize_float(raw.get("overlay_size"), OVERLAY_SIZE_MIN, OVERLAY_SIZE_MAX, None)
    ni = normalize_float(raw.get("overlay_intensity"), OVERLAY_INTENSITY_MIN,
                         OVERLAY_INTENSITY_MAX, None)
    if fill_defaults:
        out["overlay"] = ov
        out["overlay_scope"] = sc if ov else None
        out["overlay_size"] = ns if ov else None
        out["overlay_intensity"] = ni if ov else None
    elif ov:
        out["overlay"] = ov
        if sc and sc != "all":
            out["overlay_scope"] = sc
        if ns is not None and abs(ns - _sz_def) > 1e-6:
            out["overlay_size"] = round(ns, 3)
        if ni is not None and abs(ni - _int_def) > 1e-6:
            out["overlay_intensity"] = round(ni, 4)
    return out


def _legacy_mode_from(data):
    """Build a mode block from the pre-per-mode top-level fields
    (``colors`` / ``randomize_colors`` / ``overlay*`` / ``tone``) so
    configs saved before the light/dark split keep rendering — both
    modes inherit the same palette + texture; tone was already
    per-mode."""
    data = data if isinstance(data, dict) else {}
    legacy = bool(data.get("randomize"))
    base = {
        "colors": data.get("colors") or [],
        "randomize_colors": bool(data.get("randomize_colors")) or legacy,
        "randomize_positions": bool(data.get("randomize_positions")) or legacy,
        "overlay": data.get("overlay"),
        "overlay_scope": data.get("overlay_scope"),
        "overlay_size": data.get("overlay_size"),
        "overlay_intensity": data.get("overlay_intensity"),
    }
    tone = data.get("tone") if isinstance(data.get("tone"), dict) else {}
    out = {}
    for mode in MODES:
        sub = tone.get(mode) if isinstance(tone.get(mode), dict) else {}
        out[mode] = dict(base, sat=sub.get("sat"), bright=sub.get("bright"))
    return out


def normalize_modes(raw, fill_defaults=True, legacy=None):
    """Normalise the ``modes`` block ({"light": {...}, "dark": {...}}).
    Accepts a JSON string or dict. When ``raw`` carries neither mode
    and ``legacy`` (a top-level config dict) is given, both modes are
    derived from the legacy fields. Without ``fill_defaults`` empty
    mode blocks are dropped entirely (storage shape)."""
    import json as _json
    if isinstance(raw, str):
        try:
            raw = _json.loads(raw) if raw.strip() else {}
        except (ValueError, TypeError):
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    if not any(isinstance(raw.get(m), dict) for m in MODES) and legacy is not None:
        raw = _legacy_mode_from(legacy)
    elif isinstance(legacy, dict) and (legacy.get("randomize_positions") or legacy.get("randomize")):
        # Transitional shape: per-mode blocks present but positions
        # randomising still recorded at the top level. Apply it to any
        # mode that doesn't say otherwise so those saves keep shuffling.
        raw = {m: dict(raw.get(m) or {}) for m in MODES}
        for m in MODES:
            raw[m].setdefault("randomize_positions", True)
    # Transitional: the pattern preset's opacity / backdrop were briefly
    # shared knobs. Fold them into any mode that doesn't set its own so
    # those saves keep rendering as they did.
    kn = legacy.get("knobs") if isinstance(legacy, dict) else None
    if isinstance(kn, dict) and any(k in kn for k in ("opacity", "bg_mode", "bg_angle")):
        raw = {m: dict(raw.get(m) or {}) for m in MODES}
        for m in MODES:
            if "opacity" in kn: raw[m].setdefault("pat_opacity", kn["opacity"])
            if "bg_mode" in kn: raw[m].setdefault("pat_bg", kn["bg_mode"])
            if "bg_angle" in kn: raw[m].setdefault("pat_bg_angle", kn["bg_angle"])
    out = {}
    for mode in MODES:
        block = normalize_mode(raw.get(mode), fill_defaults=fill_defaults)
        if fill_defaults or block:
            out[mode] = block
    return out


def saturate_hex(hex_str, sat, bright=BRIGHT_DEFAULT):
    """Return ``hex_str`` with its HSL saturation set to ``sat`` (0-100)
    and its lightness scaled by ``bright`` (0-200; 100 = untouched,
    below 100 lerps toward black, above 100 toward white), hue
    untouched. Greys (no hue) stay grey but still take the brightness.
    Returns None on invalid input; output is ``#rrggbb``."""
    import colorsys
    if not isinstance(hex_str, str) or not _PASTEL_HEX_RE.match(hex_str):
        return None
    h = hex_str.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:
        h = h[:6]
    try:
        r = int(h[0:2], 16) / 255.0
        g = int(h[2:4], 16) / 255.0
        b = int(h[4:6], 16) / 255.0
    except ValueError:
        return None
    hue, light, src_s = colorsys.rgb_to_hls(r, g, b)
    bt = max(0, min(200, int(bright if bright is not None else BRIGHT_DEFAULT))) / 100.0
    if bt < 1.0:
        light = light * bt
    elif bt > 1.0:
        light = light + (1.0 - light) * (bt - 1.0)
    target = src_s if src_s < 0.02 else max(0, min(100, int(sat))) / 100.0
    nr, ng, nb = colorsys.hls_to_rgb(hue, light, target)
    return "#{:02x}{:02x}{:02x}".format(int(round(nr * 255)), int(round(ng * 255)), int(round(nb * 255)))


def encode_config(overlay_key=None, colors=None, scope=None,
                  noise_size=None, noise_intensity=None,
                  randomize_colors=False, randomize_positions=False,
                  animate=True, randomize=None, tone=None, modes=None,
                  knobs=None, preset_key=None):
    """Return a JSON-serialisable dict shape for a surface's dynbg
    config column. Drops empty / default fields so a fresh install
    stores ``{}`` rather than a fat default record.

    Shape::

        {"animate": false, "knobs": {...},
         "modes": {"light": {colors, randomize_colors, randomize_positions, sat, fill,
                             overlay, overlay_scope, overlay_size,
                             overlay_intensity},
                   "dark":  {...}}}

    Everything colour / position / texture related is per mode (light
    and dark are fully independent). The preset itself, animation and
    the per-preset pattern knobs are shared.

    ``modes`` (dict or JSON string) is the canonical input. The legacy
    single-mode kwargs (``overlay_key`` / ``colors`` / ``scope`` /
    ``noise_*`` / ``randomize_colors`` / ``tone``) are still accepted
    for older callers and expand into BOTH modes when ``modes`` is not
    supplied. The legacy ``randomize`` kwarg implies both
    ``randomize_colors`` and ``randomize_positions``.
    """
    cleaned = {}
    if randomize:  # legacy single flag → expands to both
        randomize_colors = True
        randomize_positions = True
    # Per-preset knobs (validated + default-dropped against the spec).
    nk = normalize_knobs(preset_key, knobs)
    if nk:
        cleaned["knobs"] = nk
    # Opt-OUT semantics: only persist when the admin explicitly
    # disables animation. Animated presets default to running their
    # keyframe animations, so a fresh install with no `animate` key
    # behaves exactly as before.
    if animate is False:
        cleaned["animate"] = False
    legacy = {
        "overlay": overlay_key, "colors": colors, "overlay_scope": scope,
        "overlay_size": noise_size, "overlay_intensity": noise_intensity,
        "randomize_colors": randomize_colors, "tone": tone,
        "randomize_positions": randomize_positions,
    }
    nm = normalize_modes(modes, fill_defaults=False, legacy=legacy)
    if nm:
        cleaned["modes"] = nm
    return cleaned


def decode_config(raw):
    """Parse a stored JSON config string back into a normalised config
    dict. Tolerant of None / blanks / malformed JSON — always returns
    a dict with every expected key so callers can `.get()` without
    extra guards.

    ``modes`` carries the per-mode blocks with every key filled (see
    normalize_mode). Configs saved before the light/dark split (flat
    ``colors`` / ``overlay*`` / ``randomize_colors`` / ``tone``) are
    expanded into both modes on the fly, so nothing needs migrating.

    A few LEGACY ALIASES are kept at the top level for templates that
    only need an "is anything configured?" answer: ``overlay`` is the
    first non-empty overlay across modes, ``colors`` /
    ``randomize_colors`` / ``overlay_*`` mirror the LIGHT mode, and
    ``randomize_positions`` / ``randomize`` are true when either mode
    randomises."""
    import json as _json
    blank_modes = normalize_modes(None)
    blank = {
        "randomize_positions": False,
        "randomize_colors": False,
        "randomize": False,
        "animate": True,
        "knobs": {},
        "modes": blank_modes,
        "colors": [],
        "overlay": None,
        "overlay_scope": None,
        "overlay_size": None,
        "overlay_intensity": None,
    }
    if not raw:
        return blank
    try:
        data = _json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return blank
    if not isinstance(data, dict):
        return blank
    # Animation flag — opt-out semantics. An explicit `animate: false`
    # in the saved JSON means "freeze the preset's motion"; a missing
    # field defaults to True so existing configs keep animating.
    animate = data.get("animate")
    animate = False if animate is False else True
    modes = normalize_modes(data.get("modes"), legacy=data)
    light = modes["light"]
    any_rc = any(modes[m]["randomize_colors"] for m in MODES)
    any_rp = any(modes[m]["randomize_positions"] for m in MODES)
    return {
        "randomize_positions": any_rp,  # legacy alias — true when either mode randomises
        "randomize_colors": light["randomize_colors"],
        "randomize": any_rc or any_rp,  # legacy alias — true when anything randomises
        "animate": animate,
        # Per-preset knob values. Left un-scoped here (we don't know the
        # preset key at decode time) — the raw dict is passed through and
        # consumers scope it via knobs_to_css_vars(preset_key, knobs),
        # which only emits vars for knobs that preset declares.
        "knobs": (data.get("knobs") if isinstance(data.get("knobs"), dict) else {}),
        "modes": modes,
        "colors": list(light["colors"]),
        "overlay": light["overlay"] or modes["dark"]["overlay"],
        "overlay_scope": light["overlay_scope"],
        "overlay_size": light["overlay_size"],
        "overlay_intensity": light["overlay_intensity"],
    }


def colors_to_css_vars(colors, cfg=None):
    """Stamp a surface's dynbg custom properties for inline ``style`` use.

    ``colors`` is the result of ``resolve_colors(cfg)`` — a
    ``{"light": [...], "dark": [...]}`` dict (a plain list is also
    accepted and used for both modes). For each palette slot present
    in EITHER mode we emit ``--fe-dynbg-cN-light`` / ``-dark`` carrying
    that mode's colour re-saturated by its ``sat``; a mode that leaves
    the slot empty gets ``initial`` so the swap rule in dynbg.css
    resets the canonical ``--fe-dynbg-cN`` and the recipe falls back
    to its brand default in that mode. ``--fe-dynbg-c1..3`` (canonical)
    are ALSO stamped with the light palette for consumers that read
    them before the swap applies. The per-mode base colour-fill amount
    goes out as ``--fe-dynbg-fill-light`` / ``-dark``, emitted even with
    an empty palette so it still applies to brand-fallback paints.

    Returns a string like ``--fe-dynbg-c1: #abc; …`` (no trailing
    semicolon trick — caller concatenates as needed).
    """
    cfg = cfg if isinstance(cfg, dict) else {}
    modes = cfg.get("modes")
    if not (isinstance(modes, dict) and all(isinstance(modes.get(m), dict) for m in MODES)):
        modes = normalize_modes(modes, legacy=cfg)
    if isinstance(colors, dict):
        per = {m: [c for c in (colors.get(m) or []) if c] for m in MODES}
    else:
        lst = [c for c in (colors or []) if c]
        per = {m: list(lst) for m in MODES}
    parts = []
    n_slots = max(len(per["light"]), len(per["dark"]))
    for i in range(n_slots):
        base = per["light"][i] if i < len(per["light"]) else None
        if base:
            parts.append(f"--fe-dynbg-c{i + 1}: {base};")
        for mode in MODES:
            c = per[mode][i] if i < len(per[mode]) else None
            if c:
                v = saturate_hex(c, modes[mode].get("sat", TONE_DEFAULT),
                                 modes[mode].get("bright", BRIGHT_DEFAULT)) or c
                parts.append(f"--fe-dynbg-c{i + 1}-{mode}: {v};")
            else:
                parts.append(f"--fe-dynbg-c{i + 1}-{mode}: initial;")
    for mode in MODES:
        fl = modes[mode].get("fill", FILL_DEFAULT)
        parts.append(f"--fe-dynbg-fill-{mode}: {fl / 100.0:g};")
        # Pattern-tile per-mode settings, only when they differ from
        # the recipe's own fallbacks (which ARE the defaults), so a
        # surface on another preset carries nothing extra.
        m = modes[mode]
        pat = []
        if m.get("pat_opacity", 100) != 100:
            pat.append(f"--fe-dynbg-pat-opacity-{mode}: {m['pat_opacity'] / 100.0:g};")
        if m.get("pat_bg", "solid") == "gradient":
            pat.append(f"--fe-dynbg-pat-bg2-{mode}: var(--fe-dynbg-c6, var(--fe-dynbg-c5, #e2e8f0));")
        if m.get("pat_bg_angle", 135) != 135:
            pat.append(f"--fe-dynbg-pat-bg-angle-{mode}: {m['pat_bg_angle']}deg;")
        if pat:
            parts.append(f"--fe-dynbg-pat-{mode}: 1;")  # marker the swap rules key off
            parts.extend(pat)
    return " ".join(parts)


def random_colors(n=3):
    """Return a list of ``n`` random vibrant hex colours.

    Uses HSL with random hue + capped-medium saturation / lightness
    so the palette stays brand-friendly (no muddy browns or eye-
    searing neons). Each render generates a fresh palette so the
    same surface looks different every page load when the admin has
    `randomize` turned on.
    """
    import random as _random
    import colorsys as _colorsys
    out = []
    for _ in range(n):
        h = _random.random()
        s = 0.55 + _random.random() * 0.35  # 0.55–0.90
        l = 0.45 + _random.random() * 0.20  # 0.45–0.65
        r, g, b = _colorsys.hls_to_rgb(h, l, s)
        out.append("#{:02x}{:02x}{:02x}".format(
            int(r * 255), int(g * 255), int(b * 255)))
    return out


def thumb_style(dynbg_key):
    """Return an inline-style string that seeds a preset thumbnail with a
    FRESH random palette + random positions, so every catalog thumbnail
    (and the modal's live preview when it falls back to a preset's own
    look) reads as a distinct, lively sample rather than the identical
    brand-default render.

    Combines a 3-colour ``random_colors`` palette (stamped as
    ``--fe-dynbg-cN``) with ``random_positions(key)`` for the presets
    that have movable parts (blobs / mesh / bands). Static presets
    (dotted-grid, diagonal-lines) still get a random palette so their
    tint differs tile-to-tile. Returns '' for an unknown / blank key.

    Server-rendered, so each page load reshuffles the picker — matching
    the "randomly selected colors and positions" behaviour the admin
    asked for without any client-side colour math.
    """
    if not dynbg_key or dynbg_key not in VALID_KEYS:
        return ""
    parts = []
    for i, c in enumerate(random_colors(MAX_COLOR_SLOTS), start=1):
        parts.append(f"--fe-dynbg-c{i}: {c};")
    pos = positions_to_css_vars(random_positions(dynbg_key))
    style = " ".join(parts)
    if pos:
        style = (style + " " + pos).strip()
    return style


def resolve_colors(cfg):
    """Return the per-mode palettes to stamp on a surface's dynbg-host
    as ``{"light": [...], "dark": [...]}``. A mode with
    ``randomize_colors`` on ignores its saved colours and takes a fresh
    random palette for this render (one roll shared by both modes when
    both randomise, so the light/dark switch keeps the same hues).
    Feed the result straight into ``colors_to_css_vars``."""
    if isinstance(cfg, str) or cfg is None:
        cfg = decode_config(cfg)
    modes = cfg.get("modes") if isinstance(cfg, dict) else None
    if not (isinstance(modes, dict) and all(isinstance(modes.get(m), dict) for m in MODES)):
        modes = normalize_modes(modes, legacy=cfg)
    rolled = None
    out = {}
    for mode in MODES:
        block = modes[mode]
        if block.get("randomize_colors"):
            if rolled is None:
                rolled = random_colors(MAX_COLOR_SLOTS)
            out[mode] = list(rolled)
        else:
            out[mode] = [c for c in (block.get("colors") or []) if c]
    return out


def random_positions(dynbg_key):
    """Return a dict of CSS-variable strings → values that randomise
    the position-shaped properties of a single dynbg preset. Each
    value is server-rendered fresh on every request, so the same
    surface's blobs / mesh / bands spawn at different coordinates
    each page load.

    Deliberately limited to LAYOUT. Randomising the motion itself
    (per-layer vectors, tempos, shape morphs) was tried and reverted:
    it forced the recipes into per-frame repaints, which is far too
    expensive for a decorative backdrop. The movement stays in
    transform-only keyframes that the compositor can handle.

    Returns an empty dict for presets without meaningfully-randomis-
    able positions (dotted-grid, diagonal-lines) so the consumer can
    safely call this for any key.
    """
    import random as _random
    out = {}
    # A classic recipe is the same shape as the preset it mirrors, so it
    # randomises through the same var family.
    if dynbg_key.endswith("-classic"):
        dynbg_key = dynbg_key[: -len("-classic")]
    if dynbg_key == "aurora-blobs":
        # Each blob: (top|bottom, left|right, size). Randomise the
        # corner anchor + offset + size so the trio looks fresh.
        for slot in ("a", "b", "c"):
            top  = _random.randint(-30, 60)   # %, can go off-screen
            left = _random.randint(-30, 60)
            sz   = _random.randint(220, 460)  # px
            out[f"--fe-dynbg-blob-{slot}-top"]   = f"{top}%"
            out[f"--fe-dynbg-blob-{slot}-left"]  = f"{left}%"
            out[f"--fe-dynbg-blob-{slot}-bottom"] = "auto"
            out[f"--fe-dynbg-blob-{slot}-right"]  = "auto"
            out[f"--fe-dynbg-blob-{slot}-size"]  = f"{sz}px"
    elif dynbg_key == "mesh-gradient":
        # Conic-gradient origin + starting angle for each mesh layer.
        for slot, default_angle in (("a", 0), ("b", 180), ("c", 90)):
            x = _random.randint(15, 85)
            y = _random.randint(15, 85)
            ang = _random.randint(0, 360)
            out[f"--fe-dynbg-mesh-{slot}-x"] = f"{x}%"
            out[f"--fe-dynbg-mesh-{slot}-y"] = f"{y}%"
            out[f"--fe-dynbg-mesh-{slot}-angle"] = f"{ang}deg"
    elif dynbg_key == "aurora-bands":
        # Two bands; each gets a fresh sweep angle.
        for slot in ("a", "b"):
            out[f"--fe-dynbg-band-{slot}-angle"] = f"{_random.randint(40, 160)}deg"
    return out


def positions_to_css_vars(positions):
    """Format a dict of position vars into an inline-style string. Sister
    helper to ``colors_to_css_vars``. Returns empty string for an empty
    dict so consumers can safely concatenate."""
    if not positions:
        return ""
    return " ".join(f"{k}: {v};" for k, v in positions.items())


# Every var the randomiser can emit, across all presets. The per-mode
# swap block in dynbg.css (see "Per-mode positions swap" there) is
# generated from this list; deriving it from random_positions() rather
# than hand-listing means a new randomised var can't be forgotten.
POSITION_VARS = sorted({
    var for key in VALID_KEYS for var in random_positions(key)
})


def resolve_positions_css(cfg, dynbg_key):
    """One-call helper for templates: returns the inline CSS-vars
    string for a dynbg's positional state, per mode. Each mode with
    ``randomize_positions`` on gets the preset's positional vars
    stamped with a ``-light`` / ``-dark`` suffix plus a
    ``--fe-dynbg-pos-<mode>: 1`` marker; the swap rules in dynbg.css
    rebind the canonical vars from the suffixed ones when that mode is
    active (a mode without the marker keeps the preset's hand-tuned
    defaults). One roll is shared when both modes randomise so the
    light/dark switch keeps the same layout. Empty string when neither
    mode randomises OR the preset has nothing positional to randomise.
    Read from the host element's ``style="..."``.
    """
    if isinstance(cfg, str) or cfg is None:
        cfg = decode_config(cfg)
    modes = cfg.get("modes") if isinstance(cfg, dict) else None
    if not (isinstance(modes, dict) and all(isinstance(modes.get(m), dict) for m in MODES)):
        modes = normalize_modes(modes, legacy=cfg)
    rolled = None
    parts = []
    for mode in MODES:
        if not modes[mode].get("randomize_positions"):
            continue
        if rolled is None:
            rolled = random_positions(dynbg_key or "")
        if not rolled:
            return ""
        parts.append(f"--fe-dynbg-pos-{mode}: 1;")
        parts.extend(f"{k}-{mode}: {v};" for k, v in rolled.items())
    return " ".join(parts)


def noise_grain_data_url(size=None, intensity=None):
    """Generate the noise-grain SVG as a data-URL with admin-chosen
    grain size + intensity baked in. baseFrequency on `feTurbulence`
    is the size knob (lower = bigger particles); the rect's opacity
    is the intensity knob.

    Returns the bare URL string suitable for inline
    ``style="background-image: url('...')"``. Caller adds the
    surrounding url() / quote chars as needed.
    """
    sz = normalize_float(size, OVERLAY_SIZE_MIN, OVERLAY_SIZE_MAX, NOISE_SIZE_DEFAULT)
    op = normalize_float(intensity, OVERLAY_INTENSITY_MIN,
                         OVERLAY_INTENSITY_MAX, NOISE_INTENSITY_DEFAULT)
    # All apostrophes inside the SVG are URL-encoded as %27 so they
    # don't conflict with the surrounding `url('...')` wrapper when
    # the data-URL is stamped as an inline `style="background-image:
    # url('...')"`. Without this, after HTML-decoding the apostrophes
    # inside e.g. `viewBox='0 0 256 256'` close the url() string
    # early and the browser drops the rest as invalid CSS — making
    # the noise grain silently vanish whenever a custom size or
    # intensity bakes a fresh URL.
    return (
        "data:image/svg+xml;utf8,"
        "%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E"
        "%3Cfilter id=%27noise%27%3E"
        f"%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27{sz}%27 "
        "numOctaves=%274%27 stitchTiles=%27stitch%27/%3E"
        "%3C/filter%3E"
        f"%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%27{op}%27/%3E"
        "%3C/svg%3E"
    )

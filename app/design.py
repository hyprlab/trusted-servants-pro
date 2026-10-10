# SPDX-License-Identifier: AGPL-3.0-or-later
"""Site-wide design tokens for the public web frontend.

Theme defaults flow as CSS custom properties on the public ``<body>``;
the admin can override any subset via the Site → Design admin page.
Per-section settings (e.g. the two-panel split's spacing dropdowns)
should resolve through the same scales so picking "Tight" anywhere
maps to the same value site-wide.

The font system in :mod:`app.fonts` follows the same model and is
declared as a sibling — design.py covers everything else (spacing,
radius, shadow, colors, buttons, links, text).
"""
import json
import re


# ----- Scales — the design language's vocabulary --------------------

# Spacing scale. Every gap/margin/padding default — and every per-section
# spacing dropdown — should resolve through one of these keys.
SPACING_SCALE = {
    "none": "0",
    "xs":   "0.25rem",
    "sm":   "0.5rem",
    "md":   "1rem",
    "lg":   "2rem",
    "xl":   "4rem",
    "2xl":  "6rem",
}
SPACING_KEYS = list(SPACING_SCALE.keys())

RADIUS_SCALE = {
    "none": "0",
    "sm":   "4px",
    "md":   "8px",
    "lg":   "16px",
    "pill": "999px",
}
RADIUS_KEYS = list(RADIUS_SCALE.keys())

SHADOW_SCALE = {
    "none": "none",
    "sm":   "0 1px 2px rgba(15, 23, 42, 0.06)",
    "md":   "0 4px 12px rgba(15, 23, 42, 0.10)",
    "lg":   "0 12px 28px rgba(15, 23, 42, 0.14)",
    "xl":   "0 12px 32px rgba(15, 23, 42, 0.18)",
}
SHADOW_KEYS = list(SHADOW_SCALE.keys())

# Parallel decomposition of SHADOW_SCALE: same offset+blur as the
# canonical shadow values above, but with the colour split out so a
# per-card shadow_color override can substitute the RGB while keeping
# the scale's alpha. Keys must mirror SHADOW_SCALE; alpha values must
# match the alpha baked into each SHADOW_SCALE entry. Used by the
# card-shadow emission below — operators tune the colour from the
# Design page, the size still resolves through the scale dropdown.
SHADOW_SCALE_COMPONENTS = {
    "none": None,
    "sm":   ("0 1px 2px",   0.06),
    "md":   ("0 4px 12px",  0.10),
    "lg":   ("0 12px 28px", 0.14),
    "xl":   ("0 12px 32px", 0.18),
}


def _hex_to_rgb_triplet(hex_str):
    """Return ``(r, g, b)`` 0-255 ints from a 3/6/8-char ``#`` hex, or
    None if the input doesn't parse. Strips any alpha byte from an
    8-char hex — alpha is supplied separately by the shadow scale."""
    if not isinstance(hex_str, str) or not _HEX_RE.match(hex_str):
        return None
    h = hex_str.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:
        h = h[:6]
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return None


def shadow_with_color(scale_key, hex_color):
    """Compose a ``box-shadow`` value combining the SHADOW_SCALE
    preset's offset+blur with rgba derived from ``hex_color`` + the
    preset's alpha. Falls back to the canonical SHADOW_SCALE value
    when the colour can't be parsed, so an invalid override never
    drops the shadow entirely.

    ``scale_key`` must be a SHADOW_SCALE key. ``hex_color`` is a 3, 6,
    or 8 char hex with leading ``#``. The same colour value works in
    both light and dark mode — alpha is low enough that a neutral
    tint stays visually correct on either background."""
    components = SHADOW_SCALE_COMPONENTS.get(scale_key)
    if components is None:
        return "none"
    offsets, alpha = components
    rgb = _hex_to_rgb_triplet(hex_color)
    if rgb is None:
        return SHADOW_SCALE.get(scale_key, "none")
    r, g, b = rgb
    return f"{offsets} rgba({r}, {g}, {b}, {alpha})"

# Card-style scales — small dedicated vocabularies for the card-token
# group's structural knobs. Concrete pixel / millisecond / transform
# values keep these usable straight from the CSS `var(...)` reads in
# every card class without needing per-component arithmetic.
BORDER_WIDTH_SCALE = {
    "0": "0",
    "1": "1px",
    "2": "2px",
    "3": "3px",
    "4": "4px",
}
BORDER_WIDTH_KEYS = list(BORDER_WIDTH_SCALE.keys())

TRANSITION_SCALE = {
    "none":   "none",
    "fast":   "120ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    "normal": "200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    "slow":   "320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
}
TRANSITION_KEYS = list(TRANSITION_SCALE.keys())

TRANSFORM_SCALE = {
    "none":    "none",
    "lift-sm": "translateY(-1px)",
    "lift-md": "translateY(-2px)",
    "lift-lg": "translateY(-4px)",
}
TRANSFORM_KEYS = list(TRANSFORM_SCALE.keys())

WEIGHT_KEYS = ["400", "500", "600", "700", "800"]
TEXT_TRANSFORM_KEYS = ["none", "uppercase"]
LINK_DECORATION_KEYS = ["none", "underline", "dotted"]
ON_OFF_KEYS = ["on", "off"]


# ----- Theme defaults — what each token resolves to per theme -------

THEME_DEFAULTS = {
    # Classic: white paper, slate ink, brand blue, amber accent; the dark
    # companion is a neutral deep ink (not the Recovery Blue navy).
    "classic": {
        "color_brand":        "#0b5cff",
        "color_accent":       "#f59e0b",
        "color_surface":      "#ffffff",
        "color_surface_alt":  "#f7f8fa",
        "color_surface_dark": "#0d0f14",
        "color_border":       "#e4e7ec",
        "color_text":         "#0f172a",
        "color_text_dark":    "#e7e9ee",
        "color_text_soft":    "#475569",
        "color_link":         "#0b5cff",
        "color_link_hover":   "#0844c2",
        "color_nav_link":          "#334155",
        "color_nav_link_hover":    "#0b5cff",
        "color_megamenu_link":       "#ffffff",
        "color_megamenu_link_hover": "#ffffff",
        "color_btn_primary_bg":         "#0b5cff",
        "color_btn_primary_hover_bg":   "#0a4fe0",
        "color_btn_primary_text":       "#ffffff",
        "color_btn_secondary_bg":       "#ffffff",
        "color_btn_secondary_hover_bg": "#f4f6f9",
        "color_btn_secondary_text":     "#0f172a",
        # Per-style button border colours + widths. Defaults preserve
        # the historic visual: primary borders match the bg colour
        # (visually invisible at any width) while secondary picks up
        # the page border colour at rest and the secondary-text colour
        # on hover (the legacy `.fe-btn-ghost` recipe).
        "color_btn_primary_border":         "#0b5cff",
        "color_btn_primary_hover_border":   "#0b5cff",
        "color_btn_secondary_border":       "#d0d5dd",
        "color_btn_secondary_hover_border": "#98a2b3",
        # Primary card colors — the meeting-card visual is the source.
        # Anywhere the public site uses this same "elevated card" style
        # (homepage meeting cards, meeting-detail panels, three-up
        # cards, etc.) resolves through these four tokens so admins can
        # rebrand every primary card from one place.
        "color_card_primary_bg":          "#ffffff",
        "color_card_primary_bg_dark":     "#15181f",
        "color_card_primary_border":      "#e4e7ec",
        "color_card_primary_border_dark": "#262a33",
        # Secondary card colors — the homepage features-block visual is
        # the source. Anywhere the public site uses this softer "panel"
        # card style (feature cards, FAQ items, quick-access cards,
        # inclusion blocks, event-detail panels, meeting magazine side
        # cards, etc.) resolves through these four tokens.
        "color_card_secondary_bg":          "#f7f8fa",
        "color_card_secondary_bg_dark":     "#15181f",
        "color_card_secondary_border":      "#e9ecf0",
        "color_card_secondary_border_dark": "#23272f",
        # Hover-state border colours — applied on `:hover` so admins
        # can dial in a colour shift independent of the resting border.
        # Classic warms a hairline card to a soft amber on hover.
        "color_card_primary_hover_border":   "#f0b65a",
        "color_card_secondary_hover_border": "#f0b65a",

        # Card-style structural tokens — width, shadow, transition,
        # hover affordance — same defaults across both themes since the
        # meeting + feature cards already shared the same hover language.
        "card_primary_border_width":     "1",
        "card_primary_shadow":           "sm",
        "card_primary_hover_shadow":     "md",
        # Shadow tint per mode. ``shadow_color`` drives the light-mode
        # box-shadow; ``shadow_color_dark`` drives the dark-mode one.
        # Same RGB → same colour in both modes (the historic look); set
        # the dark variant to a different hex when the brand-tinted
        # glow you picked for light surfaces washes out on dark ones.
        # Alpha is always supplied by the chosen shadow scale so a
        # saturated brand colour still reads as a soft glow.
        "card_primary_shadow_color":      "#0f172a",
        "card_primary_shadow_color_dark": "#000000",
        "card_primary_transition":       "normal",
        "card_primary_hover_transform":  "lift-sm",

        "card_secondary_border_width":    "1",
        "card_secondary_shadow":          "none",
        "card_secondary_hover_shadow":    "md",
        "card_secondary_shadow_color":      "#0f172a",
        "card_secondary_shadow_color_dark": "#000000",
        "card_secondary_transition":      "normal",
        "card_secondary_hover_transform": "lift-sm",

        "section_gap":        "lg",
        "container_max_px":   1400,
        # Horizontal padding applied inside `.fe-container`. Defaults
        # to 5vw on both viewports so content always carries a visible
        # gutter — important on intermediate widths (~768–1160 px) where
        # the boxed max-width cap doesn't yet engage and content would
        # otherwise reach the viewport edge.
        "container_pad_desktop": "5vw",
        "container_pad_mobile":  "5vw",
        "card_radius":        "lg",
        "card_shadow":        "sm",

        "btn_radius":         "pill",
        # Button padding is admin-tunable as a free-form CSS length so
        # `14px`, `0.875rem`, `2vw`, etc. all work.
        "btn_padding_x":      "22px",
        "btn_padding_y":      "11px",
        # Per-style border widths. Defaults match what `.fe-btn` shipped
        # with: 1px border on every button, transparent on primary so
        # the box stays visually borderless until the admin sets a
        # contrasting border colour.
        "btn_primary_border_width":         "1",
        "btn_primary_hover_border_width":   "1",
        "btn_secondary_border_width":       "1",
        "btn_secondary_hover_border_width": "1",
        "btn_weight":         "600",
        "btn_text_transform": "none",
        "btn_decoration":     "none",
        # Primary-button effects. Classic keeps the hover lift but drops
        # the heavy drop shadow and glow for flat, crisp buttons.
        "btn_shadow":           "off",
        "btn_hover_transform":  "on",
        "btn_hover_glow":       "off",

        "link_decoration":       "none",
        "link_decoration_hover": "underline",
        "megamenu_link_decoration":       "none",
        "megamenu_link_decoration_hover": "none",

        "text_size_base":     "1rem",
        "text_line_height":   "1.6",

        # Dark footer colors in Classic's deep-ink palette (the other
        # themes take FOOTER_DARK_DEFAULTS below).
        "color_footer_dark_bg":         "#0d0f14",
        "color_footer_dark_line":       "#262a33",
        "color_footer_dark_text":       "#f1f3f6",
        "color_footer_dark_muted":      "#9aa1ad",
        "color_footer_dark_chip":       "#1b1f27",
        "color_footer_dark_chip_hover": "#7aa7ff",
    },
    "recovery-blue": {
        "color_brand":        "#0b5cff",
        "color_accent":       "#0ea5e9",
        "color_surface":      "#ffffff",
        "color_surface_alt":  "#f1f5f9",
        "color_surface_dark": "#0b1026",
        "color_border":       "#cbd5e1",
        "color_text":         "#1e293b",
        "color_text_dark":    "#e2e8f0",
        "color_text_soft":    "#64748b",
        "color_link":         "#0b5cff",
        "color_link_hover":   "#0844c2",
        "color_nav_link":          "#1e293b",
        "color_nav_link_hover":    "#0b5cff",
        "color_megamenu_link":       "#ffffff",
        "color_megamenu_link_hover": "#ffffff",
        "color_btn_primary_bg":         "#0b5cff",
        "color_btn_primary_hover_bg":   "#0a51e0",
        "color_btn_primary_text":       "#ffffff",
        "color_btn_secondary_bg":       "#f4f7fb",
        "color_btn_secondary_hover_bg": "#e0e3e7",
        "color_btn_secondary_text":     "#1e293b",
        "color_btn_primary_border":         "#0b5cff",
        "color_btn_primary_hover_border":   "#0b5cff",
        "color_btn_secondary_border":       "#cbd5e1",
        "color_btn_secondary_hover_border": "#1e293b",
        "color_card_primary_bg":          "#ffffff",
        "color_card_primary_bg_dark":     "#131a33",
        "color_card_primary_border":      "#0ea5e9",
        "color_card_primary_border_dark": "#1f2a44",
        "color_card_secondary_bg":          "#f1f5f9",
        "color_card_secondary_bg_dark":     "#131a33",
        "color_card_secondary_border":      "#cbd5e1",
        "color_card_secondary_border_dark": "#131a33",
        "color_card_primary_hover_border":   "#0ea5e9",
        "color_card_secondary_hover_border": "#0ea5e9",

        "card_primary_border_width":     "1",
        "card_primary_shadow":           "none",
        "card_primary_hover_shadow":     "md",
        "card_primary_shadow_color":      "#0f172a",
        "card_primary_shadow_color_dark": "#0f172a",
        "card_primary_transition":       "normal",
        "card_primary_hover_transform":  "lift-md",

        "card_secondary_border_width":    "1",
        "card_secondary_shadow":          "none",
        "card_secondary_hover_shadow":    "md",
        "card_secondary_shadow_color":      "#0f172a",
        "card_secondary_shadow_color_dark": "#0f172a",
        "card_secondary_transition":      "normal",
        "card_secondary_hover_transform": "lift-md",

        "section_gap":        "lg",
        "container_max_px":   1400,
        "container_pad_desktop": "5vw",
        "container_pad_mobile":  "5vw",
        "card_radius":        "md",
        "card_shadow":        "sm",

        "btn_radius":         "md",
        "btn_padding_x":      "28px",
        "btn_padding_y":      "14px",
        "btn_primary_border_width":         "1",
        "btn_primary_hover_border_width":   "1",
        "btn_secondary_border_width":       "1",
        "btn_secondary_hover_border_width": "1",
        "btn_weight":         "700",
        "btn_text_transform": "uppercase",
        "btn_decoration":     "none",
        # Recovery Blue gets the meeting-page Zoom button recipe by
        # default — the user singled this look out as the preferred
        # primary-button feel for this theme.
        "btn_shadow":           "on",
        "btn_hover_transform":  "on",
        "btn_hover_glow":       "on",

        "link_decoration":       "underline",
        "link_decoration_hover": "underline",
        "megamenu_link_decoration":       "none",
        "megamenu_link_decoration_hover": "none",

        "text_size_base":     "1rem",
        "text_line_height":   "1.55",
    },
    # ── Modern Dark ("Aurora") ────────────────────────────────────────
    # Indigo-black canvas, glass cards, a mint-teal action color and a
    # violet hover edge. Defaults to dark mode (see THEMES); the light
    # values are the "daylight" counterpart on a pale lavender canvas.
    # The aurora light, glass and type live in
    # static/css/themes/modern-dark.css, which reads these tokens.
    "modern-dark": {
        "color_brand":        "#7c6cf2",
        "color_accent":       "#0f766e",
        "color_surface":      "#f5f5fb",
        "color_surface_alt":  "#ffffff",
        "color_surface_dark": "#07081a",
        "color_border":       "#e3e3f1",
        "color_text":         "#11132b",
        "color_text_dark":    "#e9eaf8",
        "color_text_soft":    "#4f5377",
        "color_link":         "#4f46e5",
        "color_link_hover":   "#3730a3",
        "color_nav_link":          "#3f4366",
        "color_nav_link_hover":    "#11132b",
        "color_megamenu_link":       "#1c1f3d",
        "color_megamenu_link_hover": "#4f46e5",
        "color_btn_primary_bg":         "#2dd4bf",
        "color_btn_primary_hover_bg":   "#5eead4",
        "color_btn_primary_text":       "#042f2e",
        "color_btn_secondary_bg":       "#ffffff",
        "color_btn_secondary_hover_bg": "#f1f0fb",
        "color_btn_secondary_text":     "#11132b",
        "color_btn_primary_border":         "#2dd4bf",
        "color_btn_primary_hover_border":   "#5eead4",
        "color_btn_secondary_border":       "#dcdcec",
        "color_btn_secondary_hover_border": "#a5a0ee",
        "color_card_primary_bg":          "#ffffff",
        "color_card_primary_bg_dark":     "#0d0f26",
        "color_card_primary_border":      "#e4e3f2",
        "color_card_primary_border_dark": "#24274a",
        "color_card_secondary_bg":          "#fbfbfe",
        "color_card_secondary_bg_dark":     "#0d0f26",
        "color_card_secondary_border":      "#e4e3f2",
        "color_card_secondary_border_dark": "#24274a",
        "color_card_primary_hover_border":   "#8b7cf6",
        "color_card_secondary_hover_border": "#8b7cf6",

        "card_primary_border_width":     "1",
        "card_primary_shadow":           "sm",
        "card_primary_hover_shadow":     "lg",
        "card_primary_shadow_color":      "#2a2470",
        "card_primary_shadow_color_dark": "#000000",
        "card_primary_transition":       "normal",
        "card_primary_hover_transform":  "lift-sm",

        "card_secondary_border_width":    "1",
        "card_secondary_shadow":          "sm",
        "card_secondary_hover_shadow":    "lg",
        "card_secondary_shadow_color":      "#2a2470",
        "card_secondary_shadow_color_dark": "#000000",
        "card_secondary_transition":      "normal",
        "card_secondary_hover_transform": "lift-sm",

        "color_footer_dark_bg":         "#05061a",
        "color_footer_dark_line":       "#1e2042",
        "color_footer_dark_text":       "#e9eaf8",
        "color_footer_dark_muted":      "#a4a8cc",
        "color_footer_dark_chip":       "#14163a",
        "color_footer_dark_chip_hover": "#5eead4",

        "section_gap":        "xl",
        "container_max_px":   1320,
        "container_pad_desktop": "5vw",
        "container_pad_mobile":  "5vw",
        "card_radius":        "lg",
        "card_shadow":        "sm",

        "btn_radius":         "pill",
        "btn_padding_x":      "24px",
        "btn_padding_y":      "12px",
        "btn_primary_border_width":         "0",
        "btn_primary_hover_border_width":   "0",
        "btn_secondary_border_width":       "1",
        "btn_secondary_hover_border_width": "1",
        "btn_weight":         "600",
        "btn_text_transform": "none",
        "btn_decoration":     "none",
        "btn_shadow":           "on",
        "btn_hover_transform":  "on",
        "btn_hover_glow":       "on",

        "link_decoration":       "none",
        "link_decoration_hover": "underline",
        "megamenu_link_decoration":       "none",
        "megamenu_link_decoration_hover": "none",

        "text_size_base":     "1.0625rem",
        "text_line_height":   "1.6",
    },
    # ── Cyberpunk ("Neon HUD") ────────────────────────────────────────
    # Near-black HUD canvas, neon cyan signal + magenta accent, zero
    # radius. Defaults to dark mode; light mode is pale blueprint paper.
    # Chamfered panels, corner brackets, grid and scanlines live in
    # static/css/themes/cyberpunk.css.
    "cyberpunk": {
        "color_brand":        "#00eaff",
        "color_accent":       "#ff2d95",
        "color_surface":      "#edf1f5",
        "color_surface_alt":  "#fbfcfd",
        "color_surface_dark": "#05070d",
        "color_border":       "#c3ced9",
        "color_text":         "#0d1424",
        "color_text_dark":    "#d3deec",
        "color_text_soft":    "#4a5568",
        "color_link":         "#00738a",
        "color_link_hover":   "#b0156e",
        "color_nav_link":          "#0d1424",
        "color_nav_link_hover":    "#00738a",
        "color_megamenu_link":       "#cfeaff",
        "color_megamenu_link_hover": "#ffffff",
        "color_btn_primary_bg":         "#ff2d95",
        "color_btn_primary_hover_bg":   "#00eaff",
        "color_btn_primary_text":       "#05060f",
        "color_btn_secondary_bg":       "#07101a",
        "color_btn_secondary_hover_bg": "#0c1b28",
        "color_btn_secondary_text":     "#00eaff",
        "color_btn_primary_border":         "#ff2d95",
        "color_btn_primary_hover_border":   "#00eaff",
        "color_btn_secondary_border":       "#00eaff",
        "color_btn_secondary_hover_border": "#ff2d95",
        "color_card_primary_bg":          "#fbfcfd",
        "color_card_primary_bg_dark":     "#0a0f1b",
        "color_card_primary_border":      "#9fbfcd",
        "color_card_primary_border_dark": "#1a2840",
        "color_card_secondary_bg":          "#f4f7fa",
        "color_card_secondary_bg_dark":     "#0a0f1b",
        "color_card_secondary_border":      "#c3ced9",
        "color_card_secondary_border_dark": "#1a2840",
        "color_card_primary_hover_border":   "#ff2d95",
        "color_card_secondary_hover_border": "#00eaff",

        "card_primary_border_width":     "1",
        "card_primary_shadow":           "none",
        "card_primary_hover_shadow":     "none",
        "card_primary_shadow_color":      "#00eaff",
        "card_primary_shadow_color_dark": "#00eaff",
        "card_primary_transition":       "fast",
        "card_primary_hover_transform":  "lift-sm",

        "card_secondary_border_width":    "1",
        "card_secondary_shadow":          "none",
        "card_secondary_hover_shadow":    "none",
        "card_secondary_shadow_color":      "#00eaff",
        "card_secondary_shadow_color_dark": "#00eaff",
        "card_secondary_transition":      "fast",
        "card_secondary_hover_transform": "lift-sm",

        "section_gap":        "lg",
        "container_max_px":   1400,
        "container_pad_desktop": "5vw",
        "container_pad_mobile":  "5vw",
        "card_radius":        "none",
        "card_shadow":        "none",

        "btn_radius":         "none",
        "btn_padding_x":      "26px",
        "btn_padding_y":      "13px",
        "btn_primary_border_width":         "1",
        "btn_primary_hover_border_width":   "1",
        "btn_secondary_border_width":       "1",
        "btn_secondary_hover_border_width": "1",
        "btn_weight":         "700",
        "btn_text_transform": "uppercase",
        "btn_decoration":     "none",
        "btn_shadow":           "off",
        "btn_hover_transform":  "on",
        "btn_hover_glow":       "off",

        "link_decoration":       "none",
        "link_decoration_hover": "underline",
        "megamenu_link_decoration":       "none",
        "megamenu_link_decoration_hover": "none",

        "text_size_base":     "1.0625rem",
        "text_line_height":   "1.6",
    },
    # ── Sanctuary (warm light) ────────────────────────────────────────
    # A printed-book feel: cream paper canvas, sage-green brand, clay
    # accent, olive-ink text, Lora headings, soft rounded cards with warm
    # low shadows and hairline borders. Defaults to light mode; the dark
    # companion ("candlelit" warm brown) is in themes/sanctuary.css.
    "sanctuary": {
        "color_brand":        "#56735c",
        "color_accent":       "#9e5536",
        "color_surface":      "#f5efe3",
        "color_surface_alt":  "#ebe2d0",
        "color_surface_dark": "#1e1a14",
        "color_border":       "#e0d5c0",
        "color_text":         "#2e3127",
        "color_text_dark":    "#eee4d1",
        "color_text_soft":    "#645f4d",
        "color_link":         "#46624d",
        "color_link_hover":   "#2f4836",
        "color_nav_link":          "#2e3127",
        "color_nav_link_hover":    "#46624d",
        "color_megamenu_link":       "#2e3127",
        "color_megamenu_link_hover": "#46624d",
        "color_btn_primary_bg":         "#56735c",
        "color_btn_primary_hover_bg":   "#46624d",
        "color_btn_primary_text":       "#fbf6ec",
        "color_btn_secondary_bg":       "#f1e8d7",
        "color_btn_secondary_hover_bg": "#e8dcc6",
        "color_btn_secondary_text":     "#2e3127",
        "color_btn_primary_border":         "#56735c",
        "color_btn_primary_hover_border":   "#46624d",
        "color_btn_secondary_border":       "#ddd0b8",
        "color_btn_secondary_hover_border": "#56735c",
        "color_card_primary_bg":          "#fffcf6",
        "color_card_primary_bg_dark":     "#29241c",
        "color_card_primary_border":      "#e6dccb",
        "color_card_primary_border_dark": "#3b3326",
        "color_card_secondary_bg":          "#f9f4ea",
        "color_card_secondary_bg_dark":     "#26211a",
        "color_card_secondary_border":      "#e6dccb",
        "color_card_secondary_border_dark": "#3b3326",
        "color_card_primary_hover_border":   "#cfae94",
        "color_card_secondary_hover_border": "#a9bba8",

        "card_primary_border_width":     "1",
        "card_primary_shadow":           "sm",
        "card_primary_hover_shadow":     "lg",
        "card_primary_shadow_color":      "#5a4a32",
        "card_primary_shadow_color_dark": "#000000",
        "card_primary_transition":       "normal",
        "card_primary_hover_transform":  "lift-sm",

        "card_secondary_border_width":    "1",
        "card_secondary_shadow":          "none",
        "card_secondary_hover_shadow":    "md",
        "card_secondary_shadow_color":      "#5a4a32",
        "card_secondary_shadow_color_dark": "#000000",
        "card_secondary_transition":      "normal",
        "card_secondary_hover_transform": "none",

        "section_gap":        "xl",
        "container_max_px":   1400,
        "container_pad_desktop": "5vw",
        "container_pad_mobile":  "5vw",
        "card_radius":        "lg",
        "card_shadow":        "sm",

        "btn_radius":         "pill",
        "btn_padding_x":      "26px",
        "btn_padding_y":      "13px",
        "btn_primary_border_width":         "1",
        "btn_primary_hover_border_width":   "1",
        "btn_secondary_border_width":       "1",
        "btn_secondary_hover_border_width": "1",
        "btn_weight":         "600",
        "btn_text_transform": "none",
        "btn_decoration":     "none",
        "btn_shadow":           "off",
        "btn_hover_transform":  "on",
        "btn_hover_glow":       "off",

        "link_decoration":       "none",
        "link_decoration_hover": "underline",
        "megamenu_link_decoration":       "none",
        "megamenu_link_decoration_hover": "none",

        "text_size_base":     "1.0625rem",
        "text_line_height":   "1.7",
    },
    "terminal": {
        # A TUI: the site as a terminal application. Phosphor green on a
        # near-black canvas, amber for live/now, JetBrains Mono throughout,
        # panels drawn as framed windows, zero radius, no shadows. Defaults
        # to dark; the light values are a "printout" (off-white paper, ink).
        # Brand/button green is shared by both modes; link + accent are the
        # deep green that reads on paper (dark mode uses the bright phosphor).
        "color_brand":        "#3ad07c",
        "color_accent":       "#15783a",
        "color_surface":      "#f5f4ee",
        "color_surface_alt":  "#ebeae2",
        "color_surface_dark": "#090c0a",
        "color_border":       "#c6cbbf",
        "color_text":         "#161b17",
        "color_text_dark":    "#c2d0c6",
        "color_text_soft":    "#535f56",
        "color_link":         "#13733a",
        "color_link_hover":   "#0b5428",
        "color_nav_link":          "#161b17",
        "color_nav_link_hover":    "#13733a",
        "color_megamenu_link":       "#161b17",
        "color_megamenu_link_hover": "#13733a",
        "color_btn_primary_bg":         "#3ad07c",
        "color_btn_primary_hover_bg":   "#6ee6a2",
        "color_btn_primary_text":       "#04110a",
        "color_btn_secondary_bg":       "#f5f4ee",
        "color_btn_secondary_hover_bg": "#161b17",
        "color_btn_secondary_text":     "#161b17",
        "color_btn_primary_border":         "#3ad07c",
        "color_btn_primary_hover_border":   "#6ee6a2",
        "color_btn_secondary_border":       "#161b17",
        "color_btn_secondary_hover_border": "#161b17",
        "color_card_primary_bg":          "#fbfaf6",
        "color_card_primary_bg_dark":     "#0d120f",
        "color_card_primary_border":      "#c6cbbf",
        "color_card_primary_border_dark": "#24342a",
        "color_card_secondary_bg":          "#f0efe8",
        "color_card_secondary_bg_dark":     "#0b0f0c",
        "color_card_secondary_border":      "#c6cbbf",
        "color_card_secondary_border_dark": "#24342a",
        "color_card_primary_hover_border":   "#13733a",
        "color_card_secondary_hover_border": "#13733a",
        "color_footer_dark_bg":         "#060807",
        "color_footer_dark_line":       "#24342a",
        "color_footer_dark_text":       "#c2d0c6",
        "color_footer_dark_muted":      "#8b9c91",
        "color_footer_dark_chip":       "#111814",
        "color_footer_dark_chip_hover": "#3ad07c",

        "card_primary_border_width":     "1",
        "card_primary_shadow":           "none",
        "card_primary_hover_shadow":     "none",
        "card_primary_shadow_color":      "#0a0e0c",
        "card_primary_shadow_color_dark": "#000000",
        "card_primary_transition":       "fast",
        "card_primary_hover_transform":  "none",

        "card_secondary_border_width":    "1",
        "card_secondary_shadow":          "none",
        "card_secondary_hover_shadow":    "none",
        "card_secondary_shadow_color":      "#0a0e0c",
        "card_secondary_shadow_color_dark": "#000000",
        "card_secondary_transition":      "fast",
        "card_secondary_hover_transform": "none",

        "section_gap":        "xl",
        "container_max_px":   1320,
        "container_pad_desktop": "5vw",
        "container_pad_mobile":  "5vw",
        "card_radius":        "none",
        "card_shadow":        "none",

        "btn_radius":         "none",
        "btn_padding_x":      "18px",
        "btn_padding_y":      "10px",
        "btn_primary_border_width":         "1",
        "btn_primary_hover_border_width":   "1",
        "btn_secondary_border_width":       "1",
        "btn_secondary_hover_border_width": "1",
        "btn_weight":         "600",
        "btn_text_transform": "none",
        "btn_decoration":     "none",
        "btn_shadow":           "off",
        "btn_hover_transform":  "off",
        "btn_hover_glow":       "off",

        "link_decoration":       "none",
        "link_decoration_hover": "underline",
        "megamenu_link_decoration":       "none",
        "megamenu_link_decoration_hover": "none",

        "text_size_base":     "0.9375rem",
        "text_line_height":   "1.7",
    },
    "neobrutal": {
        # Neobrutalism: flat saturated color blocks on a warm off-white
        # canvas, thick ink borders, hard offset shadows, Archivo Black
        # display type. Cards are white panels; the theme CSS gives each
        # page family its own block color (meetings yellow = accent, events
        # cyan, announcements lime, literature lavender, stories pink =
        # brand) and paints the borders and hard shadows from the card
        # border tokens. Dark mode keeps the bright blocks on a near-black
        # canvas, with light borders and shadows.
        "color_brand":        "#ff4d8d",
        "color_accent":       "#ffd23f",
        "color_surface":      "#fbf5e9",
        "color_surface_alt":  "#f2e9d4",
        "color_surface_dark": "#131118",
        "color_border":       "#121212",
        "color_text":         "#16130e",
        "color_text_dark":    "#f6f1e4",
        "color_text_soft":    "#5a5144",
        "color_link":         "#c2005c",
        "color_link_hover":   "#8f0045",
        "color_nav_link":          "#16130e",
        "color_nav_link_hover":    "#16130e",
        "color_megamenu_link":       "#16130e",
        "color_megamenu_link_hover": "#16130e",
        "color_btn_primary_bg":         "#ff4d8d",
        "color_btn_primary_hover_bg":   "#ff70a6",
        "color_btn_primary_text":       "#121212",
        "color_btn_secondary_bg":       "#ffffff",
        "color_btn_secondary_hover_bg": "#ffd23f",
        "color_btn_secondary_text":     "#121212",
        "color_btn_primary_border":         "#121212",
        "color_btn_primary_hover_border":   "#121212",
        "color_btn_secondary_border":       "#121212",
        "color_btn_secondary_hover_border": "#121212",
        "color_card_primary_bg":          "#ffffff",
        "color_card_primary_bg_dark":     "#1e1b26",
        "color_card_primary_border":      "#121212",
        "color_card_primary_border_dark": "#f3ede0",
        "color_card_secondary_bg":          "#ffffff",
        "color_card_secondary_bg_dark":     "#1e1b26",
        "color_card_secondary_border":      "#121212",
        "color_card_secondary_border_dark": "#f3ede0",
        "color_card_primary_hover_border":   "#121212",
        "color_card_secondary_hover_border": "#121212",

        "card_primary_border_width":     "3",
        "card_primary_shadow":           "none",
        "card_primary_hover_shadow":     "none",
        "card_primary_shadow_color":      "#121212",
        "card_primary_shadow_color_dark": "#f3ede0",
        "card_primary_transition":       "fast",
        "card_primary_hover_transform":  "none",

        "card_secondary_border_width":    "3",
        "card_secondary_shadow":          "none",
        "card_secondary_hover_shadow":    "none",
        "card_secondary_shadow_color":      "#121212",
        "card_secondary_shadow_color_dark": "#f3ede0",
        "card_secondary_transition":      "fast",
        "card_secondary_hover_transform": "none",

        "section_gap":        "xl",
        "container_max_px":   1320,
        "container_pad_desktop": "5vw",
        "container_pad_mobile":  "5vw",
        "card_radius":        "md",
        "card_shadow":        "none",

        "btn_radius":         "md",
        "btn_padding_x":      "24px",
        "btn_padding_y":      "12px",
        "btn_primary_border_width":         "3",
        "btn_primary_hover_border_width":   "3",
        "btn_secondary_border_width":       "3",
        "btn_secondary_hover_border_width": "3",
        "btn_weight":         "700",
        "btn_text_transform": "uppercase",
        "btn_decoration":     "none",
        "btn_shadow":           "off",
        "btn_hover_transform":  "off",
        "btn_hover_glow":       "off",

        "link_decoration":       "none",
        "link_decoration_hover": "underline",
        "megamenu_link_decoration":       "none",
        "megamenu_link_decoration_hover": "none",

        "text_size_base":     "1.0625rem",
        "text_line_height":   "1.65",
    },
}


# ----- Field schema ---------------------------------------------------
# Drives the admin form, the saved-value validator, and the css_vars
# emitter. Each entry has a `kind`:
#   "color"  — hex string (#rgb / #rrggbb / #rrggbbaa)
#   "scale"  — one of SPACING_KEYS / RADIUS_KEYS / SHADOW_KEYS keyed by `scale`
#   "select" — explicit `choices` list
#   "int"    — integer with optional min/max
#   "text"   — short free string (length-capped)

DESIGN_FIELDS = [
    # ----- Colors -----
    {"key": "color_brand",       "kind": "color",  "group": "Colors", "label": "Brand"},
    {"key": "color_accent",      "kind": "color",  "group": "Colors", "label": "Accent"},
    {"key": "color_surface",     "kind": "color",  "group": "Colors", "label": "Surface (page bg)"},
    {"key": "color_surface_alt", "kind": "color",  "group": "Colors", "label": "Surface — alt"},
    {"key": "color_surface_dark", "kind": "color", "group": "Colors",
     "label": "Surface — Darkmode",
     "help": "Default dark-mode background for pages, containers, and any element without an explicit colour. Sections that hardcoded #0b1026 also inherit this token."},
    {"key": "color_border",      "kind": "color",  "group": "Colors", "label": "Border"},
    {"key": "color_text",        "kind": "color",  "group": "Colors", "label": "Text"},
    {"key": "color_text_dark",   "kind": "color",  "group": "Colors",
     "label": "Text — Darkmode",
     "help": "Body/text colour used site-wide in dark mode. Anywhere the Text token is consumed, this value takes over when the site renders in dark mode."},
    {"key": "color_text_soft",   "kind": "color",  "group": "Colors", "label": "Text — muted"},
    {"key": "color_link",        "kind": "color",  "group": "Colors", "label": "Link"},
    {"key": "color_link_hover",  "kind": "color",  "group": "Colors", "label": "Link — hover"},
    {"key": "color_nav_link",         "kind": "color", "group": "Colors", "label": "Header nav link"},
    {"key": "color_nav_link_hover",   "kind": "color", "group": "Colors", "label": "Header nav link — hover"},
    {"key": "color_megamenu_link",       "kind": "color", "group": "Colors", "label": "Mega-menu link"},
    {"key": "color_megamenu_link_hover", "kind": "color", "group": "Colors", "label": "Mega-menu link — hover"},
    {"key": "color_card_primary_bg",          "kind": "color", "group": "Colors",
     "label": "Primary card — background",
     "help": "Default background for meeting cards and every elevated card that shares the meeting-card style."},
    {"key": "color_card_primary_bg_dark",     "kind": "color", "group": "Colors",
     "label": "Primary card — background (dark)",
     "help": "Background used when the public site renders in dark mode."},
    {"key": "color_card_primary_border",      "kind": "color", "group": "Colors",
     "label": "Primary card — border"},
    {"key": "color_card_primary_border_dark", "kind": "color", "group": "Colors",
     "label": "Primary card — border (dark)"},
    {"key": "color_card_secondary_bg",          "kind": "color", "group": "Colors",
     "label": "Secondary card — background",
     "help": "Default background for feature cards and every soft-surface card that shares the features-block style."},
    {"key": "color_card_secondary_bg_dark",     "kind": "color", "group": "Colors",
     "label": "Secondary card — background (dark)",
     "help": "Background used when the public site renders in dark mode."},
    {"key": "color_card_secondary_border",      "kind": "color", "group": "Colors",
     "label": "Secondary card — border"},
    {"key": "color_card_secondary_border_dark", "kind": "color", "group": "Colors",
     "label": "Secondary card — border (dark)"},
    {"key": "color_card_primary_hover_border",   "kind": "color", "group": "Colors",
     "label": "Primary card — hover border",
     "help": "Border colour applied on hover. Defaults to the primary card's resting border (no visible shift)."},
    {"key": "color_card_secondary_hover_border", "kind": "color", "group": "Colors",
     "label": "Secondary card — hover border",
     "help": "Border colour applied on hover. Defaults to the accent colour (matches the legacy feature-card hover)."},

    # ----- Layout -----
    {"key": "section_gap",      "kind": "scale", "scale": "spacing",
     "group": "Layout", "label": "Default section spacing",
     "help": "Vertical rhythm between top-level sections."},
    {"key": "container_max_px", "kind": "int", "min": 720, "max": 1600, "step": 20,
     "group": "Layout", "label": "Container max width (px)"},
    {"key": "container_pad_desktop", "kind": "text", "max_len": 16,
     "group": "Layout", "label": "Container padding — desktop",
     "placeholder": "5vw",
     "help": "Horizontal padding inside the container at desktop widths. Default 5vw keeps a visible gutter at intermediate widths where the boxed max-width cap doesn't yet engage. Any CSS length: 0, 24px, 2rem, 5vw, 5%."},
    {"key": "container_pad_mobile",  "kind": "text", "max_len": 16,
     "group": "Layout", "label": "Container padding — mobile",
     "placeholder": "5vw",
     "help": "Horizontal padding inside the container at mobile widths (≤768px). Default 5vw keeps a small gutter so content doesn't crash into the screen edges."},
    {"key": "card_radius", "kind": "scale", "scale": "radius",
     "group": "Layout", "label": "Card radius"},
    {"key": "card_shadow", "kind": "scale", "scale": "shadow",
     "group": "Layout", "label": "Card shadow",
     "help": "Shadow on panels that use neither card style, such as the event poster's ticket and the actions panel on a meeting page."},

    # ----- Buttons -----
    {"key": "color_btn_primary_bg",     "kind": "color",
     "group": "Buttons", "label": "Primary — background"},
    {"key": "color_btn_primary_hover_bg", "kind": "color",
     "group": "Buttons", "label": "Primary — hover background"},
    {"key": "color_btn_primary_text",   "kind": "color",
     "group": "Buttons", "label": "Primary — text"},
    {"key": "color_btn_primary_border",       "kind": "color",
     "group": "Buttons", "label": "Primary — border"},
    {"key": "color_btn_primary_hover_border", "kind": "color",
     "group": "Buttons", "label": "Primary — hover border"},
    {"key": "btn_primary_border_width",       "kind": "scale", "scale": "border_width",
     "group": "Buttons", "label": "Primary — border width"},
    {"key": "btn_primary_hover_border_width", "kind": "scale", "scale": "border_width",
     "group": "Buttons", "label": "Primary — hover border width"},
    {"key": "color_btn_secondary_bg",   "kind": "color",
     "group": "Buttons", "label": "Secondary — background"},
    {"key": "color_btn_secondary_hover_bg", "kind": "color",
     "group": "Buttons", "label": "Secondary — hover background"},
    {"key": "color_btn_secondary_text", "kind": "color",
     "group": "Buttons", "label": "Secondary — text"},
    {"key": "color_btn_secondary_border",       "kind": "color",
     "group": "Buttons", "label": "Secondary — border"},
    {"key": "color_btn_secondary_hover_border", "kind": "color",
     "group": "Buttons", "label": "Secondary — hover border"},
    {"key": "btn_secondary_border_width",       "kind": "scale", "scale": "border_width",
     "group": "Buttons", "label": "Secondary — border width"},
    {"key": "btn_secondary_hover_border_width", "kind": "scale", "scale": "border_width",
     "group": "Buttons", "label": "Secondary — hover border width"},
    {"key": "btn_radius",         "kind": "scale", "scale": "radius",
     "group": "Buttons", "label": "Radius"},
    {"key": "btn_padding_x", "kind": "text", "max_len": 16,
     "group": "Buttons", "label": "Horizontal padding (left/right)",
     "placeholder": "28px",
     "help": "Any CSS length: 28px, 1.75rem, 2vw."},
    {"key": "btn_padding_y", "kind": "text", "max_len": 16,
     "group": "Buttons", "label": "Vertical padding (top/bottom)",
     "placeholder": "14px",
     "help": "Any CSS length: 14px, 0.875rem, 1vw."},
    {"key": "btn_weight",         "kind": "select", "choices": WEIGHT_KEYS,
     "group": "Buttons", "label": "Font weight"},
    {"key": "btn_text_transform", "kind": "select", "choices": TEXT_TRANSFORM_KEYS,
     "group": "Buttons", "label": "Text transform"},
    {"key": "btn_decoration", "kind": "select", "choices": LINK_DECORATION_KEYS,
     "group": "Buttons", "label": "Text decoration",
     "help": "Off (`none`) keeps anchor-styled buttons free of underline."},
    {"key": "btn_shadow", "kind": "select", "choices": ON_OFF_KEYS,
     "group": "Buttons", "label": "Primary — drop shadow",
     "help": "Soft shadow under primary buttons at rest. Off makes the button sit flat on the page."},
    {"key": "btn_hover_transform", "kind": "select", "choices": ON_OFF_KEYS,
     "group": "Buttons", "label": "Primary — hover lift",
     "help": "Slight upward translate on hover that gives primary buttons a lift cue."},
    {"key": "btn_hover_glow", "kind": "select", "choices": ON_OFF_KEYS,
     "group": "Buttons", "label": "Primary — hover glow",
     "help": "Larger coloured shadow on hover that reads as an outer glow."},

    # ----- Links -----
    {"key": "link_decoration",       "kind": "select", "choices": LINK_DECORATION_KEYS,
     "group": "Links", "label": "Body link decoration"},
    {"key": "link_decoration_hover", "kind": "select", "choices": LINK_DECORATION_KEYS,
     "group": "Links", "label": "Body link decoration on hover"},
    {"key": "megamenu_link_decoration",       "kind": "select", "choices": LINK_DECORATION_KEYS,
     "group": "Links", "label": "Mega-menu link decoration"},
    {"key": "megamenu_link_decoration_hover", "kind": "select", "choices": LINK_DECORATION_KEYS,
     "group": "Links", "label": "Mega-menu link decoration on hover"},

    # ----- Text -----
    {"key": "text_size_base",   "kind": "text", "max_len": 16,
     "group": "Text", "label": "Base size", "placeholder": "1rem"},
    {"key": "text_line_height", "kind": "text", "max_len": 16,
     "group": "Text", "label": "Line height", "placeholder": "1.6"},

    # ----- Card styles -----
    # The 8 card colour tokens above (in Colors) are mirrored into this
    # group by the admin template: same canonical form inputs, rendered
    # twice with bidirectional JS sync, so an admin can tune the look
    # from either tab without losing changes.
    {"key": "card_primary_border_width",    "kind": "scale", "scale": "border_width",
     "group": "Card styles", "label": "Primary card — border width"},
    {"key": "card_primary_shadow",          "kind": "scale", "scale": "shadow",
     "group": "Card styles", "label": "Primary card — shadow"},
    {"key": "card_primary_hover_shadow",    "kind": "scale", "scale": "shadow",
     "group": "Card styles", "label": "Primary card — hover shadow"},
    # Single shadow tint per card style — applies to both the resting
    # and the hover shadow on this card kind, and identically in light
    # and dark mode. Alpha comes from whichever shadow scale is
    # currently selected; this colour just supplies the RGB.
    {"key": "card_primary_shadow_color",    "kind": "color",
     "group": "Card styles", "label": "Primary card — shadow color"},
    {"key": "card_primary_shadow_color_dark", "kind": "color",
     "group": "Card styles", "label": "Primary card — shadow color (dark mode)"},
    {"key": "card_primary_transition",      "kind": "scale", "scale": "transition",
     "group": "Card styles", "label": "Primary card — transition"},
    {"key": "card_primary_hover_transform", "kind": "scale", "scale": "transform",
     "group": "Card styles", "label": "Primary card — hover transform"},

    {"key": "card_secondary_border_width",    "kind": "scale", "scale": "border_width",
     "group": "Card styles", "label": "Secondary card — border width"},
    {"key": "card_secondary_shadow",          "kind": "scale", "scale": "shadow",
     "group": "Card styles", "label": "Secondary card — shadow"},
    {"key": "card_secondary_hover_shadow",    "kind": "scale", "scale": "shadow",
     "group": "Card styles", "label": "Secondary card — hover shadow"},
    {"key": "card_secondary_shadow_color",    "kind": "color",
     "group": "Card styles", "label": "Secondary card — shadow color"},
    {"key": "card_secondary_shadow_color_dark", "kind": "color",
     "group": "Card styles", "label": "Secondary card — shadow color (dark mode)"},
    {"key": "card_secondary_transition",      "kind": "scale", "scale": "transition",
     "group": "Card styles", "label": "Secondary card — transition"},
    {"key": "card_secondary_hover_transform", "kind": "scale", "scale": "transform",
     "group": "Card styles", "label": "Secondary card — hover transform"},
]
# Dark footer colors (Design → Footer). The same defaults in every theme:
# they are the values frontend.css hard-coded before they were settings,
# and only the Classic and Recovery Blue footers read them (the other
# themes paint their footer in themes/<key>.css).
FOOTER_DARK_DEFAULTS = {
    "color_footer_dark_bg":         "#0b1026",
    "color_footer_dark_line":       "#1f2a44",
    "color_footer_dark_text":       "#f1f5f9",
    "color_footer_dark_muted":      "#94a3b8",
    "color_footer_dark_chip":       "#131a33",
    "color_footer_dark_chip_hover": "#7aa3ff",
}
for _defaults in THEME_DEFAULTS.values():
    for _k, _v in FOOTER_DARK_DEFAULTS.items():
        _defaults.setdefault(_k, _v)

DESIGN_FIELDS += [
    {"key": "color_footer_dark_bg", "kind": "color", "group": "Footer", "label": "Background",
     "help": "Behind a dark footer when its background style doesn't paint one (a Solid style with no color picked)."},
    {"key": "color_footer_dark_line", "kind": "color", "group": "Footer", "label": "Lines",
     "help": "The top border and the rules between rows."},
    {"key": "color_footer_dark_text", "kind": "color", "group": "Footer", "label": "Text on a light page",
     "help": "Text and links of the always-dark footer while the rest of the page is light."},
    {"key": "color_footer_dark_muted", "kind": "color", "group": "Footer", "label": "Text on a dark page",
     "help": "Links, tagline and copyright when the whole page is in dark mode; kept quiet against the dark page."},
    {"key": "color_footer_dark_chip", "kind": "color", "group": "Footer", "label": "Social icon",
     "help": "The circle behind each social icon."},
    {"key": "color_footer_dark_chip_hover", "kind": "color", "group": "Footer", "label": "Social icon on hover"},
]

DESIGN_FIELDS_BY_KEY = {f["key"]: f for f in DESIGN_FIELDS}

# Map "scale" name → the actual scale dict.
SCALES = {"spacing": SPACING_SCALE, "radius": RADIUS_SCALE, "shadow": SHADOW_SCALE,
          "border_width": BORDER_WIDTH_SCALE,
          "transition": TRANSITION_SCALE, "transform": TRANSFORM_SCALE}


_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def derive_dark_color(hex_str):
    """Return a dark-mode-friendly variant of an arbitrary hex color.

    Strategy: convert to HLS, preserve hue + saturation, clamp lightness
    into a dark band (12% or 16% depending on saturation so very
    saturated colours don't disappear into black). Returns None on
    invalid input. Used by the two-panel split's dark-mode-aware bg
    toggle so an admin's chosen pastel automatically gets a sensible
    dark companion in dark mode."""
    import colorsys
    if not isinstance(hex_str, str) or not _HEX_RE.match(hex_str):
        return None
    h = hex_str.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:  # drop alpha; we only emit #rrggbb output
        h = h[:6]
    try:
        r = int(h[0:2], 16) / 255.0
        g = int(h[2:4], 16) / 255.0
        b = int(h[4:6], 16) / 255.0
    except ValueError:
        return None
    hue, light, sat = colorsys.rgb_to_hls(r, g, b)
    new_l = 0.16 if sat > 0.5 else 0.12
    nr, ng, nb = colorsys.hls_to_rgb(hue, new_l, sat)
    return "#{:02x}{:02x}{:02x}".format(int(nr * 255), int(ng * 255), int(nb * 255))


def _coerce(field, value):
    """Validate + coerce a single override value. Returns the safe value
    or None if the input is invalid (caller skips invalid overrides)."""
    if value is None:
        return None
    kind = field["kind"]
    if kind == "color":
        if isinstance(value, str) and _HEX_RE.match(value):
            return value
    elif kind == "scale":
        scale = SCALES.get(field.get("scale")) or {}
        if value in scale:
            return value
    elif kind == "select":
        if value in field.get("choices", []):
            return value
    elif kind == "int":
        try:
            iv = int(value)
        except (TypeError, ValueError):
            return None
        lo = field.get("min", 0)
        hi = field.get("max", 1_000_000)
        if lo <= iv <= hi:
            return iv
    elif kind == "text":
        if isinstance(value, str):
            v = value.strip()
            if 0 < len(v) <= field.get("max_len", 80):
                return v
    return None


def resolve_design(site):
    """Layer site overrides on top of the active theme's defaults."""
    theme = (site.frontend_theme if site else None) or "classic"
    base = dict(THEME_DEFAULTS.get(theme) or THEME_DEFAULTS["classic"])
    raw = (site.frontend_design_json if site else None) or ""
    try:
        overrides = json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        overrides = {}
    for key, val in (overrides or {}).items():
        f = DESIGN_FIELDS_BY_KEY.get(key)
        if not f:
            continue
        coerced = _coerce(f, val)
        if coerced is not None:
            base[key] = coerced
    return base


def parse_design_form(form):
    """Read posted form fields keyed ``design_<token_key>`` and return a
    dict of valid overrides only. Empty / missing / invalid inputs are
    treated as 'not overridden' so the theme default takes over.

    Color fields are gated by a ``design_<key>_enabled`` checkbox: native
    ``<input type=color>`` always submits a value, so without the
    checkbox we couldn't tell "user picked this colour" from "user left
    it on the theme default". When the checkbox is missing, the colour
    is treated as not-overridden."""
    out = {}
    for f in DESIGN_FIELDS:
        if f["kind"] == "color" and form.get("design_" + f["key"] + "_enabled") != "1":
            continue
        raw = form.get("design_" + f["key"])
        if raw is None:
            continue
        if isinstance(raw, str) and not raw.strip():
            continue
        coerced = _coerce(f, raw)
        if coerced is not None:
            out[f["key"]] = coerced
    return out


# ----- Design page presentation ---------------------------------------
# Slider stops for the admin Design page, per scale: (key, tick label
# under the track, readout beside the label). Keys must match the scale
# dicts above; "weight" covers WEIGHT_KEYS.
SCALE_UI = {
    "border_width": [("0", "0", "None"), ("1", "1", "1px"), ("2", "2", "2px"),
                     ("3", "3", "3px"), ("4", "4", "4px")],
    "shadow": [("none", "None", "None"), ("sm", "S", "Small"), ("md", "M", "Medium"),
               ("lg", "L", "Large"), ("xl", "XL", "Extra large")],
    "radius": [("none", "0", "Square"), ("sm", "4", "4px"), ("md", "8", "8px"),
               ("lg", "16", "16px"), ("pill", "Pill", "Pill")],
    "transition": [("none", "Off", "Instant"), ("fast", "Fast", "Fast, 120ms"),
                   ("normal", "Normal", "Normal, 200ms"), ("slow", "Slow", "Slow, 320ms")],
    "transform": [("none", "None", "No lift"), ("lift-sm", "1px", "Lifts 1px"),
                  ("lift-md", "2px", "Lifts 2px"), ("lift-lg", "4px", "Lifts 4px")],
    "weight": [("400", "400", "Regular"), ("500", "500", "Medium"), ("600", "600", "Semibold"),
               ("700", "700", "Bold"), ("800", "800", "Extra bold")],
}


def design_studio_data(site):
    """Everything the admin Design page needs: the active theme's
    defaults, the valid saved overrides, and the scales and shadow parts
    its live preview resolves tokens through."""
    theme = (site.frontend_theme if site else None) or "classic"
    defaults = THEME_DEFAULTS.get(theme) or THEME_DEFAULTS["classic"]
    raw = (site.frontend_design_json if site else None) or ""
    try:
        saved = json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        saved = {}
    overrides = {}
    for key, val in (saved or {}).items():
        f = DESIGN_FIELDS_BY_KEY.get(key)
        coerced = _coerce(f, val) if f else None
        if coerced is not None:
            overrides[key] = coerced
    return {
        "defaults": defaults,
        "overrides": overrides,
        "scales": SCALES,
        "scale_ui": SCALE_UI,
        "shadow_parts": SHADOW_SCALE_COMPONENTS,
    }


def text_decoration(key):
    """CSS ``text-decoration`` value for a LINK_DECORATION_KEYS choice.
    A bare ``dotted`` only sets the line style, so the shorthand drew no
    line at all; it needs the ``underline`` line as well."""
    return "underline dotted" if key == "dotted" else key


def design_css_vars(site):
    """CSS custom-property string for the public ``<body>`` style.

    Emits both the raw scales (so any consumer can write
    ``padding: var(--fe-space-md)`` etc.) AND the resolved per-token
    defaults (e.g. ``--fe-color-brand``, ``--fe-btn-radius``)."""
    parts = []

    # Scales (always available, identical site-wide).
    for k, v in SPACING_SCALE.items():
        parts.append(f"--fe-space-{k}: {v};")
    for k, v in RADIUS_SCALE.items():
        parts.append(f"--fe-radius-{k}: {v};")
    for k, v in SHADOW_SCALE.items():
        parts.append(f"--fe-shadow-{k}: {v};")
    for k, v in BORDER_WIDTH_SCALE.items():
        parts.append(f"--fe-bw-{k}: {v};")
    for k, v in TRANSITION_SCALE.items():
        # Dashes are CSS-safe; transition keys already use them ("fast", "slow")
        parts.append(f"--fe-transition-{k}: {v};")
    for k, v in TRANSFORM_SCALE.items():
        parts.append(f"--fe-transform-{k}: {v};")

    chosen = resolve_design(site)

    # Colors (raw hex).
    for key in ("color_brand", "color_accent", "color_surface", "color_surface_alt",
                "color_surface_dark",
                "color_border", "color_text", "color_text_dark", "color_text_soft",
                "color_link", "color_link_hover",
                "color_nav_link", "color_nav_link_hover",
                "color_megamenu_link", "color_megamenu_link_hover",
                "color_btn_primary_bg", "color_btn_primary_hover_bg", "color_btn_primary_text",
                "color_btn_primary_border", "color_btn_primary_hover_border",
                "color_btn_secondary_bg", "color_btn_secondary_hover_bg", "color_btn_secondary_text",
                "color_btn_secondary_border", "color_btn_secondary_hover_border",
                "color_card_primary_bg", "color_card_primary_bg_dark",
                "color_card_primary_border", "color_card_primary_border_dark",
                "color_card_secondary_bg", "color_card_secondary_bg_dark",
                "color_card_secondary_border", "color_card_secondary_border_dark",
                "color_card_primary_hover_border",
                "color_card_secondary_hover_border",
                *FOOTER_DARK_DEFAULTS):
        parts.append("--fe-{}: {};".format(key.replace("_", "-"), chosen[key]))

    # Auto-derived dark-mode variants for chrome links that sit on dark
    # surfaces (mega menu). Uses the existing colors.dark_variant helper
    # which brightens hue-preserving toward the 0.70–0.92 lightness band
    # so a pure-white input becomes a slightly-dimmed off-white in dark
    # mode rather than staying harsh #ffffff.
    from .colors import dark_variant
    parts.append(f"--fe-color-megamenu-link-dark: {dark_variant(chosen['color_megamenu_link'])};")
    parts.append(f"--fe-color-megamenu-link-hover-dark: {dark_variant(chosen['color_megamenu_link_hover'])};")

    # Layout.
    parts.append(f"--fe-section-gap: var(--fe-space-{chosen['section_gap']});")
    parts.append(f"--fe-container-max: {chosen['container_max_px']}px;")
    parts.append(f"--fe-container-pad-desktop: {chosen.get('container_pad_desktop', '0')};")
    parts.append(f"--fe-container-pad-mobile: {chosen.get('container_pad_mobile', '5vw')};")
    parts.append(f"--fe-card-radius: var(--fe-radius-{chosen['card_radius']});")
    parts.append(f"--fe-card-shadow: var(--fe-shadow-{chosen['card_shadow']});")

    # Buttons.
    parts.append(f"--fe-btn-radius: var(--fe-radius-{chosen['btn_radius']});")
    parts.append(f"--fe-btn-padding-x: {chosen['btn_padding_x']};")
    parts.append(f"--fe-btn-padding-y: {chosen['btn_padding_y']};")
    # Per-style border widths — resolved through the BORDER_WIDTH_SCALE
    # so the consumer can write a plain `border-width: var(--fe-btn-…)`.
    for kind in ("primary", "secondary"):
        for which in ("border_width", "hover_border_width"):
            key = f"btn_{kind}_{which}"
            parts.append(
                f"--fe-btn-{kind}-{which.replace('_', '-')}: "
                f"var(--fe-bw-{chosen[key]});"
            )
    parts.append(f"--fe-btn-weight: {chosen['btn_weight']};")
    parts.append(f"--fe-btn-text-transform: {chosen['btn_text_transform']};")
    parts.append(f"--fe-btn-decoration: {text_decoration(chosen['btn_decoration'])};")
    # Primary-button effect tokens — empty/`none` when disabled so the
    # CSS rule's `box-shadow: var(--fe-btn-shadow)` resolves to no
    # shadow / no transform without needing a separate disabled rule.
    _shadow = "0 8px 20px rgba(15, 23, 42, 0.18)" if chosen.get("btn_shadow") != "off" else "none"
    _hover_t = "translateY(-1px)" if chosen.get("btn_hover_transform") != "off" else "none"
    _hover_g = "0 10px 28px rgba(81, 100, 255, 0.32)" if chosen.get("btn_hover_glow") != "off" else "none"
    parts.append(f"--fe-btn-shadow: {_shadow};")
    parts.append(f"--fe-btn-hover-transform: {_hover_t};")
    parts.append(f"--fe-btn-hover-glow: {_hover_g};")

    # Links.
    parts.append(f"--fe-link-decoration: {text_decoration(chosen['link_decoration'])};")
    parts.append(f"--fe-link-decoration-hover: {text_decoration(chosen['link_decoration_hover'])};")
    parts.append(f"--fe-megamenu-link-decoration: {text_decoration(chosen['megamenu_link_decoration'])};")
    parts.append(f"--fe-megamenu-link-decoration-hover: {text_decoration(chosen['megamenu_link_decoration_hover'])};")

    # Text.
    parts.append(f"--fe-text-size-base: {chosen['text_size_base']};")
    parts.append(f"--fe-text-line-height: {chosen['text_line_height']};")

    # Card-style structural tokens — resolved to the underlying scale
    # values so cards can write a plain `border-width: var(--fe-card-
    # primary-border-width)` without indirection.
    for which in ("primary", "secondary"):
        parts.append(
            f"--fe-card-{which}-border-width: "
            f"var(--fe-bw-{chosen['card_' + which + '_border_width']});"
        )
        # Card shadows compose the scale's offset+blur with rgba derived
        # from the admin's shadow_color choice. Two parallel pairs of
        # vars are emitted — light (``-shadow`` / ``-hover-shadow``) and
        # dark (``-shadow-dark`` / ``-hover-shadow-dark``). The
        # ``html[data-theme="dark"]`` rules in frontend.css read the
        # dark pair on every consumer of ``.fe-card-primary`` /
        # ``.fe-card-secondary`` so the operator's dark-mode shadow
        # tint kicks in without affecting the light-mode value.
        # ``shadow_with_color`` preserves the scale's alpha so a
        # saturated brand colour still reads as a soft glow rather
        # than an opaque block, and falls back to the canonical
        # SHADOW_SCALE value if the colour can't be parsed.
        _shadow_color_light = chosen.get('card_' + which + '_shadow_color', '#0f172a')
        _shadow_color_dark  = chosen.get('card_' + which + '_shadow_color_dark', _shadow_color_light)
        parts.append(
            f"--fe-card-{which}-shadow: "
            f"{shadow_with_color(chosen['card_' + which + '_shadow'], _shadow_color_light)};"
        )
        parts.append(
            f"--fe-card-{which}-hover-shadow: "
            f"{shadow_with_color(chosen['card_' + which + '_hover_shadow'], _shadow_color_light)};"
        )
        parts.append(
            f"--fe-card-{which}-shadow-dark: "
            f"{shadow_with_color(chosen['card_' + which + '_shadow'], _shadow_color_dark)};"
        )
        parts.append(
            f"--fe-card-{which}-hover-shadow-dark: "
            f"{shadow_with_color(chosen['card_' + which + '_hover_shadow'], _shadow_color_dark)};"
        )
        parts.append(
            f"--fe-card-{which}-transition: "
            f"var(--fe-transition-{chosen['card_' + which + '_transition']});"
        )
        parts.append(
            f"--fe-card-{which}-hover-transform: "
            f"var(--fe-transform-{chosen['card_' + which + '_hover_transform']});"
        )

    return " ".join(parts)


def neobrutal_hero_css_vars(site):
    """Per-request random positions for the Neobrutal hero's geometric
    primitives. Returns a CSS custom-property string when the active theme is
    Neobrutal (empty otherwise), so each page load scatters the shapes anew.
    Each shape roams a generous region in its own corner so the centred
    headline always stays clear of them.

    Consumed by neobrutal.css's ``.fe-hero::before`` (four outlined circles)
    and ``::after`` (the tilted square) via ``var(--nb-s*-*, <default>)`` — the
    defaults keep a sensible static layout if this ever returns empty.
    """
    if not site or (getattr(site, "frontend_theme", "") or "") != "neobrutal":
        return ""
    import random
    def p(lo, hi):
        return f"{random.randint(lo, hi)}%"
    parts = [
        f"--nb-s1-x: {p(5, 20)}",  f"--nb-s1-y: {p(12, 42)}",
        f"--nb-s2-x: {p(80, 94)}", f"--nb-s2-y: {p(8, 30)}",
        f"--nb-s3-x: {p(80, 94)}", f"--nb-s3-y: {p(68, 90)}",
        f"--nb-s4-x: {p(8, 28)}",  f"--nb-s4-y: {p(70, 92)}",
        f"--nb-sq-right: {p(4, 14)}",
        f"--nb-sq-rot: {random.randint(-18, 18)}deg",
    ]
    return "; ".join(parts) + ";"

# SPDX-License-Identifier: AGPL-3.0-or-later
"""Zoom Tech Training: the page as Markdown or as blocks.

The page is one of two versions, picked by ``SiteSetting.zoom_tech_format``:

- Markdown (``zoom_tech_body``), written in the same editor as stories
  and blog posts. Each ``##`` heading starts a section.
- Blocks (``zoom_tech_blocks_json``), sections of blocks from the block
  editor (``static/js/block_editor.js``). Each section title starts a
  section.

Either converts to the other (``sections_to_markdown``,
``markdown_to_sections``), and the version not in use is kept, so the
editor can go back to it. A blank format means whichever is stored:
Markdown once saved, else blocks, the page's form before Markdown.
"""
import html
import json
import re
import uuid

from flask import current_app
from markupsafe import Markup

from .blog_convert import blocks_to_markdown, describe_notes

FORMATS = ("markdown", "blocks")

# Block types the editor offers for this page.
BLOCK_TYPES = ["paragraph", "heading", "image", "video", "button", "list",
               "callout", "code", "separator"]

_VIDEO_EXT = (".mp4", ".webm", ".m4v", ".mov", ".ogv")
_IMG_RE = re.compile(r"<img\b[^>]*>")
_SRC_RE = re.compile(r'\bsrc="([^"]*)"')
_H2_RE = re.compile(r"<h2>(.*?)</h2>", re.S)
_TAG_RE = re.compile(r"<[^>]+>")

_FENCE_RE = re.compile(r"^\s*(```|~~~)\s*([\w+#.-]*)\s*$")
_HEAD_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_RULE_RE = re.compile(r"^\s*([-*_])(?:\s*\1){2,}\s*$")
_IMG_LINE_RE = re.compile(r'^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)$')
_CAPTION_RE = re.compile(r"^\*([^*].*?)\*$")


def _is_video(src):
    return str(src or "").lower().split("?")[0].endswith(_VIDEO_EXT)


# ── What's stored ───────────────────────────────────────────────────

def stored_sections(site):
    """The block version, or [] when there is none."""
    try:
        sections = json.loads(site.zoom_tech_blocks_json or "[]")
    except (ValueError, TypeError):
        return []
    return [s for s in sections if isinstance(s, dict)] if isinstance(sections, list) else []


def has_markdown(site):
    return bool((site.zoom_tech_body or "").strip())


def has_blocks(site):
    return any(s.get("title") or s.get("blocks") for s in stored_sections(site))


def page_format(site):
    """"markdown" or "blocks": the version the page shows."""
    if site.zoom_tech_format in FORMATS:
        return site.zoom_tech_format
    if site.zoom_tech_body is not None:
        return "markdown"
    return "blocks" if has_blocks(site) else "markdown"


# ── Blocks → Markdown ───────────────────────────────────────────────

def _section_blocks(sections):
    """Each section's blocks, a video block as an image of the video
    (which ``render`` plays)."""
    for sec in sections or []:
        blocks = []
        for b in sec.get("blocks") or []:
            if not isinstance(b, dict):
                continue
            d = b.get("data") or {}
            if b.get("type") == "video" and d.get("src"):
                b = {"type": "image", "data": {"src": d["src"], "alt": "Video"}}
            blocks.append(b)
        yield sec, blocks


def sections_to_markdown(sections):
    """The block version as Markdown, each section title a ``##``
    heading."""
    parts = []
    for sec, blocks in _section_blocks(sections):
        body, _ = blocks_to_markdown(blocks)
        title = " ".join(str(sec.get("title") or "").split())
        parts.append("\n\n".join(x for x in ((f"## {title}" if title else ""), body.strip()) if x))
    return "\n\n".join(p for p in parts if p).strip() + "\n"


def markdown_notes(sections):
    """Sentences on what the block version loses as Markdown."""
    counts = {}
    for _, blocks in _section_blocks(sections):
        for k, n in blocks_to_markdown(blocks)[1].items():
            counts[k] = counts.get(k, 0) + n
    return describe_notes(counts)


# ── Markdown → blocks ───────────────────────────────────────────────

def _uid():
    return uuid.uuid4().hex[:8]


def markdown_to_sections(markdown):
    """The Markdown as the block editor's sections: each ``#`` or ``##``
    heading starts a section, and the text between blank lines becomes
    a block. A paragraph stays Markdown, an image line becomes an image
    (or a video, for a video file), a quote a callout, a smaller heading
    a heading block, fenced code a code block and a rule a divider."""
    sections = []
    cur = None

    def section(title):
        nonlocal cur
        cur = {"id": _uid(), "title": title, "blocks": []}
        sections.append(cur)

    def add(kind, data):
        if cur is None:
            section("")
        cur["blocks"].append({"id": _uid(), "type": kind, "data": data})

    para = []

    def flush():
        lines = [line for line in para]
        para.clear()
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()
        if not lines:
            return
        img = _IMG_LINE_RE.match(lines[0].strip())
        cap = _CAPTION_RE.match(lines[1].strip()) if len(lines) == 2 else None
        if img and (len(lines) == 1 or cap):
            alt, src = img.group(1), img.group(2)
            if _is_video(src):
                add("video", {"src": src, "poster": ""})
            else:
                add("image", {"src": src, "alt": alt, "caption": cap.group(1) if cap else ""})
            return
        if all(line.lstrip().startswith(">") for line in lines):
            body = "\n".join(re.sub(r"^\s*>\s?", "", line) for line in lines).strip()
            add("callout", {"variant": "info", "title": "", "md": body})
            return
        add("paragraph", {"md": "\n".join(lines)})

    lines = (markdown or "").replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        fence = _FENCE_RE.match(line)
        if fence:
            flush()
            mark, code = fence.group(1), []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith(mark):
                code.append(lines[i])
                i += 1
            add("code", {"lang": fence.group(2), "code": "\n".join(code)})
            i += 1
            continue
        head = _HEAD_RE.match(line)
        if head:
            flush()
            level = len(head.group(1))
            if level <= 2:
                section(head.group(2))
            else:
                add("heading", {"level": level, "text": head.group(2)})
        elif _RULE_RE.match(line):
            flush()
            add("separator", {})
        elif not line.strip():
            flush()
        else:
            para.append(line)
        i += 1
    flush()
    return sections


# ── Rendering the Markdown version ──────────────────────────────────

def _slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "section"


def render(markdown):
    """``(html, toc)``: the page as HTML, and its sections as
    ``[(anchor, title)]``. Rendered like a block paragraph
    (``markdown_block``), then an image of a video file becomes a
    player and each ``##`` heading gets an anchor."""
    out = str(current_app.jinja_env.filters["markdown_block"](markdown or ""))

    def video(m):
        src = _SRC_RE.search(m.group(0))
        if not src or not _is_video(src.group(1)):
            return m.group(0)
        return f'<video src="{src.group(1)}" controls preload="metadata"></video>'

    out = _IMG_RE.sub(video, out)

    toc, used = [], set()

    def heading(m):
        title = html.unescape(_TAG_RE.sub("", m.group(1))).strip()
        anchor = base = "sec-" + _slug(title)
        n = 2
        while anchor in used:
            anchor = f"{base}-{n}"
            n += 1
        used.add(anchor)
        toc.append((anchor, title))
        return f'<h2 id="{anchor}">{m.group(1)}</h2>'

    out = _H2_RE.sub(heading, out)
    return Markup(out), toc


# ── Design ──────────────────────────────────────────────────────────
# The page's look, set on the editor's Design tab and stored as JSON in
# ``zoom_tech_design_json``: only what the admin set, everything else
# following the admin theme. Each color has a light and a dark value
# (``<key>_dark``); a blank dark value keeps the dark theme's own color.

DESIGN_COLORS = [
    ("bg", "Background", "Behind the whole page."),
    ("text", "Text", "Paragraphs and lists."),
    ("heading", "Headings", "Section titles and smaller headings."),
    ("link", "Links", "Links in the text."),
    ("accent", "Accent", "The edge of quotes and the current section in the contents."),
    ("quote_bg", "Quotes and callouts", "Behind quotes and callouts."),
]

# Named choices: key → (label, help, default, [(value, label, css)]).
DESIGN_CHOICES = {
    "text_size": ("Text size", "The size of the text; headings follow it.", "md",
                  [("sm", "S", "15px"), ("md", "M", "17px"), ("lg", "L", "19px"), ("xl", "XL", "21px")]),
    "line_height": ("Line spacing", "The space between lines of text.", "normal",
                    [("tight", "Tight", "1.5"), ("normal", "Normal", "1.7"), ("relaxed", "Relaxed", "1.9")]),
    "width": ("Text width", "How wide the text runs on a wide screen.", "medium",
              [("narrow", "Narrow", "40rem"), ("medium", "Medium", "46rem"), ("wide", "Wide", "56rem"),
               ("full", "Full", "100%")]),
    "img_radius": ("Photo corners", "How round the corners of photos and videos are.", "medium",
                   [("none", "Square", "0"), ("small", "Small", "6px"), ("medium", "Medium", "10px"),
                    ("large", "Large", "18px")]),
}

DESIGN_SWITCHES = [
    ("img_border", "Outline photos", "A thin line around photos and videos.", True),
    ("img_shadow", "Shadow under photos", "A soft shadow under photos and videos.", False),
]

DESIGN_FONTS = [
    ("body_font", "Text font", "Paragraphs, lists and quotes."),
    ("heading_font", "Heading font", "Section titles and smaller headings."),
]

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _hex(v):
    v = str(v or "").strip()
    if re.match(r"^#[0-9a-fA-F]{3}$", v):
        v = "#" + "".join(c * 2 for c in v[1:])
    return v.lower() if _HEX_RE.match(v) else ""


def clean_design(raw):
    """Only known keys with valid values: the stored form of a design,
    from the editor's fields (``ztd_<key>``) or from storage."""
    from .fonts import font_by_key
    get = raw.get
    out = {}
    for key, _, _ in DESIGN_COLORS:
        for k in (key, key + "_dark"):
            v = _hex(get(k))
            if v:
                out[k] = v
    for key, (_, _, default, opts) in DESIGN_CHOICES.items():
        v = get(key)
        if v and v != default and v in {o[0] for o in opts}:
            out[key] = v
    for key, _, _, default in DESIGN_SWITCHES:
        v = get(key)
        if v in ("1", "0", True, False, 1, 0):
            on = v in ("1", True, 1)
            if on != default:
                out[key] = "1" if on else "0"
    for key, _, _ in DESIGN_FONTS:
        v = str(get(key) or "").strip().lower()
        if v and font_by_key(v):
            out[key] = v
    return out


def load_design(site):
    try:
        raw = json.loads(site.zoom_tech_design_json or "{}")
    except (ValueError, TypeError):
        raw = {}
    return clean_design(raw) if isinstance(raw, dict) else {}


def design_form(form):
    """The design posted by the editor. A switch posts only when on."""
    raw = {k[4:]: v for k, v in form.items() if k.startswith("ztd_")}
    for key, _, _, _ in DESIGN_SWITCHES:
        raw[key] = "1" if form.get("ztd_" + key) else "0"
    return clean_design(raw)


def design_switch(design, key):
    default = next(d for k, _, _, d in DESIGN_SWITCHES if k == key)
    return design[key] == "1" if key in design else default


def design_css(design):
    """CSS for a design: custom properties on ``.zt-design`` (the page,
    and the editor's preview), each color's light value under the light
    theme and its dark value under the dark one, and the page's
    background behind the whole content column."""
    from .fonts import font_stack
    light, dark, both, extra = [], [], [], []
    for key, _, _ in DESIGN_COLORS:
        var = "--zt-" + key.replace("_", "-")
        if design.get(key):
            light.append(f"{var}: {design[key]};")
        if design.get(key + "_dark"):
            dark.append(f"{var}: {design[key + '_dark']};")
    for key, (_, _, _, opts) in DESIGN_CHOICES.items():
        if key in design:
            css = {o[0]: o[2] for o in opts}[design[key]]
            both.append(f"--zt-{key.replace('_', '-')}: {css};")
    if not design_switch(design, "img_border"):
        both.append("--zt-img-border: none;")
    if design_switch(design, "img_shadow"):
        both.append("--zt-img-shadow: 0 6px 24px rgba(15, 23, 42, .16);")
    for key, _, _ in DESIGN_FONTS:
        if design.get(key):
            # Font names come from the font list; keep only what a
            # font-family list can hold.
            stack = re.sub(r"[^A-Za-z0-9 ,'\"_.-]", "", font_stack(design[key]))
            both.append(f"--zt-{key.replace('_', '-')}: {stack};")
    if both:
        extra.append(".zt-design { " + " ".join(both) + " }")
    if light:
        extra.append('html:not([data-theme="dark"]) .zt-design { ' + " ".join(light) + " }")
    if dark:
        extra.append('html[data-theme="dark"] .zt-design { ' + " ".join(dark) + " }")
    # Callouts keep their own tint unless the design sets one.
    if design.get("quote_bg"):
        extra.append(f'html:not([data-theme="dark"]) .zt-design .block-callout {{ background: {design["quote_bg"]}; }}')
    if design.get("quote_bg_dark"):
        extra.append(f'html[data-theme="dark"] .zt-design .block-callout {{ background: {design["quote_bg_dark"]}; }}')
    # The background fills the content column, not just the text.
    if design.get("bg"):
        extra.append(f'html:not([data-theme="dark"]) .content:has(.zt-page) {{ background: {design["bg"]}; }}')
    if design.get("bg_dark"):
        extra.append(f'html[data-theme="dark"] .content:has(.zt-page) {{ background: {design["bg_dark"]}; }}')
    return Markup("\n".join(extra))


def design_fonts(design):
    """Custom fonts the design uses, for their font-face CSS."""
    from .fonts import custom_fonts
    keys = {design.get(k) for k, _, _ in DESIGN_FONTS} - {None, ""}
    return [cf for cf in custom_fonts() if cf.get("key") in keys] if keys else []

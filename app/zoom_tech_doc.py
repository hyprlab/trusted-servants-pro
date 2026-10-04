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

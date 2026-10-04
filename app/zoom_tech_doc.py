# SPDX-License-Identifier: AGPL-3.0-or-later
"""Zoom Tech Training: the page's Markdown and its contents.

The page is one Markdown document (``SiteSetting.zoom_tech_body``),
written in the same editor as stories and blog posts. Each ``##``
heading starts a section, and the Wiki layout lists the sections
beside the page.

Before the Markdown editor the page was a list of sections of blocks
(``zoom_tech_blocks_json``). That stays as it was; until the first save
in the editor, ``page_markdown`` writes those blocks out as Markdown,
each section title as a ``##`` heading.
"""
import html
import json
import re

from flask import current_app
from markupsafe import Markup

from .blog_convert import blocks_to_markdown

_VIDEO_EXT = (".mp4", ".webm", ".m4v", ".mov", ".ogv")
_IMG_RE = re.compile(r"<img\b[^>]*>")
_SRC_RE = re.compile(r'\bsrc="([^"]*)"')
_H2_RE = re.compile(r"<h2>(.*?)</h2>", re.S)
_TAG_RE = re.compile(r"<[^>]+>")


def sections_to_markdown(sections):
    """The block-built page as Markdown. A video block becomes an
    image line pointing at the video, which ``render`` plays."""
    parts = []
    for sec in sections or []:
        if not isinstance(sec, dict):
            continue
        blocks = []
        for b in sec.get("blocks") or []:
            if not isinstance(b, dict):
                continue
            d = b.get("data") or {}
            if b.get("type") == "video" and d.get("src"):
                b = {"type": "image", "data": {"src": d["src"], "alt": "Video"}}
            blocks.append(b)
        body, _ = blocks_to_markdown(blocks)
        title = " ".join(str(sec.get("title") or "").split())
        parts.append("\n\n".join(x for x in ((f"## {title}" if title else ""), body.strip()) if x))
    return "\n\n".join(p for p in parts if p).strip() + "\n"


def page_markdown(site):
    """``(markdown, from_blocks)``: the saved Markdown (even blank), or
    the block version written out as Markdown when it was never saved."""
    if site.zoom_tech_body is not None:
        return site.zoom_tech_body, False
    try:
        sections = json.loads(site.zoom_tech_blocks_json or "[]")
    except (ValueError, TypeError):
        sections = []
    if isinstance(sections, list) and sections:
        return sections_to_markdown(sections), True
    return "", False


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
        if not src or not src.group(1).lower().split("?")[0].endswith(_VIDEO_EXT):
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

# SPDX-License-Identifier: AGPL-3.0-or-later
"""Blog post bodies: from the block builder to Markdown.

A blog post written in the old drag-and-drop builder keeps its body in
``BlogPost.body_blocks_json``; a Markdown post keeps it in ``body``. The
public templates render the blocks when there are any and the Markdown
otherwise, so each post is converted on its own, when an editor chooses
to (the blog editor's "Convert to Markdown", or the blog list's bulk
action), and the block version is kept in ``body_blocks_backup_json``
so the conversion can be undone.

``blocks_to_markdown`` writes the Markdown and lists what Markdown
can't carry over, so the editor can say so before converting. The
public page renders a converted body with the ``markdown`` filter,
while the builder rendered its paragraphs with ``markdown_block``; each
paragraph goes through ``block_breaks`` here so it reads the same.
"""
import re

_FENCE_RE = re.compile(r"^(?:```|~~~)")
_LIST_RE = re.compile(r"^\s*(?:[-*+]\s|\d+\.\s)")
_HEAD_RE = re.compile(r"^#{1,6}\s")
_BQ_RE = re.compile(r"^>\s?")


def block_breaks(text):
    """Insert the blank line Python-Markdown needs before a list item,
    heading or quote that directly follows a line of another kind, so
    ``intro⏎- item`` becomes a list. Fenced code is left alone. Used by
    the ``markdown_block`` filter and by the conversion below."""
    out = []
    in_fence = False
    for line in text.split("\n"):
        if _FENCE_RE.match(line):
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence:
            out.append(line)
            continue
        prev = out[-1] if out else ""
        is_list = bool(_LIST_RE.match(line))
        is_head = bool(_HEAD_RE.match(line))
        is_bq = bool(_BQ_RE.match(line))
        if (is_list or is_head or is_bq) and prev and prev.strip():
            same_kind = ((is_list and _LIST_RE.match(prev))
                         or (is_head and _HEAD_RE.match(prev))
                         or (is_bq and _BQ_RE.match(prev)))
            if not same_kind:
                out.append("")
        out.append(line)
    return "\n".join(out)


# What the builder could do that Markdown can't, by note key: the
# sentence for one block and for several. Shown before converting.
NOTES = {
    "section": ("1 section loses the spacing set above and below it.",
                "{n} sections lose the spacing set above and below them."),
    "image": ("1 image loses its width, alignment, shadow and spacing, and shows at "
              "its own size, up to the page width.",
              "{n} images lose their width, alignment, shadow and spacing, and show at "
              "their own size, up to the page width."),
    "button": ("1 button becomes a link.",
               "{n} buttons become links."),
    "callout": ("1 callout becomes a quote, with its title in bold.",
                "{n} callouts become quotes, with their titles in bold."),
    "video": ("1 video becomes a link to the video.",
              "{n} videos become links to the video."),
}


def describe_notes(counts):
    """Plain sentences for the counts from ``blocks_to_markdown``."""
    out = []
    for key, (one, many) in NOTES.items():
        n = counts.get(key, 0)
        if n:
            out.append(one if n == 1 else many.format(n=n))
    return out


def _one_line(text):
    return " ".join(str(text or "").split())


def _url(url):
    # Markdown link destinations can't hold spaces.
    return str(url or "").strip().replace(" ", "%20")


def _alt(text):
    return _one_line(text).replace("[", "(").replace("]", ")")


def _quote(text):
    return "\n".join(("> " + line) if line.strip() else ">"
                     for line in str(text).strip().split("\n"))


def blocks_to_markdown(blocks):
    """Return ``(markdown, counts)`` for a decoded block list, where
    ``counts`` maps a ``NOTES`` key to how many blocks of that kind
    lost something on the way."""
    counts = {}
    parts = []

    def note(key):
        counts[key] = counts.get(key, 0) + 1

    def emit(block):
        t = block.get("type")
        d = block.get("data") or {}
        if t == "section":
            note("section")
            for child in d.get("blocks") or []:
                emit(child)
        elif t == "paragraph":
            md = str(d.get("md") or "").strip()
            if md:
                parts.append(block_breaks(md))
        elif t == "heading":
            text = _one_line(d.get("text"))
            if text:
                try:
                    level = int(d.get("level") or 2)
                except (TypeError, ValueError):
                    level = 2
                parts.append("#" * (level if level in (2, 3, 4) else 2) + " " + text)
        elif t == "image":
            src = _url(d.get("src"))
            if not src:
                return
            if (str(d.get("align") or "center") != "center"
                    or int(d.get("width_pct") or 100) != 100
                    or d.get("shadow")
                    or float(d.get("margin_top", 1.5) or 0) != 1.5
                    or float(d.get("margin_bottom", 1.5) or 0) != 1.5):
                note("image")
            img = f"![{_alt(d.get('alt'))}]({src})"
            caption = _one_line(d.get("caption"))
            parts.append(img + (f"\n*{caption}*" if caption else ""))
        elif t == "button":
            note("button")
            label = _one_line(d.get("label")) or "Click here"
            parts.append(f"[{_alt(label)}]({_url(d.get('url')) or '#'})")
        elif t == "list":
            items = [_one_line(i) for i in (d.get("items") or []) if _one_line(i)]
            if items:
                if d.get("ordered"):
                    parts.append("\n".join(f"{n}. {i}" for n, i in enumerate(items, 1)))
                else:
                    parts.append("\n".join(f"- {i}" for i in items))
        elif t == "quote":
            text = str(d.get("text") or "").strip()
            if text:
                author = _one_line(d.get("author"))
                parts.append(_quote(text) + (f"\n>\n> *{author}*" if author else ""))
        elif t == "callout":
            note("callout")
            title = _one_line(d.get("title"))
            body = str(d.get("md") or "").strip()
            inner = "\n\n".join(x for x in ((f"**{title}**" if title else ""), body) if x)
            if inner:
                parts.append(_quote(inner))
        elif t == "video":
            url = _url(d.get("url"))
            if url:
                note("video")
                parts.append(f"[{_alt(d.get('caption')) or 'Watch the video'}]({url})")
        elif t == "code":
            code = str(d.get("code") or "").rstrip()
            if code:
                lang = _one_line(d.get("lang")).replace("`", "")
                parts.append(f"```{lang}\n{code}\n```")
        elif t == "separator":
            parts.append("---")

    for b in blocks or []:
        if isinstance(b, dict):
            emit(b)
    return "\n\n".join(parts).strip() + ("\n" if parts else ""), counts

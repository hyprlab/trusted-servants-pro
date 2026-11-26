# SPDX-License-Identifier: AGPL-3.0-or-later
"""Per-device block settings.

A block may carry ``data["responsive"] = {"tablet": {...}, "phone": {...}}``:
setting keys whose value differs on a tablet or a phone. The page
builder writes them (static/js/responsive.js); nothing here knows what
any key means.

Rendering is generic. A block with overrides is rendered once as usual
and again with each device's values merged in. The inline styles of its
own elements are compared, and every declaration that differs becomes a
rule in a media query, scoped to that element by a ``data-rs`` attribute
and marked ``!important`` so it beats the inline style. Child blocks are
rendered as empty stubs in those extra passes and are skipped in the
comparison: they handle their own overrides.

What can't be expressed as CSS (a different class, attribute, text or
element) is left as it is on desktop. In the editor's preview a comment
names the keys that did that, so the builder can say so.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser

from flask import g
from markupsafe import Markup

# Widest viewport each device applies to. Phone keeps the 720px the
# older mobile-only fields (container padding, hero height) use.
BREAKPOINTS = (("tablet", 1024), ("phone", 720))
DEVICES = tuple(name for name, _ in BREAKPOINTS)

STUB_TYPE = "__rs_stub"
_MARKER_RE = re.compile(r"<!--rs:[^>]*?-->|<!--/rs-->")
_SAFE_ID_RE = re.compile(r"[^A-Za-z0-9_-]")


def overrides(block):
    """The block's non-empty per-device layers, or None."""
    if not isinstance(block, dict):
        return None
    d = block.get("data")
    if not isinstance(d, dict):
        return None
    r = d.get("responsive")
    if not isinstance(r, dict):
        return None
    out = {dev: dict(r[dev]) for dev in DEVICES
           if isinstance(r.get(dev), dict) and r[dev]}
    return out or None


def _variant(block, layers):
    """A copy of the block with `layers` merged over its data, the
    responsive map removed and every child replaced by a stub."""
    d = {k: v for k, v in (block.get("data") or {}).items() if k != "responsive"}
    for layer in layers:
        d.update(layer)
    kids = d.get("blocks")
    if isinstance(kids, list):
        d["blocks"] = [{"id": (c or {}).get("id"), "type": STUB_TYPE,
                        "data": (c or {}).get("data") or {}}
                       for c in kids if isinstance(c, dict)]
    return {"id": block.get("id"), "type": block.get("type"), "data": d}


def plan(block, preview=False):
    """What to render for a block with overrides: a dict with
    ``variants`` (blocks to render) and ``labels`` naming each, or None
    when the block has none. The first two variants are the desktop
    values twice, so values that change from one render to the next
    (random positions) are recognised and left alone. In the editor's
    preview, ``singles`` adds one variant per overridden key."""
    ov = overrides(block)
    if not ov:
        return None
    variants = [_variant(block, []), _variant(block, [])]
    labels = ["base", "base"]
    layers = []
    for dev in DEVICES:
        if dev in ov:
            layers.append(ov[dev])
            variants.append(_variant(block, list(layers)))
            labels.append(dev)
    out = {"variants": variants, "labels": labels, "overrides": ov}
    if preview:
        singles = []
        layers = []
        for dev in DEVICES:
            if dev not in ov:
                continue
            for key, val in ov[dev].items():
                singles.append((dev, key, _variant(block, list(layers) + [{key: val}])))
            layers.append(ov[dev])
        out["singles"] = singles
    return out


# ── Render-time state ─────────────────────────────────────────────
# Children mark their output while an ancestor is being compared.
def enter():
    g._rs_depth = getattr(g, "_rs_depth", 0) + 1
    return ""


def leave():
    g._rs_depth = max(0, getattr(g, "_rs_depth", 0) - 1)
    return ""


def marking():
    return getattr(g, "_rs_depth", 0) > 0


# ── Parsing ───────────────────────────────────────────────────────
class _Own(HTMLParser):
    """The block's own elements, in order, skipping child blocks."""

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.html = html
        self.line_starts = [0]
        for m in re.finditer("\n", html):
            self.line_starts.append(m.end())
        self.skip = 0
        self.elems = []   # (offset, tag, attrs dict, raw tag text)
        self.text = []
        self.feed(html)
        self.close()

    def _offset(self):
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def handle_comment(self, data):
        if data.startswith("rs:"):
            self.skip += 1
        elif data == "/rs" and self.skip:
            self.skip -= 1

    def handle_starttag(self, tag, attrs):
        if self.skip:
            return
        self.elems.append((self._offset(), tag, dict(attrs), self.get_starttag_text() or ""))

    handle_startendtag = handle_starttag

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.text.append(" ".join(data.split()))


def _decls(style):
    """Inline style text → ordered {property: value}."""
    out = {}
    if not style:
        return out
    buf, depth, quote = [], 0, None
    parts = []
    for ch in style:
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif ch == ";" and depth == 0:
            parts.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    parts.append("".join(buf))
    for p in parts:
        if ":" not in p:
            continue
        prop, val = p.split(":", 1)
        prop, val = prop.strip().lower(), val.strip()
        if prop and val:
            out[prop] = val
    return out


def _shape(parsed):
    return [tag for _, tag, _, _ in parsed.elems]


def _other_attrs(attrs):
    return {k: v for k, v in attrs.items() if k not in ("style", "class", "data-rs")}


def _non_style_diff(a, b):
    """True when b differs from a in anything a stylesheet can't set."""
    if _shape(a) != _shape(b) or a.text != b.text:
        return True
    for (_, _, x, _), (_, _, y, _) in zip(a.elems, b.elems):
        if (x.get("class") or "").split() != (y.get("class") or "").split():
            return True
        if _other_attrs(x) != _other_attrs(y):
            return True
    return False


def _style_diff(old, new, unstable):
    """Declarations of each element in `new` that differ from `old`:
    {index: {prop: value}}; a property `new` drops is unset."""
    out = {}
    for i, ((_, _, x, _), (_, _, y, _)) in enumerate(zip(old.elems, new.elems)):
        a, b = _decls(x.get("style")), _decls(y.get("style"))
        changed = {}
        for prop, val in b.items():
            if a.get(prop) != val and (i, prop) not in unstable:
                changed[prop] = val
        for prop in a:
            if prop not in b and (i, prop) not in unstable:
                changed[prop] = "initial" if prop.startswith("--") else "unset"
        if changed:
            out[i] = changed
    return out


def _safe_value(v):
    return "<" not in v and "{" not in v and "}" not in v


def apply(block, pl, deep, rendered, singles=None, preview=False):
    """The block's normal output with the per-device CSS added.

    `deep` is the block rendered as usual (children included);
    `rendered` the plan's variants rendered, in order. Anything
    unexpected returns `deep` unchanged."""
    deep = str(deep)
    try:
        bid = _SAFE_ID_RE.sub("", str(block.get("id") or "")) or "b"
        main = _Own(deep)
        parsed = [_Own(str(h)) for h in rendered]
        base, base2 = parsed[0], parsed[1]
        if _shape(base) != _shape(main) or _shape(base2) != _shape(base):
            return Markup(_MARKER_RE.sub("", deep))
        unstable = set()
        for i, ((_, _, x, _), (_, _, y, _)) in enumerate(zip(base.elems, base2.elems)):
            a, b = _decls(x.get("style")), _decls(y.get("style"))
            for prop in set(a) | set(b):
                if a.get(prop) != b.get(prop):
                    unstable.add((i, prop))
        rules = []        # (device, index, {prop: value})
        used = set()
        prev = base
        skipped = {}
        for label, p in zip(pl["labels"][2:], parsed[2:]):
            if _shape(p) != _shape(base):
                skipped.setdefault(label, set()).add("*")
                continue
            if _non_style_diff(base, p):
                skipped.setdefault(label, set()).add("*")
            for i, decls in _style_diff(prev, p, unstable).items():
                decls = {k: v for k, v in decls.items() if _safe_value(v)}
                if decls:
                    rules.append((label, i, decls))
                    used.add(i)
            prev = p
        # Which keys did the unexpressible part, by rendering each alone.
        if singles and any(skipped.values()):
            named = {}
            for (dev, key, _), h in zip(pl.get("singles") or [], singles):
                if dev not in skipped:
                    continue
                if _non_style_diff(base, _Own(str(h))):
                    named.setdefault(dev, []).append(key)
            skipped = {dev: named.get(dev, []) for dev in skipped}
        out = deep
        # Mark the elements the rules address, from the end so earlier
        # offsets stay put.
        for i in sorted(used, reverse=True):
            off, tag, _, raw = main.elems[i]
            at = off + 1 + len(tag)
            if deep[off:at].lower() != "<" + tag:
                return Markup(_MARKER_RE.sub("", deep))
            out = out[:at] + ' data-rs="%s.%d"' % (bid, i) + out[at:]
        out = _MARKER_RE.sub("", out)
        css = []
        for name, width in BREAKPOINTS:
            body = []
            for label, i, decls in rules:
                if label != name:
                    continue
                inner = "; ".join("%s: %s !important" % (k, v) for k, v in decls.items())
                body.append('[data-rs="%s.%d"]{%s}' % (bid, i, inner))
            if body:
                css.append("@media (max-width: %dpx){%s}" % (width, "".join(body)))
        if css:
            out = '<style data-rs-css="%s">%s</style>' % (bid, "".join(css)) + out
        if preview and skipped:
            for dev, keys in skipped.items():
                keys = [k for k in keys if k != "*"] or ["*"]
                out = "<!--rs-skip:%s:%s:%s-->" % (bid, dev, ",".join(sorted(keys))) + out
        return Markup(out)
    except Exception:
        return Markup(_MARKER_RE.sub("", deep))


def register(app):
    app.jinja_env.globals.update(
        rs_plan=plan, rs_enter=enter, rs_leave=leave, rs_marking=marking,
        rs_apply=apply, rs_stub_type=STUB_TYPE,
    )

# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read the Web Frontend admin's HTML forms the way a browser does.

The MCP server (``app/mcp.py``) changes the web frontend only by posting
the admin's own forms, so an agent's change is exactly one a person could
have made, and shows up in the same screens afterwards. This module turns
a rendered admin screen into a description of its forms (fields, labels,
current values, choices), and builds the POST body a browser would send
for one of them with some fields changed.

Browser rules followed: unchecked boxes and radios are not sent, a select
sends its selected option (else its first), disabled fields and anything
inside a ``<template>`` are not sent, and a field with ``form="id"`` belongs
to that form wherever it sits.
"""
import json
import re

from bs4 import BeautifulSoup, NavigableString, Tag

_FIELD_TAGS = ("input", "select", "textarea", "button")
_SKIP_INPUT_TYPES = {"image", "reset", "button"}
_HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "legend"}
_WS = re.compile(r"\s+")


def _text(el, limit=160):
    if el is None:
        return ""
    if isinstance(el, NavigableString):
        s = str(el)
    else:
        s = el.get_text(" ", strip=True)
    s = _WS.sub(" ", s).strip()
    return s[:limit]


def _heading_text(h):
    """A heading's own words, without the help-chip popover inside it."""
    parts = []
    for child in h.children:
        if isinstance(child, NavigableString):
            parts.append(str(child))
        elif isinstance(child, Tag) and not any(
                "chip" in c or "help" in c for c in (child.get("class") or [])):
            if child.name not in ("button", "template", "script", "svg"):
                parts.append(child.get_text(" "))
    return _WS.sub(" ", " ".join(parts)).strip()[:120]


def _in_template(el):
    return any(p.name == "template" for p in el.parents)


def _is_disabled(el):
    if el.has_attr("disabled"):
        return True
    for p in el.parents:
        if p.name == "fieldset" and p.has_attr("disabled"):
            return True
    return False


def resolve_action(form, screen_path):
    """The path a form posts to, with no host. Empty means the screen."""
    action = (form.get("action") or "").strip()
    if not action:
        return screen_path.split("?")[0]
    action = re.sub(r"^https?://[^/]+", "", action)
    return action


class Screen:
    """One parsed admin screen."""

    def __init__(self, html, path):
        self.path = path
        self.soup = BeautifulSoup(html, "html.parser")
        self._labels_for = {}
        for lab in self.soup.find_all("label"):
            if lab.get("for"):
                self._labels_for.setdefault(lab["for"], lab)

    # ── Page-level reading ─────────────────────────────────────────────
    def title(self):
        h = self.soup.find("h1")
        t = _heading_text(h) if h else ""
        if not t and self.soup.title:
            t = _text(self.soup.title, 120)
        return t

    def main(self):
        return self.soup.select_one(".fe-admin-main") or self.soup.body or self.soup

    def flashes(self):
        out = []
        for el in self.soup.select(".flashes .flash"):
            cat = next((c[6:] for c in (el.get("class") or [])
                        if c.startswith("flash-")), "info")
            msg = _text(el, 400)
            if msg:
                out.append({"category": cat, "message": msg})
        return out

    def text(self, limit=6000):
        """The visible words of the screen's main column: tables, lists and
        status lines an agent needs to see what exists."""
        main = self.main()
        frag = BeautifulSoup(str(main), "html.parser")
        for bad in frag.find_all(["script", "style", "template", "svg",
                                  "select", "textarea", "noscript"]):
            bad.decompose()
        for bad in frag.select(".fe-subnav, .help-chip, .chip-pop, [hidden]"):
            bad.decompose()
        for inline in frag.find_all(["a", "b", "strong", "em", "i", "span", "code", "small", "mark"]):
            inline.unwrap()
        frag = BeautifulSoup(str(frag), "html.parser")
        lines = []
        for line in frag.get_text("\n").splitlines():
            line = _WS.sub(" ", line).strip()
            if line and (not lines or lines[-1] != line):
                lines.append(line)
        s = "\n".join(lines)
        return s if len(s) <= limit else s[:limit] + "\n…(cut)"

    def links(self, allowed):
        """Other admin screens this one links to (deduplicated)."""
        seen, out = set(), []
        for a in self.soup.find_all("a", href=True):
            href = re.sub(r"^https?://[^/]+", "", a["href"].split("#")[0])
            if not href or href in seen or not allowed(href):
                continue
            seen.add(href)
            label = _text(a, 80) or a.get("title") or a.get("aria-label") or ""
            out.append({"path": href, "label": label})
        return out

    def megamenu_blocks(self):
        """Mega-menu blocks on the Header screen: their inputs carry
        ``data-block-field`` instead of a name (saved as JSON by the page),
        so they are read here and edited with an action."""
        out = []
        for li in self.soup.select("[data-item-id][data-block-kind]"):
            fields = {}
            for el in li.select("[data-block-field]"):
                key = el["data-block-field"]
                if el.name == "input" and (el.get("type") or "").lower() == "checkbox":
                    fields[key] = el.has_attr("checked")
                elif el.name == "select":
                    opt = el.find("option", selected=True) or el.find("option")
                    fields[key] = opt.get("value", _text(opt)) if opt else ""
                elif el.name == "textarea":
                    fields[key] = el.get_text()
                else:
                    fields[key] = el.get("value", "")
            col = li.find_parent("article", class_="nav-megacol")
            col_id = col.get("data-item-id", "") if col else ""
            out.append({"link_id": int(li["data-item-id"]) if li["data-item-id"].isdigit() else li["data-item-id"],
                        "kind": li["data-block-kind"],
                        "column_id": int(col_id) if col_id.isdigit() else None,
                        "fields": fields})
        return out

    # ── Forms ──────────────────────────────────────────────────────────
    def forms(self, allowed_action):
        """Every form on the screen that posts somewhere the caller allows,
        as ``ScreenForm`` objects keyed so the same screen gives the same
        keys each time it is read."""
        found = []
        for f in self.soup.find_all("form"):
            if _in_template(f):
                continue
            action = resolve_action(f, self.path)
            if not allowed_action(action):
                continue
            found.append(ScreenForm(self, f, action))
        counts = {}
        ids = [sf.dom_id for sf in found if sf.dom_id]
        for sf in found:
            if sf.dom_id and ids.count(sf.dom_id) == 1:
                sf.key = sf.dom_id
                continue
            n = counts.get(sf.action, 0) + 1
            counts[sf.action] = n
            sf.key = sf.action if n == 1 else f"{sf.action}#{n}"
        return found

    def find_form(self, allowed_action, key):
        forms = self.forms(allowed_action)
        for sf in forms:
            if sf.key == key:
                return sf, forms
        # Accept an action path or DOM id even when the key says otherwise.
        for sf in forms:
            if key in (sf.dom_id, sf.action):
                return sf, forms
        return None, forms


class ScreenForm:
    def __init__(self, screen, form, action):
        self.screen = screen
        self.form = form
        self.action = action
        self.dom_id = form.get("id") or None
        self.key = None
        self.method = (form.get("method") or "get").lower()
        self.enctype = (form.get("enctype") or "").lower()
        self._elements = None

    def elements(self):
        """Fields in document order, as a browser would collect them."""
        if self._elements is not None:
            return self._elements
        els = []
        for el in self.form.find_all(_FIELD_TAGS):
            if el.get("form") and el.get("form") != self.dom_id:
                continue
            els.append(el)
        if self.dom_id:
            for el in self.screen.soup.find_all(_FIELD_TAGS, attrs={"form": self.dom_id}):
                if el not in els:
                    els.append(el)
        keep = []
        for el in els:
            if not el.get("name") or _in_template(el) or _is_disabled(el):
                continue
            t = (el.get("type") or "").lower()
            if el.name == "input" and t in _SKIP_INPUT_TYPES:
                continue
            if el.name == "button" and t not in ("", "submit"):
                continue
            keep.append(el)
        self._elements = keep
        return keep

    # Labels and hints ------------------------------------------------------
    def _label(self, el):
        if el.get("aria-label"):
            return _WS.sub(" ", el["aria-label"]).strip()[:160]
        if el.get("id") and el["id"] in self.screen._labels_for:
            return _text(self.screen._labels_for[el["id"]])
        lab = el.find_parent("label")
        if lab is not None:
            parts = []
            for d in lab.descendants:
                if isinstance(d, NavigableString) and not any(
                        p.name in ("select", "option", "textarea", "script", "button")
                        for p in d.parents if p is not lab and p in lab.descendants):
                    parts.append(str(d))
            s = _WS.sub(" ", " ".join(parts)).strip()
            if s:
                return s[:160]
        ctl = el.find_parent(attrs={"data-key": True})
        if ctl is not None:
            row = ctl.find_parent(class_=re.compile(r"\bds-row\b")) or ctl
            lab = row.select_one(".ds-label") or ctl.select_one(".ds-label")
            if lab is not None:
                return _text(lab)
        prev = el.find_previous_sibling(["label", "span", "b", "strong"])
        if prev is not None and _text(prev):
            return _text(prev)
        return (el.get("placeholder") or el.get("title") or "")[:160]

    def _hints(self, el):
        """Choices and defaults the page's widgets carry in data attributes
        (segmented buttons, stepped sliders) for fields that are plain
        hidden inputs underneath."""
        hints = {}
        node = el
        for _ in range(3):
            node = node.parent
            if node is None or not isinstance(node, Tag):
                break
            if node.has_attr("data-kind") or node.has_attr("data-default"):
                if node.get("data-kind"):
                    hints["widget"] = node["data-kind"]
                if node.has_attr("data-default"):
                    hints["default"] = node["data-default"]
                if node.get("data-unit"):
                    hints["unit"] = node["data-unit"]
                if node.get("data-stops"):
                    try:
                        hints["choices"] = json.loads(node["data-stops"])
                    except ValueError:
                        pass
                break
        if el.name == "input" and (el.get("type") or "").lower() == "hidden":
            group = None
            parent = el.parent
            if isinstance(parent, Tag):
                group = parent.find(attrs={"role": "radiogroup"})
            if group is not None:
                opts = [{"value": b.get("data-value", ""), "label": _text(b, 60)}
                        for b in group.find_all(attrs={"data-value": True})]
                if opts:
                    hints["choices"] = opts
        return hints

    def _section(self):
        """Map each element to the last heading above it inside the form."""
        mapping, current = {}, ""
        want = {id(e) for e in self.elements()}
        for node in self.form.descendants:
            if not isinstance(node, Tag):
                continue
            if node.name in _HEADING_TAGS:
                t = _heading_text(node)
                if t:
                    current = t
            elif id(node) in want:
                mapping[id(node)] = current
        return mapping

    # Describing ------------------------------------------------------------
    def describe(self, include_values=True, prefill=None):
        """A JSON-ready description of the form's fields, grouped by name."""
        sections = self._section()
        fields, by_name, buttons = [], {}, []
        for el in self.elements():
            name = el["name"]
            if name == "csrf_token":
                continue  # added on submit
            t = (el.get("type") or ("textarea" if el.name == "textarea" else
                                    "select" if el.name == "select" else "text")).lower()
            if el.name == "button" or (el.name == "input" and t == "submit"):
                buttons.append({"name": name, "value": el.get("value", ""),
                                "label": _text(el, 80) or el.get("value", "")})
                continue
            if el.name == "select":
                t = "select"
            if el.name == "textarea":
                t = "textarea"
            entry = by_name.get(name)
            if entry is None:
                entry = {"name": name, "type": t}
                label = self._label(el)
                if label:
                    entry["label"] = label
                sec = sections.get(id(el))
                if sec:
                    entry["section"] = sec
                hints = self._hints(el)
                entry.update(hints)
                by_name[name] = entry
                fields.append(entry)
                entry["_els"] = []
            entry["_els"].append(el)

        out = []
        for entry in fields:
            els = entry.pop("_els")
            t = entry["type"]
            if t == "radio":
                entry["choices"] = [{"value": e.get("value", "on"),
                                     "label": self._label(e) or e.get("value", "on")}
                                    for e in els]
                entry.pop("label", None)
                checked = [e.get("value", "on") for e in els if e.has_attr("checked")]
                if include_values:
                    entry["value"] = checked[0] if checked else None
            elif t == "checkbox":
                if len(els) == 1:
                    e = els[0]
                    entry["on_value"] = e.get("value", "on")
                    if e.has_attr("hidden"):
                        entry["managed"] = True
                    if include_values:
                        entry["value"] = e.has_attr("checked")
                else:
                    entry["type"] = "checkbox_group"
                    entry["choices"] = [{"value": e.get("value", "on"),
                                         "label": self._label(e) or e.get("value", "on")}
                                        for e in els]
                    if include_values:
                        entry["value"] = [e.get("value", "on") for e in els if e.has_attr("checked")]
            elif t == "select":
                e = els[0]
                opts = e.find_all("option")
                entry["choices"] = [{"value": o.get("value", _text(o)), "label": _text(o, 80)}
                                    for o in opts]
                if e.has_attr("multiple"):
                    entry["multiple"] = True
                if include_values:
                    vals = [_select_value(x) for x in els]
                    entry["value"] = vals[0] if len(vals) == 1 else vals
                    if len(vals) > 1:
                        entry["repeated"] = True
            elif t == "file":
                accept = els[0].get("accept")
                if accept:
                    entry["accept"] = accept
            else:
                vals = [_plain_value(e) for e in els]
                if len(vals) > 1:
                    entry["repeated"] = True
                if include_values:
                    entry["value"] = vals[0] if len(vals) == 1 else vals
                ml = els[0].get("maxlength")
                if ml:
                    entry["maxlength"] = ml
            if els[0].has_attr("required"):
                entry["required"] = True
            if prefill and entry["name"] in prefill and include_values:
                entry["value"] = prefill[entry["name"]]
                entry["note"] = "Filled from saved settings: the page fills it in the browser."
            out.append(entry)
        named = {e["name"] for e in out}
        for name, val in (prefill or {}).items():
            if name not in named and include_values:
                out.append({"name": name, "type": "hidden", "value": val,
                            "note": "Drawn by the page's script; filled from saved settings."})
        d = {"form": self.key, "action": self.action, "method": self.method}
        if self.enctype == "multipart/form-data":
            d["accepts_files"] = True
        if buttons:
            d["buttons"] = buttons
        d["fields"] = out
        return d

    # Submitting ------------------------------------------------------------
    def current_pairs(self, button=None):
        """``[(name, value), ...]`` a browser would send right now, plus
        the description of each file input (sent only when given)."""
        pairs, file_names = [], set()
        for el in self.elements():
            name = el["name"]
            t = (el.get("type") or "").lower()
            if el.name == "button" or (el.name == "input" and t == "submit"):
                if button is not None and name == button.get("name") and \
                        el.get("value", "") == button.get("value", el.get("value", "")):
                    pairs.append((name, el.get("value", "")))
                continue
            if el.name == "select":
                if el.has_attr("multiple"):
                    for o in el.find_all("option"):
                        if o.has_attr("selected"):
                            pairs.append((name, o.get("value", _text(o))))
                else:
                    pairs.append((name, _select_value(el)))
            elif el.name == "textarea":
                pairs.append((name, _plain_value(el)))
            elif t in ("checkbox", "radio"):
                if el.has_attr("checked"):
                    pairs.append((name, el.get("value", "on")))
            elif t == "file":
                file_names.add(name)
            else:
                pairs.append((name, _plain_value(el)))
        return pairs, file_names


def _select_value(el):
    opts = el.find_all("option")
    sel = next((o for o in opts if o.has_attr("selected")), None) or (opts[0] if opts else None)
    if sel is None:
        return ""
    return sel.get("value", _text(sel))


def _plain_value(el):
    if el.name == "textarea":
        s = el.get_text()
        return s[1:] if s.startswith("\n") else s
    return el.get("value", "")


class FieldError(ValueError):
    pass


def build_payload(sf, changes, remove=(), button=None, prefill=None):
    """Return ``(pairs, notes)``: the POST body for ``sf`` with ``changes``
    applied the way a person editing the form would apply them, and notes
    on anything done on their behalf.

    ``changes`` maps a field name to its new value: a bool for a single
    checkbox, a list for a checkbox group, a repeated field or a multiple
    select, a dict or list for a JSON field (encoded here), else a string.
    A name the form doesn't have is added at the end, as the page's own
    scripts do when a row is added. ``None`` clears a field (and unticks a
    hidden ``<name>_enabled`` box, the design screen's reset)."""
    desc = {f["name"]: f for f in sf.describe(include_values=False)["fields"]}
    pairs, _files = sf.current_pairs(button=button)
    notes = []
    if prefill:
        for name, val in prefill.items():
            if name in changes:
                continue
            idx = [i for i, (n, _) in enumerate(pairs) if n == name]
            if not idx:
                pairs.append((name, val))
            elif pairs[idx[0]][1] == "":
                pairs[idx[0]] = (name, val)

    def _set_single(name, value):
        idx = [i for i, (n, _) in enumerate(pairs) if n == name]
        if idx:
            pairs[idx[0]] = (name, value)
            for i in reversed(idx[1:]):
                del pairs[i]
        else:
            pairs.append((name, value))

    def _drop(name):
        pairs[:] = [(n, v) for (n, v) in pairs if n != name]

    def _set_multi(name, values):
        idx = [i for i, (n, _) in enumerate(pairs) if n == name]
        at = idx[0] if idx else len(pairs)
        _drop(name)
        for k, v in enumerate(values):
            pairs.insert(at + k, (name, v))

    for name, value in changes.items():
        f = desc.get(name)
        t = f["type"] if f else None
        repeated = (f or {}).get("repeated") or (f is None and name.endswith("[]"))
        if isinstance(value, dict) or (isinstance(value, list) and not repeated
                                       and t in (None, "hidden", "text", "textarea")):
            value = json.dumps(value)
        if t == "checkbox":
            on = value if isinstance(value, bool) else str(value).lower() in (
                "1", "true", "on", "yes", str(f.get("on_value", "on")).lower())
            if value is None:
                on = False
            _drop(name)
            if on:
                _set_single(name, f.get("on_value", "on"))
        elif t == "checkbox_group":
            vals = value if isinstance(value, list) else ([] if value is None else [value])
            allowed = {c["value"] for c in f["choices"]}
            bad = [v for v in vals if str(v) not in allowed]
            if bad:
                raise FieldError(f"{name}: {bad!r} not among its choices {sorted(allowed)!r}")
            _set_multi(name, [str(v) for v in vals])
        elif t in ("radio", "select"):
            vals = value if isinstance(value, list) else [value]
            allowed = [c["value"] for c in f.get("choices", [])]
            for v in vals:
                if v is None and t == "radio":
                    continue
                if str(v) not in allowed:
                    shown = allowed if len(allowed) <= 40 else allowed[:40] + ["…"]
                    raise FieldError(f"{name}: {v!r} is not one of the choices the screen offers: {shown!r}")
            if t == "radio":
                _drop(name)
                if vals and vals[0] is not None:
                    _set_single(name, str(vals[0]))
            elif f.get("multiple") or f.get("repeated"):
                _set_multi(name, [str(v) for v in vals])
            else:
                _set_single(name, str(vals[0]))
        elif t == "file":
            raise FieldError(f"{name} is a file input: pass the file in `files`")
        else:
            if value is None:
                value = ""
            if isinstance(value, list):
                _set_multi(name, ["" if v is None else str(v) for v in value])
            else:
                if isinstance(value, bool):
                    value = "1" if value else ""
                _set_single(name, str(value))
            if f is None:
                notes.append(f"{name} is not on the form; sent as an added field")
        # The design screen keeps a hidden "<name>_enabled" box beside a value
        # and ticks it when the value is edited (untick = theme default).
        partner = desc.get(f"{name}_enabled")
        if partner and partner.get("managed") and f"{name}_enabled" not in changes:
            _drop(f"{name}_enabled")
            if value not in (None, ""):
                _set_single(f"{name}_enabled", partner.get("on_value", "1"))
                notes.append(f"ticked {name}_enabled, as the screen does when {name} is edited")
            else:
                notes.append(f"unticked {name}_enabled: {name} goes back to the theme default")
    for name in remove or ():
        _drop(name)
    return pairs, notes

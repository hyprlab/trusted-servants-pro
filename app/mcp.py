# SPDX-License-Identifier: AGPL-3.0-or-later
"""Built-in MCP server: lets an AI agent change the web frontend.

Endpoint ``/tspro/mcp`` speaks the Model Context Protocol's Streamable
HTTP transport (JSON-RPC 2.0 over POST, plain JSON replies, no stream).
An agent signs in with a token made under Web Frontend → Agent access,
and acts as the admin who made it.

The rule this module keeps: an agent changes nothing a person couldn't
change, and nothing a person can't see and undo. So there is no separate
write path. Every tool that changes something posts one of the Web
Frontend admin's own forms (or one of the requests its scripts send) to
the admin's own route, inside the app, signed in as the token's admin.
The routes validate, save, keep page revisions and redirect exactly as
they do for a click; the result shows in the same screens straight away,
and each change is written to the activity log under the admin's name
with the token's label (Watchtower → User log, and Agent access).
"""
import base64
import hashlib
import io
import json
import os
import re
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request, url_for
from werkzeug.datastructures import MultiDict

from . import activity, db
from .mcp_forms import FieldError, Screen, build_payload
from .models import McpToken, SiteSetting
from .version import __version__

bp = Blueprint("mcp", __name__)

MCP_PATH = "/tspro/mcp"
PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
ADMIN_PREFIX = "/tspro/frontend"

# Under /tspro/frontend but not for agents.
DENIED_PREFIXES = (
    "/tspro/frontend/mcp",                     # tokens: never minted by an agent
    "/tspro/frontend/forms/submissions",       # what visitors sent: personal data
    "/tspro/frontend/module-toggle",           # turns the module, and this server, off
    "/tspro/frontend/autohide-sidebar-save",   # one admin's own sidebar preference
    "/tspro/frontend/customize",               # one admin's own overview widgets
    "/tspro/frontend/order",                   # the same, their order
    "/tspro/frontend/preview",                 # the live-preview renderer
    "/tspro/frontend/metrics",                 # visitor statistics
    "/tspro/frontend/api/",
)
_DELETE_RE = re.compile(r"/(delete|bulk-delete)$|^/tspro/frontend/design/reset$")
_LAST_USED_THROTTLE = timedelta(seconds=60)
_MAX_REDIRECTS = 4


def allowed_path(path):
    p = (path or "").split("?")[0].split("#")[0]
    if not (p == ADMIN_PREFIX or p.startswith(ADMIN_PREFIX + "/")):
        return False
    return not any(p == d.rstrip("/") or p.startswith(d) for d in DENIED_PREFIXES)


def is_delete(path):
    return bool(_DELETE_RE.search((path or "").split("?")[0]))


class ToolError(Exception):
    pass


# ── Signing in as the token's admin, inside the app ─────────────────────────

class AdminSession:
    """A test client inside the running app, signed in as the token's admin,
    that sends requests the way that admin's browser would."""

    def __init__(self, token, user):
        self.token = token
        self.user = user
        self.base = "https://" + request.host
        self.client = current_app.test_client()
        self.client.environ_base.update({
            "REMOTE_ADDR": request.remote_addr or "127.0.0.1",
            "HTTP_USER_AGENT": "tspro-mcp/" + __version__,
            "tspro.mcp_token_id": token.id,
        })
        from itsdangerous import URLSafeTimedSerializer
        raw = hashlib.sha1(os.urandom(64)).hexdigest()
        with self.client.session_transaction(base_url=self.base) as sess:
            sess["_user_id"] = str(user.id)
            sess["_fresh"] = False
            sess["csrf_token"] = raw
        secret = current_app.config.get("WTF_CSRF_SECRET_KEY") or current_app.secret_key
        self.csrf = URLSafeTimedSerializer(secret, salt="wtf-csrf-token").dumps(raw)

    def _pop_flashes(self):
        with self.client.session_transaction(base_url=self.base) as sess:
            raw = sess.pop("_flashes", [])
        return [{"category": c, "message": str(m)} for c, m in raw]

    def get(self, path):
        """GET an admin path, following redirects that stay inside the
        allowed area. Returns ``(final_path, response)``."""
        for _ in range(_MAX_REDIRECTS):
            if not allowed_path(path):
                raise ToolError(f"{path} is outside what agents may open "
                                f"(the Web Frontend admin under {ADMIN_PREFIX}).")
            resp = self.client.get(path, base_url=self.base)
            if resp.status_code in (301, 302, 303, 307, 308):
                loc = _strip_host(resp.headers.get("Location", ""))
                if not allowed_path(loc):
                    flashes = self._pop_flashes()
                    msg = "; ".join(f["message"] for f in flashes) or f"redirected to {loc}"
                    raise ToolError(f"{path} could not be opened: {msg}")
                path = loc
                continue
            return path, resp
        raise ToolError(f"{path} redirected too many times")

    def post(self, path, pairs=None, json_body=None, files=None, referer=None):
        headers = {"X-CSRFToken": self.csrf, "Referer": self.base + (referer or path)}
        if json_body is not None:
            headers["X-Requested-With"] = "fetch"
            resp = self.client.post(path, base_url=self.base, headers=headers,
                                    data=json.dumps(json_body), content_type="application/json")
        else:
            data = MultiDict(pairs or [])
            if "csrf_token" not in data:
                data.add("csrf_token", self.csrf)
            for name, f in (files or {}).items():
                data.add(name, (io.BytesIO(f["bytes"]), f["filename"]))
            resp = self.client.post(path, base_url=self.base, headers=headers, data=data,
                                    content_type="multipart/form-data" if files else None)
        return _outcome(resp, self._pop_flashes())


def _strip_host(url):
    return re.sub(r"^https?://[^/]+", "", url or "")


def _outcome(resp, flashes):
    out = {"status": resp.status_code}
    ctype = resp.content_type or ""
    if resp.status_code in (301, 302, 303, 307, 308):
        out["redirect"] = _strip_host(resp.headers.get("Location", ""))
    elif "application/json" in ctype:
        try:
            out["response"] = resp.get_json()
        except Exception:  # noqa: BLE001
            out["response"] = resp.get_data(as_text=True)[:2000]
    elif "text/html" in ctype and resp.status_code == 200:
        flashes = flashes + Screen(resp.get_data(as_text=True), "").flashes()
    else:
        out["response"] = resp.get_data(as_text=True)[:2000]
    if flashes:
        out["messages"] = flashes
    bad = (resp.status_code >= 400
           or any(f["category"] in ("danger", "error") for f in flashes)
           or out.get("redirect", "").startswith("/tspro/auth/login")
           or (isinstance(out.get("response"), dict) and out["response"].get("ok") is False))
    out["ok"] = not bad
    return out


# ── What the agent needs beyond the forms ───────────────────────────────────

def _prefill(sf):
    """Values the admin's scripts put into hidden fields just before the
    form is sent, computed the same way here so an untouched field keeps
    what is saved instead of being sent empty."""
    out = {}
    if sf.action == "/tspro/frontend/utility-bar-save":
        s = SiteSetting.query.first()
        out["utility_left_payload"] = (s.utility_bar_left_json or "[]") if s else "[]"
        out["utility_right_payload"] = (s.utility_bar_right_json or "[]") if s else "[]"
        # Its radio list is drawn by the page's script from the items.
        out["utility_bar_mobile_default"] = (s.utility_bar_mobile_default or "") if s else ""
    order = sf.form.find(attrs={"data-field-order": True})
    if order is not None and order.get("name"):
        cards = sf.form.select("[data-field-card]")
        out[order["name"]] = ",".join(c.get("data-field-idx", "") for c in cards)
    return out


def _editor_block_types():
    """The page editor's block types, read from its own script so the two
    can't drift."""
    path = os.path.join(current_app.static_folder, "js", "block_editor.js")
    try:
        src = open(path, encoding="utf-8").read()
    except OSError:
        return [], ""
    m = re.search(r"const BLOCK_TYPES = \[(.*?)\];", src, re.S)
    types = re.findall(r"type:\s*'([a-z0-9_]+)'", m.group(1)) if m else []
    d = re.search(r"\n  function blankBlock\(type\) \{\n(.*?)\n  \}\n", src, re.S)
    return types, (d.group(1) if d else "")


def _js_literal(src):
    """Turn a plain JavaScript object literal (comments, bare keys, single
    quotes, trailing commas) into Python data."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == "/" and src[i:i + 2] == "//":
            i = src.find("\n", i)
            i = n if i < 0 else i
            continue
        if c == "/" and src[i:i + 2] == "/*":
            i = src.find("*/", i) + 2
            continue
        if c in "'\"":
            j, buf = i + 1, []
            while src[j] != c:
                if src[j] == "\\":
                    buf.append(src[j:j + 2])
                    j += 2
                    continue
                buf.append(src[j])
                j += 1
            s = "".join(buf).replace("\\'", "'")
            out.append(json.dumps(json.loads('"' + s.replace('"', '\\"') + '"')))
            i = j + 1
            continue
        out.append(c)
        i += 1
    text = "".join(out)
    text = re.sub(r"([{,]\s*)([A-Za-z_$][\w$]*)\s*:", r'\1"\2":', text)
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return json.loads(text)


_DEFAULTS_CACHE = {}


def _editor_block_defaults():
    """``{type: data}`` for a new block, from the editor's ``blankBlock``,
    so a block an agent writes carries every field the editor would give
    it (the public templates expect them all)."""
    path = os.path.join(current_app.static_folder, "js", "block_editor.js")
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return {}
    if _DEFAULTS_CACHE.get("mtime") == mtime:
        return _DEFAULTS_CACHE["data"]
    src = open(path, encoding="utf-8").read()
    data = {}
    typo = re.search(r"const TYPO_DEFAULTS = (\{.*?\});", src, re.S)
    body = re.search(r"function blankBlock\(type\) \{\s*const d = (\{.*?\n    \})\[type\]", src, re.S)
    if typo and body:
        try:
            typo_src = typo.group(1).strip()[1:-1]
            data = _js_literal(body.group(1).replace("...TYPO_DEFAULTS", typo_src))
        except (ValueError, IndexError) as e:
            current_app.logger.warning("mcp: could not read block defaults: %s", e)
            data = {}
    _DEFAULTS_CACHE.update(mtime=mtime, data=data)
    return data


def _with_defaults(default, given):
    """The editor's defaults under the given data, nested objects merged
    the same way; lists and values as given."""
    out = json.loads(json.dumps(default))
    for k, v in given.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _with_defaults(out[k], v)
        else:
            out[k] = v
    return out


def _popup_block_types():
    from .routes import _POPUP_ALLOWED_BLOCK_TYPES
    return list(_POPUP_ALLOWED_BLOCK_TYPES)


_BLOCKS_ACTIONS = {"/tspro/frontend/pages/save": "page",
                   "/tspro/frontend/popups/save": "popup"}


def _check_blocks(raw, kind, current_raw):
    """Validate ``blocks_json`` for a page or popup the way the editor would
    produce it, filling in missing ids. Returns the JSON string to send."""
    try:
        sections = json.loads(raw) if isinstance(raw, str) else raw
    except ValueError as e:
        raise FieldError(f"blocks_json is not valid JSON: {e}")
    if not isinstance(sections, list):
        raise FieldError("blocks_json must be a list of sections: "
                         '[{"id": "...", "title": "", "blocks": [...]}]')
    allowed = _editor_block_types()[0] if kind == "page" else _popup_block_types()
    allowed = set(allowed)
    try:
        current = [s for s in json.loads(current_raw or "[]") if isinstance(s, dict)]
    except ValueError:
        current = []
    old = {s.get("id"): (s.get("title") or "") for s in current}
    existing = {}

    def _index(blocks):
        for b in blocks or []:
            if isinstance(b, dict):
                existing[b.get("id")] = b.get("type")
                if b.get("type") == "container":
                    _index((b.get("data") or {}).get("blocks"))
    for sec in current:
        _index(sec.get("blocks"))
    import secrets as _secrets
    defaults = _editor_block_defaults()

    def _id():
        return _secrets.token_hex(4)

    def _walk(blocks, where):
        if not isinstance(blocks, list):
            raise FieldError(f"{where}: blocks must be a list")
        for i, b in enumerate(blocks):
            at = f"{where}[{i}]"
            if not isinstance(b, dict):
                raise FieldError(f"{at}: a block is an object with id, type and data")
            t = b.get("type")
            if t not in allowed:
                hint = (" Use a container block (data.display 'grid', data.grid_columns "
                        "'repeat(2, 1fr)') holding the column containers."
                        if t in ("split", "split3", "columns") else "")
                raise FieldError(f"{at}: block type {t!r} is not one the {kind} editor offers: "
                                 f"{sorted(allowed)}.{hint}")
            b.setdefault("id", _id())
            if not isinstance(b.get("data"), dict):
                b["data"] = {}
            # A new block gets the fields the editor gives a new block; one
            # already on the page keeps exactly what it has.
            if t in defaults and existing.get(b["id"]) != t:
                b["data"] = _with_defaults(defaults[t], b["data"])
            if t == "container":
                b["data"].setdefault("blocks", [])
                _walk(b["data"]["blocks"], f"{at}.data.blocks")

    for i, sec in enumerate(sections):
        if not isinstance(sec, dict):
            raise FieldError(f"section {i}: a section is an object with id, title and blocks")
        sec.setdefault("id", _id())
        title = sec.get("title") or ""
        if title and title != old.get(sec["id"]):
            raise FieldError(f"section {i}: section titles are not used; leave title empty and "
                             "group blocks with a container block (give it a heading block).")
        sec["title"] = title
        sec.setdefault("blocks", [])
        _walk(sec["blocks"], f"section {i}.blocks")
    return json.dumps(sections)


def _nav_link_fields(link_id):
    """A mega-menu block's saved values as the fields its edit route takes,
    so an edit that names only some fields leaves the rest as they are."""
    from .models import FrontendNavLink
    link = db.session.get(FrontendNavLink, link_id)
    if link is None:
        return {}
    b = lambda v: "1" if v else ""  # noqa: E731
    return {
        "kind": link.kind or "link", "label": link.label or "", "url": link.url or "",
        "open_in_new_tab": b(link.open_in_new_tab),
        "icon_before": link.icon_before or "", "icon_after": link.icon_after or "",
        "icon_before_color": link.icon_before_color or "",
        "icon_after_color": link.icon_after_color or "",
        "icon_before_size": "" if link.icon_before_size is None else str(link.icon_before_size),
        "icon_after_size": "" if link.icon_after_size is None else str(link.icon_after_size),
        "link_size_override": b(link.link_size_pct),
        "link_size_pct": str(link.link_size_pct or 100),
        "override_color": b(link.override_color), "custom_color": link.custom_color or "",
        "button_style": link.button_style or "pill", "form_trigger": link.form_trigger or "",
    }


# Requests the admin's scripts send that no form on a screen carries.
ACTIONS = [
    {"path": "/tspro/frontend/nav-items/reorder", "body": "json", "screen": "/tspro/frontend/header",
     "params": {"order": "list of menu item ids, in the new order"},
     "does": "Reorders the top-level menu items (Header → Menu, drag to reorder)."},
    {"path": "/tspro/frontend/nav-item/<item_id>/column/new", "body": "form",
     "screen": "/tspro/frontend/header?item=<item_id>",
     "params": {"heading": "optional"},
     "does": "Adds a mega menu column to a menu item (Add column)."},
    {"path": "/tspro/frontend/nav-item/<item_id>/columns/reorder", "body": "json",
     "screen": "/tspro/frontend/header?item=<item_id>",
     "params": {"order": "list of column ids"}, "does": "Reorders a mega menu's columns."},
    {"path": "/tspro/frontend/nav-column/<column_id>/delete", "body": "form",
     "screen": "/tspro/frontend/header?item=<item_id>", "params": {},
     "does": "Deletes a mega menu column and its blocks."},
    {"path": "/tspro/frontend/nav-column/<column_id>/link/new", "body": "form",
     "screen": "/tspro/frontend/header?item=<item_id>",
     "params": {"kind": "link | title | button | section | search | admin_login",
                "label": "text", "url": "link and button only",
                "open_in_new_tab": "'1' or ''",
                "icon_before / icon_after": "icon name or custom:<id>",
                "icon_before_color / icon_after_color": "#hex",
                "icon_before_size / icon_after_size": "12 to 64",
                "button_style": "pill | rounded",
                "link_size_override": "'1' to use link_size_pct (50 to 200)",
                "override_color": "'1' to use custom_color (#hex)",
                "form_trigger": "a form key that opens as a modal, or ''"},
     "does": "Adds a block to a mega menu column."},
    {"path": "/tspro/frontend/nav-link/<link_id>/edit", "body": "form",
     "screen": "/tspro/frontend/header?item=<item_id>",
     "params": "same fields as link/new; fields you leave out keep their saved values",
     "does": "Edits one mega menu block (read them with read_screen on the item's Header screen)."},
    {"path": "/tspro/frontend/nav-column/<column_id>/links/reorder", "body": "json",
     "screen": "/tspro/frontend/header?item=<item_id>",
     "params": {"order": "list of block (link) ids"}, "does": "Reorders a column's blocks."},
    {"path": "/tspro/frontend/nav-link/<link_id>/delete", "body": "form",
     "screen": "/tspro/frontend/header?item=<item_id>", "params": {},
     "does": "Deletes a mega menu block."},
    {"path": "/tspro/frontend/theme-save", "body": "form", "screen": "/tspro/frontend/design",
     "params": {"frontend_theme": "theme key", "restore_mode": "last | default"},
     "does": "Applies a theme. Switching keeps the old theme's look so it can be restored."},
    {"path": "/tspro/frontend/design/reset", "body": "form", "screen": "/tspro/frontend/design",
     "params": {}, "does": "Clears every design override (delete access needed)."},
    {"path": "/tspro/frontend/custom-layout/save", "body": "json", "screen": "/tspro/frontend/footer",
     "params": {"kind": "homepage | footer | page", "name": "text", "blocks": "list of layout blocks"},
     "does": "Saves a new custom layout to the layout picker."},
    {"path": "/tspro/frontend/custom-layout/<key>/update", "body": "json", "screen": "/tspro/frontend/footer",
     "params": {"name": "text", "blocks": "list"}, "does": "Replaces a custom layout's name and blocks."},
    {"path": "/tspro/frontend/custom-layout/<key>/delete", "body": "form", "screen": "/tspro/frontend/footer",
     "params": {}, "does": "Deletes a custom layout (built-in layouts can't be deleted)."},
    {"path": "/tspro/frontend/footer/customize", "body": "form", "screen": "/tspro/frontend/footer",
     "params": "the footer form's fields (use submit_form with button, or post them here)",
     "does": "Saves the footer and turns its built-in layout into an editable copy."},
    {"path": "/tspro/frontend/pages/<page_id>/status", "body": "form",
     "screen": "/tspro/frontend/pages/<page_id>/edit",
     "params": {"status": "draft | published | private"}, "does": "Changes a page's visibility."},
    {"path": "/tspro/frontend/pages/<page_id>/revisions/<revision_id>/restore", "body": "form",
     "screen": "/tspro/frontend/pages/<page_id>/edit", "params": {},
     "does": "Puts an earlier revision into the page's draft for review (list them by reading "
             "/tspro/frontend/pages/<page_id>/revisions)."},
    {"path": "/tspro/frontend/pages/<page_id>/discard-draft", "body": "form",
     "screen": "/tspro/frontend/pages/<page_id>/edit", "params": {},
     "does": "Drops a published page's unpublished draft."},
    {"path": "/tspro/frontend/popups/create", "body": "form", "screen": "/tspro/frontend/popups",
     "params": {"title": "text", "name": "optional handle (#name opens it)", "status": "enabled | disabled"},
     "does": "Creates a popup; the reply redirects to its editor."},
    {"path": "/tspro/frontend/popups/<popup_id>/delete", "body": "form", "screen": "/tspro/frontend/popups",
     "params": {}, "does": "Deletes a popup."},
    {"path": "/tspro/frontend/forms/<key>/toggle", "body": "json", "screen": "/tspro/frontend/forms",
     "params": {"enabled": "true or false"}, "does": "Turns a built-in form on or off."},
    {"path": "/tspro/frontend/forms/custom/<form_id>/toggle", "body": "json", "screen": "/tspro/frontend/forms",
     "params": {"enabled": "true or false"}, "does": "Turns a custom form on or off."},
    {"path": "/tspro/frontend/redirects/slug-history/<history_id>/save", "body": "form",
     "screen": "/tspro/frontend/redirects", "params": {"old_slug": "old address", "new_slug": "current address"},
     "does": "Edits an automatic redirect left by a renamed item."},
    {"path": "/tspro/frontend/custom-icon/upload", "body": "form", "screen": "/tspro/frontend/fonts-icons",
     "params": {"icon": "file (SVG or PNG, up to 512 KB), sent in files"},
     "does": "Adds a custom icon to the icon library (use it as custom:<id>)."},
    {"path": "/tspro/frontend/custom-icon/<icon_id>/delete", "body": "form",
     "screen": "/tspro/frontend/fonts-icons", "params": {}, "does": "Deletes a custom icon."},
    {"path": "/tspro/frontend/custom-font/<font_id>/delete", "body": "form",
     "screen": "/tspro/frontend/fonts-icons", "params": {}, "does": "Deletes a custom font."},
]


# ── Tools ───────────────────────────────────────────────────────────────────

def _site():
    return SiteSetting.query.first()


def tool_list_screens(sess, args):
    from .fe_admin_nav import _SECTIONS
    from . import page_templates as PT
    from .models import CustomForm, FrontendNavItem, Page, Popup
    s = _site()
    hp = s.homepage_page_id if s else None
    sections = []
    for group, items in _SECTIONS:
        for key, label, _icon, endpoint, _act in items:
            if key == "homepage":
                path = f"/tspro/frontend/pages/{hp}/edit" if hp else "/tspro/frontend/pages"
            elif endpoint:
                path = url_for(endpoint)
            else:
                continue
            if allowed_path(path):
                sections.append({"group": group or "", "screen": label, "path": path})
    pages = [{"id": p.id, "title": p.title, "address": "/" if p.id == hp else f"/{p.slug}",
              "status": ("private" if p.is_private else "published") if p.is_published else "draft",
              "homepage": p.id == hp, "draft_pending": bool(p.draft_json),
              "path": f"/tspro/frontend/pages/{p.id}/edit"}
             for p in Page.query.order_by(Page.title).all()]
    popups = [{"id": p.id, "title": p.title, "handle": f"#{p.name}", "enabled": bool(p.is_enabled),
               "path": f"/tspro/frontend/popups/{p.id}/edit"}
              for p in Popup.query.order_by(Popup.title).all()]
    menu = [{"id": n.id, "label": n.label, "mega_menu": bool(n.has_megamenu),
             "path": f"/tspro/frontend/header?item={n.id}"}
            for n in FrontendNavItem.query.order_by(FrontendNavItem.position).all()]
    templates = [{"group": g, "kind": k, "label": PT.KINDS[k]["label"],
                  "path": f"/tspro/frontend/templates?kind={k}"}
                 for g, keys in PT.GROUPS for k in keys]
    forms = [{"id": f.id, "title": f.title, "path": f"/tspro/frontend/forms/custom/{f.id}/edit"}
             for f in CustomForm.query.order_by(CustomForm.title).all()]
    return {
        "frontend_public": bool(s and s.frontend_enabled),
        "access": sess.token.access,
        "sections": sections, "pages": pages, "popups": popups, "menu_items": menu,
        "page_templates": templates, "custom_forms": forms,
        "how": ("read_screen a path to see its forms and current values; submit_form changes "
                "only the fields you name. list_actions covers the drag-and-drop and toggle "
                "requests no form carries. block_reference describes page and popup blocks."),
    }


def _form_summary(d):
    secs = []
    for f in d["fields"]:
        if f.get("section") and f["section"] not in secs:
            secs.append(f["section"])
    return {"form": d["form"], "action": d["action"], "fields": len(d["fields"]),
            "sections": secs[:20]}


def tool_read_screen(sess, args):
    path = _req_str(args, "path")
    final, resp = sess.get(path)
    ctype = resp.content_type or ""
    if "application/json" in ctype:
        return {"path": final, "json": resp.get_json()}
    if resp.status_code != 200 or "text/html" not in ctype:
        raise ToolError(f"{final} answered {resp.status_code}")
    screen = Screen(resp.get_data(as_text=True), final)
    out = {"path": final, "title": screen.title()}
    flashes = screen.flashes()
    if flashes:
        out["messages"] = flashes
    forms = screen.forms(allowed_path)
    want = args.get("form")
    described = []
    for sf in forms:
        if want and want not in (sf.key, sf.dom_id, sf.action):
            continue
        described.append(sf.describe(prefill=_prefill(sf)))
    if want and not described:
        raise ToolError(f"No form {want!r} on {final}. Forms: {[sf.key for sf in forms]}")
    size = len(json.dumps(described))
    if not want and size > 60000:
        out["forms"] = [_form_summary(d) for d in described]
        out["note"] = ("The forms are large: read one at a time with the form argument "
                       "(its key) to see its fields and values.")
    else:
        out["forms"] = described
    mega = screen.megamenu_blocks()
    if mega:
        out["mega_menu_blocks"] = mega
    if args.get("include_text", True):
        out["text"] = screen.text()
    out["links"] = [l for l in screen.links(allowed_path) if l["path"] != final][:80]
    return out


def _decode_files(files):
    out = {}
    for name, f in (files or {}).items():
        if not isinstance(f, dict) or "content_base64" not in f:
            raise ToolError(f"files.{name} needs filename and content_base64")
        try:
            data = base64.b64decode(f["content_base64"], validate=True)
        except (ValueError, TypeError):
            raise ToolError(f"files.{name}.content_base64 is not valid base64")
        out[name] = {"filename": os.path.basename(f.get("filename") or name), "bytes": data}
    return out


def _require(sess, action):
    if not sess.token.can_write():
        raise ToolError("This token is read only.")
    if is_delete(action) and not sess.token.can_delete():
        raise ToolError("This token may not delete. An admin can make a token with delete "
                        "access under Web Frontend → Agent access.")


def tool_submit_form(sess, args):
    path = _req_str(args, "path")
    key = _req_str(args, "form")
    changes = args.get("set") or {}
    if not isinstance(changes, dict):
        raise ToolError("set must be an object of field name to value")
    final, resp = sess.get(path)
    if resp.status_code != 200 or "text/html" not in (resp.content_type or ""):
        raise ToolError(f"{final} answered {resp.status_code}")
    screen = Screen(resp.get_data(as_text=True), final)
    sf, forms = screen.find_form(allowed_path, key)
    if sf is None:
        raise ToolError(f"No form {key!r} on {final}. Forms: {[f.key for f in forms]}")
    _require(sess, sf.action)
    if sf.method != "post":
        raise ToolError(f"Form {key!r} is a search or filter form, not a change.")
    if sf.action in _BLOCKS_ACTIONS and "blocks_json" in changes:
        current = dict(sf.current_pairs()[0]).get("blocks_json")
        changes = dict(changes)
        try:
            changes["blocks_json"] = _check_blocks(changes["blocks_json"],
                                                   _BLOCKS_ACTIONS[sf.action], current)
        except FieldError as e:
            raise ToolError(str(e))
    files = _decode_files(args.get("files"))
    accepted = {f["name"] for f in sf.describe(include_values=False)["fields"]
                if f["type"] == "file"}
    unknown = [n for n in files if n not in accepted]
    if unknown:
        raise ToolError(f"{unknown} are not file inputs on this form ({sorted(accepted)})")
    button = args.get("button")
    prefill = _prefill(sf)
    before = MultiDict(sf.current_pairs()[0])
    for name, val in prefill.items():
        if before.get(name, "") == "":
            before.setlist(name, [val])
    try:
        pairs, notes = build_payload(sf, changes, remove=args.get("remove") or (),
                                     button=button, prefill=prefill)
    except FieldError as e:
        raise ToolError(str(e))
    after = MultiDict(pairs)
    changed = sorted({n for n in set(before.keys()) | set(after.keys())
                      if n != "csrf_token" and before.getlist(n) != after.getlist(n)}
                     | set(files))
    result = sess.post(sf.action, pairs=pairs, files=files, referer=final)
    if notes:
        result["notes"] = notes
    result["changed_fields"] = changed
    _audit(sess, screen.title() or final, sf.action, changed, result)
    return result


def tool_list_actions(sess, args):
    return {"actions": ACTIONS,
            "note": ("Post these with call_action. <...> parts are ids from list_screens or "
                     "read_screen. Anything posted under /tspro/frontend goes through the same "
                     "route the admin screen uses.")}


def tool_call_action(sess, args):
    path = _req_str(args, "path")
    if not allowed_path(path):
        raise ToolError(f"{path} is outside what agents may change.")
    _require(sess, path)
    fields = args.get("fields") or {}
    body = args.get("json")
    if body is not None and fields:
        raise ToolError("Send either fields (a form post) or json, not both.")
    pairs = []
    m = re.fullmatch(r"/tspro/frontend/nav-link/(\d+)/edit", path)
    base = _nav_link_fields(int(m.group(1))) if m else {}
    merged = dict(base)
    merged.update(fields)
    for name, val in merged.items():
        vals = val if isinstance(val, list) else [val]
        for v in vals:
            if isinstance(v, bool):
                v = "1" if v else ""
            elif isinstance(v, (dict, list)):
                v = json.dumps(v)
            pairs.append((name, "" if v is None else str(v)))
    files = _decode_files(args.get("files"))
    referer = args.get("screen") or ADMIN_PREFIX + "/"
    result = sess.post(path, pairs=pairs if body is None else None,
                       json_body=body, files=files, referer=referer)
    changed = sorted(fields) if body is None else ["(json) " + ", ".join(sorted(body))
                                                    if isinstance(body, dict) else "(json)"]
    _audit(sess, path, path, changed, result)
    return result


def tool_block_reference(sess, args):
    from .routes import _PAGE_BLOCK_CATALOG
    kind = args.get("kind") or "page"
    types, defaults_src = _editor_block_types()
    allowed = types if kind == "page" else _popup_block_types()
    catalog = {c["key"]: c["desc"] for c in _PAGE_BLOCK_CATALOG}
    return {
        "kind": kind,
        "shape": ('blocks_json is a list of sections: [{"id": "a1b2c3d4", "title": "", '
                  '"blocks": [block, ...]}]. A block is {"id": "...", "type": "<type>", '
                  '"data": {...}}. A container holds child blocks in data.blocks, and is how '
                  "blocks are grouped and laid out in columns (display flex or grid). "
                  "Leave section titles empty. Missing ids are filled in."),
        "types": [{"type": t, "about": catalog.get(t, "")} for t in allowed],
        "editor_defaults_js": defaults_src,
        "how": ("Read the page's editor screen, take blocks_json from the page-edit-form, "
                "change it, and submit_form it back. On a published page send "
                "save_action 'draft' to leave the change for a person to review and publish, "
                "or 'publish' to make it live. Every save is kept in the page's History."),
    }


def tool_view_public_page(sess, args):
    path = _req_str(args, "path")
    if not path.startswith("/") or path.startswith("/tspro"):
        raise ToolError("Give a public address such as / or /about.")
    client = current_app.test_client()
    client.environ_base.update({"REMOTE_ADDR": request.remote_addr or "127.0.0.1",
                                "HTTP_USER_AGENT": "tspro-mcp/" + __version__,
                                "tspro.mcp_token_id": sess.token.id})
    resp = client.get(path, base_url=sess.base)
    out = {"path": path, "status": resp.status_code}
    if resp.status_code in (301, 302, 303, 307, 308):
        out["redirect"] = _strip_host(resp.headers.get("Location", ""))
        return out
    if "text/html" in (resp.content_type or ""):
        sc = Screen(resp.get_data(as_text=True), path)
        out["title"] = _text_of(sc.soup.title)
        body = sc.soup.select_one("main") or sc.soup.body or sc.soup
        out["text"] = Screen(str(body), path).text(limit=int(args.get("max_chars") or 8000))
    return out


def _text_of(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)) if el else ""


def tool_recent_changes(sess, args):
    from .models import ActivityLog
    limit = max(1, min(int(args.get("limit") or 20), 100))
    rows = (ActivityLog.query.filter(ActivityLog.action.like("mcp.%"))
            .order_by(ActivityLog.created_at.desc()).limit(limit).all())
    return {"changes": [{"at": r.created_at.isoformat() + "Z",
                         "by": r.user.username if r.user else None,
                         "summary": r.summary} for r in rows]}


def _audit(sess, where, action, changed, result):
    """One activity-log row per change, under the token's admin."""
    msg = "; ".join(m["message"] for m in result.get("messages", []))[:160]
    fields = ", ".join(changed)[:200]
    summary = (f"{sess.token.name}: {where} ({action})" if where != action
               else f"{sess.token.name}: {action}")
    if fields:
        summary += f", {fields}"
    if msg:
        summary += f". {msg}"
    if not result.get("ok"):
        summary += " [not saved]"
    activity.log("mcp.change" if result.get("ok") else "mcp.failed",
                 summary=summary[:500], entity_type="mcp_token",
                 entity_id=sess.token.id, user=sess.user)


def _req_str(args, name):
    v = args.get(name)
    if not isinstance(v, str) or not v.strip():
        raise ToolError(f"{name} is required")
    return v.strip()


_OBJ = {"type": "object"}
TOOLS = [
    {"name": "list_screens", "title": "List the Web Frontend screens",
     "description": ("Lists every Web Frontend admin screen, page, popup, menu item, page "
                     "template and custom form, with the path to read it. Start here."),
     "inputSchema": {"type": "object", "properties": {}},
     "annotations": {"readOnlyHint": True},
     "fn": tool_list_screens},
    {"name": "read_screen", "title": "Read an admin screen",
     "description": ("Opens a Web Frontend admin screen (a path under /tspro/frontend) as the "
                     "token's admin and returns its forms: each field's name, label, type, "
                     "choices and current value, plus the screen's visible text and links. "
                     "Pass form to read one large form."),
     "inputSchema": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string", "description": "e.g. /tspro/frontend/design"},
         "form": {"type": "string", "description": "a form key from an earlier read"},
         "include_text": {"type": "boolean", "default": True}}},
     "annotations": {"readOnlyHint": True},
     "fn": tool_read_screen},
    {"name": "submit_form", "title": "Change a screen's settings",
     "description": ("Submits one form on a Web Frontend screen with the fields in set "
                     "changed and every other field left as it is, exactly as the admin "
                     "saving that form would. Checkboxes take true or false; selects and "
                     "radios must use one of the screen's choices; JSON fields take objects "
                     "or lists. Returns the screen's own messages."),
     "inputSchema": {"type": "object", "required": ["path", "form"], "properties": {
         "path": {"type": "string", "description": "the screen the form is on"},
         "form": {"type": "string", "description": "the form's key from read_screen"},
         "set": {"type": "object", "description": "field name to new value"},
         "remove": {"type": "array", "items": {"type": "string"},
                    "description": "fields to leave out of the post, as the page does when a row is removed"},
         "files": {"type": "object", "description": "file input name to {filename, content_base64}"},
         "button": {"type": "object", "description": "a named submit button {name, value} from read_screen"}}},
     "annotations": {"destructiveHint": False},
     "fn": tool_submit_form},
    {"name": "list_actions", "title": "List drag-and-drop and toggle requests",
     "description": ("Lists the requests the admin's scripts send that no form carries: "
                     "reordering, mega menu blocks, themes, layouts, page status and "
                     "revisions, popups, form switches, custom icons."),
     "inputSchema": {"type": "object", "properties": {}},
     "annotations": {"readOnlyHint": True},
     "fn": tool_list_actions},
    {"name": "call_action", "title": "Send one admin request",
     "description": ("Posts one request from list_actions (or any Web Frontend admin route) as "
                     "the token's admin: fields for a form post, or json for a JSON post."),
     "inputSchema": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string"},
         "fields": {"type": "object"}, "json": {},
         "files": {"type": "object", "description": "name to {filename, content_base64}"},
         "screen": {"type": "string", "description": "the screen the request belongs to"}}},
     "annotations": {"destructiveHint": True},
     "fn": tool_call_action},
    {"name": "block_reference", "title": "Page and popup blocks",
     "description": ("Describes blocks_json for pages and popups: the block types the editor "
                     "offers, what each does, and the fields the editor gives a new block."),
     "inputSchema": {"type": "object", "properties": {
         "kind": {"type": "string", "enum": ["page", "popup"], "default": "page"}}},
     "annotations": {"readOnlyHint": True},
     "fn": tool_block_reference},
    {"name": "view_public_page", "title": "View a public page",
     "description": "Fetches a public page as a visitor sees it and returns its title and text.",
     "inputSchema": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string", "description": "e.g. / or /about"},
         "max_chars": {"type": "integer", "default": 8000}}},
     "annotations": {"readOnlyHint": True},
     "fn": tool_view_public_page},
    {"name": "recent_changes", "title": "Recent agent changes",
     "description": "Lists the latest changes made through this server, newest first.",
     "inputSchema": {"type": "object", "properties": {
         "limit": {"type": "integer", "default": 20, "maximum": 100}}},
     "annotations": {"readOnlyHint": True},
     "fn": tool_recent_changes},
]
_TOOLS_BY_NAME = {t["name"]: t for t in TOOLS}

INSTRUCTIONS = (
    "Trusted Servants Pro: change the public web frontend (design, branding, header and menu, "
    "footer, page templates, pages, popups, forms, 404 page, redirects, caching, cookie notice, "
    "fonts and icons). Changes go through the admin's own forms as the token's admin, so they "
    "show in the Web Frontend admin at once and a person can review or undo them there; each "
    "one is logged with this token's name. Start with list_screens, read_screen the screen, then "
    "submit_form naming only the fields to change. For a published page, prefer "
    "save_action 'draft' unless asked to publish."
)


# ── JSON-RPC over Streamable HTTP ───────────────────────────────────────────

def _rpc_error(mid, code, message, http=200):
    return jsonify({"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": message}}), http


def _auth():
    """``(token, user, None)`` or ``(None, None, response)``."""
    s = _site()
    if s is None or not s.mcp_enabled:
        return None, None, (jsonify({"error": "MCP is turned off on this site."}), 404)
    hdr = request.headers.get("Authorization", "")
    raw = hdr[7:].strip() if hdr.lower().startswith("bearer ") else ""
    tok = McpToken.query.filter_by(token_hash=McpToken.hash(raw)).first() if raw else None
    if tok is None or not tok.active:
        resp = jsonify({"error": "A valid token is required (Authorization: Bearer <token>)."})
        resp.headers["WWW-Authenticate"] = 'Bearer realm="tspro-mcp"'
        return None, None, (resp, 401)
    user = tok.user
    if user is None or getattr(user, "disabled", False) or not user.is_admin():
        return None, None, (jsonify({"error": "The token's owner is no longer an admin."}), 403)
    now = datetime.utcnow()
    if tok.last_used_at is None or now - tok.last_used_at > _LAST_USED_THROTTLE:
        tok.last_used_at = now
        tok.last_used_ip = (request.remote_addr or "")[:64]
    # Commit before any internal request: SQLite would otherwise hold this
    # read open while the admin route tries to write.
    db.session.commit()
    return tok, user, None


def _origin_ok():
    """Browsers send Origin; a page on another site must not reach this
    endpoint through the visitor's network (DNS rebinding). Agents' HTTP
    clients send none."""
    origin = request.headers.get("Origin")
    if not origin:
        return True
    return re.sub(r"^https?://", "", origin).rstrip("/") == request.host


def _handle(msg, tok, user):
    """One JSON-RPC message; returns a response dict, or None for a notification."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or "method" not in msg:
        return {"jsonrpc": "2.0", "id": msg.get("id") if isinstance(msg, dict) else None,
                "error": {"code": -32600, "message": "Invalid request"}}
    mid = msg.get("id")
    method = msg["method"]
    params = msg.get("params") or {}
    if mid is None:
        return None  # notifications (initialized, cancelled) need no reply

    def ok(result):
        return {"jsonrpc": "2.0", "id": mid, "result": result}

    if method == "initialize":
        asked = params.get("protocolVersion")
        version = asked if asked in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
        return ok({"protocolVersion": version,
                   "capabilities": {"tools": {"listChanged": False}},
                   "serverInfo": {"name": "tspro", "title": "Trusted Servants Pro",
                                  "version": __version__},
                   "instructions": INSTRUCTIONS})
    if method == "ping":
        return ok({})
    if method == "tools/list":
        return ok({"tools": [{k: v for k, v in t.items() if k != "fn"} for t in TOOLS]})
    if method == "tools/call":
        tool = _TOOLS_BY_NAME.get(params.get("name"))
        if tool is None:
            return {"jsonrpc": "2.0", "id": mid,
                    "error": {"code": -32602, "message": f"Unknown tool {params.get('name')!r}"}}
        args = params.get("arguments") or {}
        s = _site()
        try:
            if s is not None and not s.frontend_module_enabled:
                raise ToolError("The Web Frontend module is turned off (Settings → Web Frontend).")
            sess = AdminSession(tok, user)
            result = tool["fn"](sess, args)
            text, is_error = json.dumps(result, indent=1, default=str), False
        except ToolError as e:
            db.session.rollback()
            text, is_error = str(e), True
        except Exception as e:  # noqa: BLE001 — report, don't 500 the transport
            db.session.rollback()
            current_app.logger.exception("mcp tool %s failed", params.get("name"))
            text, is_error = f"The tool failed: {e.__class__.__name__}: {e}", True
        return ok({"content": [{"type": "text", "text": text}], "isError": is_error})
    return {"jsonrpc": "2.0", "id": mid,
            "error": {"code": -32601, "message": f"Method not found: {method}"}}


@bp.route(MCP_PATH, methods=["GET", "POST", "DELETE"])
def endpoint():
    if not _origin_ok():
        return jsonify({"error": "Origin not allowed"}), 403
    tok, user, err = _auth()
    if err is not None:
        return err
    if request.method != "POST":
        # No server-to-client stream and no sessions to end.
        resp = jsonify({"error": "Use POST."})
        resp.headers["Allow"] = "POST"
        return resp, 405
    body = request.get_json(silent=True)
    if body is None:
        return _rpc_error(None, -32700, "Parse error", 400)
    if isinstance(body, list):
        replies = [r for r in (_handle(m, tok, user) for m in body) if r is not None]
        return (jsonify(replies), 200) if replies else ("", 202)
    reply = _handle(body, tok, user)
    if reply is None:
        return "", 202
    return jsonify(reply)

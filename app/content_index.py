# SPDX-License-Identifier: AGPL-3.0-or-later
"""The index screens of Pages, Popups, Forms and Page templates.

Each builder returns ``[(group label, [item, ...]), ...]`` for
``frontend_content_index.html``. An item is a dict:

    href    the editor
    title   the name shown
    code    an address or handle, shown in monospace (or None)
    about   a line of plain text when there is no address (or None)
    chips   [(label, post-chip modifier)], status first
    thumb   the path the card's preview renders (``/tspro/frontend/thumb``
            takes it), or None for a placeholder
    overlays  "popups" to keep the popup open in the preview
    view    the public address to open in a new tab, or None
    off     dimmed: switched off or its module is off
    icon    placeholder icon when there is no preview
    note    placeholder text when there is no preview

The groups are the same as the editors' selector menus, so the index and
the menu list things in one order.
"""
from flask import url_for


def page_groups(site):
    from .models import Page
    hp = site.homepage_page_id if site else None

    def item(p):
        is_hp = p.id == hp
        if is_hp:
            chips = [("Homepage", "online")]
        elif not p.is_published:
            chips = [("Draft", "draft")]
        elif p.is_private:
            chips = [("Private", "private")]
        else:
            chips = [("Published", "public")]
        if p.draft_json:
            chips.append(("Unpublished changes", "pending-draft"))
        live = is_hp or p.is_published
        return {
            "href": url_for("main.frontend_page_edit", page_id=p.id),
            "title": p.title or "Untitled",
            "code": "/" if is_hp else "/" + (p.slug or ""),
            "about": None,
            "chips": chips,
            "thumb": url_for("frontend.page_preview", page_id=p.id),
            "overlays": None,
            "view": ("/" if is_hp else "/" + (p.slug or "")) if live else None,
            "off": False,
            "icon": "file-text",
            "note": "No preview yet",
        }

    pages = Page.query.order_by(Page.title.asc()).all()
    rest = [p for p in pages if p.id != hp]
    return [
        ("Homepage", [item(p) for p in pages if p.id == hp]),
        ("Published", [item(p) for p in rest if p.is_published and not p.is_private]),
        ("Private", [item(p) for p in rest if p.is_published and p.is_private]),
        ("Drafts", [item(p) for p in rest if not p.is_published]),
    ]


def popup_groups(site):
    from .models import Popup
    items = []
    for p in Popup.query.order_by(Popup.title.asc()).all():
        items.append({
            "href": url_for("main.frontend_popup_edit", popup_id=p.id),
            "title": p.title or "Untitled",
            "code": "#" + (p.name or ""),
            "about": None,
            "chips": [("On", "online")] if p.is_enabled else [("Off", "draft")],
            "thumb": url_for("frontend.popup_preview", popup_id=p.id),
            "overlays": "popups",
            "view": None,
            "off": not p.is_enabled,
            "icon": "message-square",
            "note": "No preview yet",
        })
    return [("", items)]


def form_groups(site):
    from .forms_overview import form_rows

    def item(r):
        chips = [("On", "online")] if r["enabled"] else [("Off", "draft")]
        if r.get("count"):
            chips.append((f"{r['count']} {r.get('count_label') or 'new'}", "warning"))
        return {
            "href": r["settings_url"],
            "title": r["name"],
            "code": r.get("public_url"),
            "about": None,
            "chips": chips,
            "thumb": r.get("public_url") if r["enabled"] else None,
            "overlays": None,
            "view": r.get("public_url") if r["enabled"] else None,
            "off": not r["enabled"],
            "icon": r.get("icon") or "send",
            "note": "Off, so it has no page" if not r["enabled"] else "No preview yet",
        }

    rows = [r for r in form_rows(site) if r.get("settings_url")]
    return [("Built in", [item(r) for r in rows if not r["custom"]]),
            ("Your forms", [item(r) for r in rows if r["custom"]])]


def template_groups(rail):
    """``rail`` is the Page templates route's list of
    ``(group, [{key, label, layout, off}])``."""
    from . import page_templates as PT
    out = []
    for group, items in rail:
        rows = []
        for it in items:
            meta = PT.KINDS[it["key"]]
            path = None if it["off"] else (meta.get("path") or PT.sample_path(it["key"]))
            chips = [("Module off", "draft")] if it["off"] else []
            if it.get("layout"):
                chips.append((it["layout"], "event"))
            rows.append({
                "href": url_for("main.frontend_templates", kind=it["key"]),
                "title": it["label"],
                "code": meta.get("path"),
                "about": None if meta.get("path") else meta.get("about"),
                "chips": chips,
                "thumb": path,
                "overlays": None,
                "view": path,
                "off": it["off"],
                "icon": "copy",
                "note": "Module off" if it["off"] else "Nothing to show yet",
            })
        out.append((group, rows))
    return out

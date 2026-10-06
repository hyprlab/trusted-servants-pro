# SPDX-License-Identifier: AGPL-3.0-or-later
"""The Web Frontend admin's section menu.

One list drives both the desktop subnav and the phone ``<select>`` in
``_frontend_subnav.html``, so a new page is added here once. Each entry
names the endpoints that light it up; the Homepage entry is special, it
opens whichever Page is the homepage and lights up only while that page
is open in the editor.
"""
from flask import request, url_for

# (group label or None, [(key, label, icon, endpoint, active endpoints), ...])
_SECTIONS = [
    (None, [
        ("overview", "Overview", "layout-grid", "main.frontend_dashboard",
         ("main.frontend_dashboard",)),
    ]),
    ("Look", [
        ("design", "Design", "sliders", "main.frontend_design",
         ("main.frontend_design",)),
        ("branding", "Branding", "star", "main.frontend_branding",
         ("main.frontend_branding",)),
    ]),
    ("Structure", [
        ("header", "Header", "panel-top", "main.frontend_header",
         ("main.frontend_header", "main.frontend_navigation",
          "main.frontend_nav_megamenu")),
        ("footer", "Footer", "panel-bottom", "main.frontend_footer",
         ("main.frontend_footer",)),
        ("templates", "Page templates", "copy", "main.frontend_templates",
         ("main.frontend_templates",)),
    ]),
    ("Content", [
        ("homepage", "Homepage", "home", None, ()),
        ("pages", "Pages", "file-text", "main.frontend_pages",
         ("main.frontend_pages", "main.frontend_page_edit")),
        ("popups", "Popups", "message-square", "main.frontend_popups",
         ("main.frontend_popups", "main.frontend_popup_edit")),
        ("forms", "Forms", "send", "main.frontend_forms",
         ("main.frontend_forms", "main.frontend_form_submission",
          "main.frontend_form_story", "main.frontend_form_contact",
          "main.frontend_form_recovery_contacts",
          "main.frontend_custom_form_edit")),
        ("404", "404 page", "alert-circle", "main.frontend_404",
         ("main.frontend_404",)),
    ]),
    ("Site", [
        ("redirects", "Redirects", "link", "main.frontend_redirects",
         ("main.frontend_redirects",)),
        ("caching", "Caching", "zap", "main.frontend_caching",
         ("main.frontend_caching",)),
        ("cookies", "Privacy & cookies", "cookie", "main.frontend_cookie_compliance",
         ("main.frontend_cookie_compliance",)),
        ("library", "Font & icon library", "type", "main.frontend_fonts_icons",
         ("main.frontend_fonts_icons",)),
        ("metrics", "Visitor metrics", "bar-chart", "main.watchtower_visitors", ()),
    ]),
]

# Entries that leave the Web Frontend area get an outward arrow.
_EXTERNAL = {"metrics"}


def fe_subnav(site):
    """Return ``[(group_label, [item, ...]), ...]`` for the current request.
    Each item is a dict with key, label, icon, href, active and external."""
    ep = request.endpoint or ""
    view_args = request.view_args or {}
    hp_id = getattr(site, "homepage_page_id", None) if site else None
    on_hp = (ep == "main.frontend_page_edit" and hp_id
             and view_args.get("page_id") == hp_id)
    out = []
    for group, items in _SECTIONS:
        rows = []
        for key, label, ico, endpoint, active_eps in items:
            if key == "homepage":
                href = (url_for("main.frontend_page_edit", page_id=hp_id)
                        if hp_id else url_for("main.frontend_pages"))
                active = bool(on_hp)
            else:
                href = url_for(endpoint)
                active = ep in active_eps
                if key == "pages" and on_hp:
                    active = False
            rows.append({"key": key, "label": label, "icon": ico, "href": href,
                         "active": active, "external": key in _EXTERNAL})
        out.append((group, rows))
    return out

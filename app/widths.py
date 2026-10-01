# SPDX-License-Identifier: AGPL-3.0-or-later
"""Width modes shared by the header, footer, pages and page templates.

``site``  follows Design → Layout (``container_max_px`` and the container
          padding tokens), so one setting sizes the whole site.
``boxed`` is centered at this surface's own maximum width in px.
``full``  spans the viewport with a side gutter in % (or vw).

Surfaces saved before ``site`` existed keep ``boxed`` and their own px
value, so an upgrade changes nothing on the public site.
"""

WIDTH_MODES = ("site", "boxed", "full")


def normalize_width_mode(raw, fallback="site"):
    raw = (raw or "").strip().lower()
    return raw if raw in WIDTH_MODES else fallback


def site_container_max(site):
    """The Design → Layout maximum width in px for ``site``."""
    try:
        from flask import g
        cached = getattr(g, "_site_container_max", None)
        if cached is not None:
            return cached
    except RuntimeError:
        g = None
    try:
        from .design import resolve_design
        val = int(resolve_design(site).get("container_max_px") or 1400)
    except Exception:  # noqa: BLE001 - a broken token must not 500 a page
        val = 1400
    if g is not None:
        g._site_container_max = val
    return val


def resolve_width(site, mode, max_width):
    """Map a stored mode to what the public templates draw.

    The templates know ``boxed`` and ``full``; ``site`` is drawn as boxed
    at the Design container width. Returns ``(mode, max_px)``.
    """
    mode = normalize_width_mode(mode, "boxed")
    if mode == "site":
        return "boxed", site_container_max(site)
    return mode, max_width


def width_px(site, mode, max_width):
    """Template helper: the max width in px a boxed or site-width surface
    draws at. Registered as the ``width_px`` Jinja global."""
    return resolve_width(site, mode, max_width)[1]


# Page-template kinds with their own width, as (label, column prefix).
TEMPLATE_WIDTH_FIELDS = [
    ("Meetings list", "frontend_meetings_list"),
    ("Events list, archive and library", "frontend_events_list"),
    ("Announcements list", "frontend_announcements_list"),
    ("Stories list", "frontend_stories_list"),
    ("Blog list", "frontend_blog_list"),
    ("Blog post", "frontend_blog_post"),
    ("Fellowships list", "frontend_fellowships_list"),
    ("Submission form", "frontend_submission_form"),
    ("Contact page", "contact_form"),
    ("Recovery Contacts page", "recovery_contacts"),
]


def width_usage(site):
    """What follows the site width and what sets its own, for the note on
    Design → Layout. Returns a list of ``{label, mode, px, href_key}``;
    Pages collapse to one row with counts."""
    from .models import Page
    rows = []

    def one(label, prefix, href_key):
        mode = normalize_width_mode(getattr(site, prefix + "_width_mode", None), "boxed")
        rows.append({"label": label, "mode": mode,
                     "px": getattr(site, prefix + "_max_width", None),
                     "href_key": href_key})

    one("Header", "frontend_header", "header")
    one("Footer", "frontend_footer", "footer")
    counts = {"site": 0, "boxed": 0, "full": 0}
    for (m,) in Page.query.with_entities(Page.width_mode).all():
        counts[normalize_width_mode(m, "boxed")] += 1
    rows.append({"label": "Pages", "mode": "pages", "counts": counts, "href_key": "pages"})
    for label, prefix in TEMPLATE_WIDTH_FIELDS:
        one(label, prefix, "templates")
    return rows

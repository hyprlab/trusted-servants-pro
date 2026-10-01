# SPDX-License-Identifier: AGPL-3.0-or-later
"""Live previews of unsaved Web Frontend settings.

An admin page posts its unsaved forms and the public path to preview.
Each form runs through its own save route inside one database
transaction whose commits are turned into flushes, the public page is
rendered from that staged state, and the transaction is rolled back. The
preview is the real public template, theme CSS included, and nothing is
kept.

Only settings saves on ``PREVIEWABLE`` run this way. Uploads, deletes and
anything that writes files are refused, and file inputs and
remove-this-file checkboxes are dropped before a save runs.
"""
from urllib.parse import urlsplit

from flask import abort, current_app, request
from werkzeug.datastructures import MultiDict

from .models import db

# Save routes whose only effect is writing settings rows.
PREVIEWABLE = {
    "main.frontend_design_save",
    "main.frontend_default_theme_save",
    "main.frontend_header_alert_save",
    "main.frontend_utility_bar_save",
    "main.frontend_footer_save",
    "main.frontend_template_settings_save",
    "main.frontend_meeting_template_save",
    "main.frontend_events_list_template_save",
    "main.frontend_announcements_list_template_save",
    "main.frontend_archive_template_save",
    "main.frontend_stories_list_template_save",
    "main.frontend_story_template_save",
    "main.frontend_blog_list_template_save",
    "main.frontend_blog_post_template_save",
    "main.frontend_meetings_list_template_save",
    "main.frontend_literature_library_template_save",
    "main.frontend_printlist_template_save",
    "main.frontend_site_index_template_save",
    "main.frontend_fellowships_list_template_save",
    "main.frontend_submission_form_template_save",
    "main.frontend_event_template_save",
    "main.frontend_contact_template_save",
    "main.frontend_recovery_contacts_template_save",
    "main.frontend_form_submission",
    "main.frontend_form_story",
    "main.frontend_form_contact",
    "main.frontend_form_recovery_contacts",
    "main.frontend_custom_form_edit",
    "main.frontend_404_save",
    "main.frontend_page_save",
    "main.frontend_popup_save",
    "main.frontend_branding_save",
    "main.frontend_cookie_compliance_save",
    "main.frontend_nav_megamenu_save_all",
    "main.frontend_nav_item_edit",
}

# Fields that would delete a stored file if a save ran with them.
_FILE_CLEAR_MARKERS = ("remove", "clear", "delete")


def _safe_fields(pairs):
    out = MultiDict()
    for pair in pairs or []:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            continue
        k, v = str(pair[0]), pair[1]
        low = k.lower()
        if any(m in low for m in _FILE_CLEAR_MARKERS):
            continue
        out.add(k, "" if v is None else str(v))
    return out


# Injected unless the preview is about them: the cookie banner and any
# auto-opening popup would otherwise cover the part being edited.
_HIDE_OVERLAYS = ("<style>.tsp-cc-banner,.fe-popup{display:none!important}"
                  "body{overflow:auto!important}</style>")


# With overlays the preview shows what a first-time visitor sees: the
# frame reads no cookies (so the admin's own banner answer doesn't hide
# it) and writes none (so clicking in the preview answers nothing).
_FRESH_VISITOR = ("<script>try{Object.defineProperty(document,'cookie',"
                  "{get:function(){return ''},set:function(){},configurable:true})}"
                  "catch(e){}</script>")


def render_staged(path, forms, overlays=False):
    """Stage ``forms`` (``[{"action": url, "fields": [[k, v], ...]}]``, or
    ``"json": {...}`` in place of ``fields`` for a JSON save route),
    render ``path`` and roll everything back. Returns the page HTML."""
    if not path or not path.startswith("/") or path.startswith("/tspro"):
        abort(400)
    app = current_app._get_current_object()
    headers = {"Cookie": request.headers.get("Cookie", "")}
    sess = db.session()
    real_commit = sess.commit
    # Instance attribute: only this request's session is affected.
    sess.commit = sess.flush
    try:
        adapter = app.url_map.bind("localhost")
        for form in forms or []:
            action = urlsplit(str(form.get("action") or ""))
            try:
                endpoint, args = adapter.match(action.path, method="POST")
            except Exception:  # noqa: BLE001 - unknown route
                abort(400)
            if endpoint not in PREVIEWABLE:
                abort(400)
            if form.get("json") is not None:
                ctx = app.test_request_context(action.path, method="POST",
                                               query_string=action.query,
                                               json=form.get("json"), headers=headers)
            else:
                ctx = app.test_request_context(action.path, method="POST",
                                               query_string=action.query,
                                               data=_safe_fields(form.get("fields")),
                                               headers=headers)
            with ctx:
                app.view_functions[endpoint](**args)
        target = urlsplit(path)
        # Follow a few redirects within the site (a form whose page has
        # its own address redirects from the default one).
        for _hop in range(4):
            with app.test_request_context(target.path, query_string=target.query,
                                          headers=headers):
                resp = app.full_dispatch_request()
            loc = resp.headers.get("Location") or ""
            if resp.status_code not in (301, 302, 303, 307, 308) or not loc:
                break
            nxt = urlsplit(loc)
            if (nxt.netloc and nxt.netloc not in ("localhost", request.host)) or not nxt.path.startswith("/") \
                    or nxt.path.startswith("/tspro"):
                break
            target = nxt
        if resp.status_code in (301, 302, 303, 307, 308):
            return ("<p style='font:14px system-ui;padding:24px'>This address "
                    "redirects to " + (resp.headers.get("Location") or "another page")
                    + ".</p>")
        html = resp.get_data(as_text=True)
        if not overlays:
            html = html.replace("</head>", _HIDE_OVERLAYS + "</head>", 1)
        else:
            html = html.replace("<head>", "<head>" + _FRESH_VISITOR, 1)
        return html
    finally:
        sess.commit = real_commit
        db.session.rollback()

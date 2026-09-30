# SPDX-License-Identifier: AGPL-3.0-or-later
"""The Page templates admin: every kind of generated public page, grouped
by the part of the site it belongs to, with what its studio needs.

Each kind names its layout catalog (in app/frontend.py), the column that
stores the chosen layout, the save route that takes the layout and page
settings in one post, the ``frontend_template_settings_json`` kind its
Appearance settings are stored under, the SiteSetting prefixes of its
heading and width fields, and an ``extras`` partial for settings only it
has (Pro Tips, archive paging and so on).

``appearance_support`` says which Appearance settings a layout really
uses, so the admin shows only those. It reads the layout's own template
for the ``--tpl-*`` variables it consumes, because only some public
routes emit them (``template_css_vars``) and only some layouts read them.
"""
import os
from functools import lru_cache

# (group, [kind keys]) in the order the admin lists them.
GROUPS = [
    ("Meetings", ["meetings_list", "meeting", "printlist"]),
    ("Events and announcements", ["events_list", "announcements_list", "archive", "event"]),
    ("Stories", ["stories_list", "story"]),
    ("Blog", ["blog_list", "blog_post"]),
    ("Library", ["literature_library"]),
    ("Directories", ["fellowships_list", "site_index"]),
    ("Forms", ["submission_form", "contact", "recovery_contacts"]),
]

KINDS = {
    "meetings_list": dict(label="Meetings list", path="/meetings", catalog="MEETINGS_LIST_TEMPLATES",
                          field="frontend_meetings_list_template", save="main.frontend_meetings_list_template_save",
                          heading="frontend_meetings_list", width="frontend_meetings_list",
                          extras="meetings_list", heading_default="Meetings"),
    "meeting": dict(label="Meeting page", path=None, sample="meeting", catalog="MEETING_TEMPLATES",
                    field="frontend_meeting_template", save="main.frontend_meeting_template_save",
                    about="Every meeting's own page."),
    "printlist": dict(label="Printable list", path="/printlist", catalog=None, fixed_key="default",
                      save="main.frontend_printlist_template_save", extras="printlist",
                      about="A printable meeting schedule, also downloadable as a PDF."),
    "events_list": dict(label="Events list", path="/events", catalog="EVENTS_LIST_TEMPLATES",
                        field="frontend_events_list_template", save="main.frontend_events_list_template_save",
                        heading="frontend_events_list", width="frontend_events_list", heading_default="Events",
                        width_note="The archive and the library use this width too."),
    "announcements_list": dict(label="Announcements list", path="/announcements",
                               catalog="ANNOUNCEMENTS_LIST_TEMPLATES",
                               field="frontend_announcements_list_template",
                               save="main.frontend_announcements_list_template_save",
                               heading="frontend_announcements_list", width="frontend_announcements_list",
                               extras="announcements_list", heading_default="Announcements"),
    "archive": dict(label="Archive", path="/archive", catalog="ARCHIVE_TEMPLATES",
                    field="frontend_archive_template", save="main.frontend_archive_template_save",
                    extras="archive", width_from="events_list"),
    "event": dict(label="Announcement and event pages", path=None, sample="post", catalog="EVENT_TEMPLATES",
                  field="frontend_event_template", save="main.frontend_event_template_save",
                  about="Every announcement, event and archived post's own page."),
    "stories_list": dict(label="Stories list", path="/stories", catalog="STORIES_LIST_TEMPLATES",
                         field="frontend_stories_list_template", save="main.frontend_stories_list_template_save",
                         heading="frontend_stories_list", width="frontend_stories_list",
                         extras="stories_list", module="stories_enabled", heading_default="Stories"),
    "story": dict(label="Story page", path=None, sample="story", catalog="STORY_TEMPLATES",
                  field="frontend_story_template", save="main.frontend_story_template_save",
                  module="stories_enabled", about="Every story's own page."),
    "blog_list": dict(label="Blog list", path="/blog", catalog="BLOG_LIST_TEMPLATES",
                      field="frontend_blog_list_template", save="main.frontend_blog_list_template_save",
                      heading="frontend_blog_list", width="frontend_blog_list", module="blog_enabled",
                      heading_default="Blog"),
    "blog_post": dict(label="Blog post", path=None, sample="blog", catalog="BLOG_POST_TEMPLATES",
                      field="frontend_blog_post_template", save="main.frontend_blog_post_template_save",
                      width="frontend_blog_post", module="blog_enabled", about="Every blog post's own page."),
    "literature_library": dict(label="Literature library", path="/library", catalog="LITERATURE_LIBRARY_TEMPLATES",
                               field="frontend_literature_library_template",
                               save="main.frontend_literature_library_template_save", width_from="events_list",
                               about="Public libraries and their public items. Which libraries and items show is set on each library."),
    "fellowships_list": dict(label="Fellowships", path="/fellowships", catalog="FELLOWSHIPS_LIST_TEMPLATES",
                             field="frontend_fellowships_list_template",
                             save="main.frontend_fellowships_list_template_save",
                             heading="frontend_fellowships_list", width="frontend_fellowships_list",
                             extras="fellowships_list", heading_default="Fellowships",
                             about="The list of sister fellowships. Its entries are edited under Settings → Global."),
    "site_index": dict(label="Site index", path="/siteindex", catalog="SITE_INDEX_TEMPLATES",
                       field="frontend_site_index_template", save="main.frontend_site_index_template_save",
                       heading="frontend_site_index", extras="site_index", heading_default="Site index",
                       about="A generated table of contents of the public site."),
    "submission_form": dict(label="Forms", path="/submissionform", catalog="SUBMISSION_FORM_TEMPLATES",
                            field="frontend_submission_form_template",
                            save="main.frontend_submission_form_template_save", width="frontend_submission_form",
                            about="The page around the Announcements/Events form, the Story form and every custom form. Their wording is set on each form."),
    "contact": dict(label="Contact page", path="/contact", catalog=None, fixed_key="split",
                    save="main.frontend_contact_template_save", width="contact_form",
                    about="The page around the Contact form. Its wording and fields are on Forms → Contact form."),
    "recovery_contacts": dict(label="Recovery Contacts page", path="/contactlist", catalog=None,
                              fixed_key="default", save="main.frontend_recovery_contacts_template_save",
                              width="recovery_contacts",
                              about="The directory page around the Recovery Contacts form. Its wording is on Forms → Recovery Contacts form."),
}

# Kinds whose public routes pass ``template_css_vars`` to the layout.
_VARS_FED = {"meeting", "event", "story", "blog_post", "fellowships_list", "submission_form"}
# Kinds whose outer page draws the dynamic background for every layout.
_WRAPPER_DYNBG = {"meetings_list", "events_list", "announcements_list", "archive", "stories_list",
                  "blog_list", "literature_library", "fellowships_list", "site_index",
                  "submission_form", "contact", "recovery_contacts", "printlist"}
_VAR_FOR = {"bg": "--tpl-bg", "heading_font": "--tpl-heading-font", "body_font": "--tpl-body-font",
            "heading_size": "--tpl-heading-size", "body_size": "--tpl-body-size"}
_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")


@lru_cache(maxsize=None)
def _source(partial):
    try:
        with open(os.path.join(_TEMPLATES_DIR, partial), encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def appearance_support(kind, layout):
    """The set of Appearance settings ``layout`` of ``kind`` uses: any of
    bg, heading_font, body_font, heading_size, body_size, dynbg and
    card_body. ``layout`` is a catalog entry dict (with ``partial``) or
    None for single-layout kinds."""
    out = set()
    partial = (layout or {}).get("partial") or ""
    src = _source(partial) if partial else ""
    if kind in _WRAPPER_DYNBG or "dynbg" in src:
        out.add("dynbg")
    if kind in _VARS_FED:
        if kind in ("meeting", "event"):
            # Their layouts are styled from frontend.css, which reads all five.
            out |= set(_VAR_FOR)
        else:
            out |= {k for k, var in _VAR_FOR.items() if var in src}
    if kind in ("announcements_list", "events_list"):
        key = (layout or {}).get("key")
        if not (kind == "events_list" and key in ("calendar", "timeline")):
            out.add("card_body")
    if kind == "blog_post" and (layout or {}).get("key") == "classic":
        out.add("sidebar_widgets")
    return out


APPEARANCE_LABELS = {"bg": "background color", "heading_font": "heading font", "body_font": "body font",
                     "heading_size": "heading size", "body_size": "text size", "dynbg": "dynamic background"}


def sample_path(kind):
    """A public page to preview a detail kind on, or None."""
    from flask import url_for
    try:
        if kind == "meeting":
            from .models import Meeting
            m = (Meeting.query.filter(Meeting.archived_at.is_(None)).order_by(Meeting.id).first())
            return url_for("frontend.meeting_detail", slug=m.public_slug) if m and m.public_slug else None
        if kind == "event":
            from .models import Post
            from .frontend import _post_live_clause, _post_url
            p = Post.query.filter(_post_live_clause()).order_by(Post.id.desc()).first()
            return _post_url(p) or None
        if kind == "story":
            from .models import Story
            st = (Story.query.filter(Story.is_archived.is_(False), Story.is_draft.is_(False))
                  .order_by(Story.id.desc()).first())
            return url_for("frontend.story_detail", slug=st.public_slug) if st and getattr(st, "public_slug", None) else None
        if kind == "blog_post":
            from .frontend import _blog_visible_query
            b = _blog_visible_query().first()
            return url_for("frontend.blog_post_detail", slug=b.public_slug) if b and b.public_slug else None
    except Exception:  # noqa: BLE001 - a missing sample must not break the admin
        return None
    return None

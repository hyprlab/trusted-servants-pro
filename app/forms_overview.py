# SPDX-License-Identifier: AGPL-3.0-or-later
"""One row per public form, built-in and custom, with its inbox and the
count of submissions waiting there. Shared by the Web Frontend Overview
and the Forms index so the two agree."""
from flask import url_for


def _safe_url(endpoint, **kw):
    try:
        return url_for(endpoint, **kw)
    except Exception:  # noqa: BLE001 - module route missing
        return None


def form_rows(site):
    from .forms_registry import all_forms
    from .models import ContactSubmission, CustomForm, FormSubmission, db
    from .sidebar import _module_pending_counts
    from sqlalchemy import func

    pending = _module_pending_counts(site)
    unread_contact = 0
    try:
        unread_contact = (ContactSubmission.query
                          .filter_by(is_read=False, is_archived=False).count())
    except Exception:  # noqa: BLE001
        pass
    waiting = {
        "submission": (pending.get("pending_posts", 0), "awaiting review"),
        "story": (pending.get("pending_stories", 0), "awaiting review"),
        "contact": (unread_contact, "unread"),
        "recovery_contacts": (pending.get("pending_recovery_contacts", 0), "awaiting approval"),
    }
    rows = []
    for f in all_forms():
        n, label = waiting.get(f["key"], (0, "new"))
        rows.append({
            "key": f["key"], "name": f["name"], "custom": False, "icon": f.get("icon") or "send",
            "enabled": bool(site and getattr(site, f["enabled_setting"], False)),
            "settings_url": _safe_url(f["settings_endpoint"]),
            "public_url": _safe_url(f["public_url_endpoint"]),
            "inbox_url": _safe_url(f.get("inbox_endpoint")) if f.get("inbox_endpoint") else None,
            "count": n, "count_label": label,
        })
    counts = dict(db.session.query(FormSubmission.form_id, func.count())
                  .filter(FormSubmission.is_archived.is_(False),
                          FormSubmission.is_seen.is_(False))
                  .group_by(FormSubmission.form_id).all())
    for cf in CustomForm.query.order_by(CustomForm.title).all():
        rows.append({
            "key": f"custom-{cf.id}", "id": cf.id, "name": cf.title, "custom": True, "icon": "send",
            "enabled": bool(cf.enabled), "slug": cf.slug,
            "settings_url": _safe_url("main.frontend_custom_form_edit", form_id=cf.id),
            "public_url": "/" + cf.slug if cf.slug else None,
            "inbox_url": _safe_url("main.frontend_form_submissions", form=cf.id),
            "count": counts.get(cf.id, 0), "count_label": "new",
        })
    return rows

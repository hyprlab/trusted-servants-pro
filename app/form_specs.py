# SPDX-License-Identifier: AGPL-3.0-or-later
"""Field specs for the built-in forms.

Their public templates and submit handlers know each field by name, so
the field builder on their settings page can't treat them like a custom
form. Each spec says:

``mode``
    ``free``: fields can be reordered, the optional core fields removed,
    and extra fields added (their answers travel with the submission).
    ``fixed``: the fields are set by the form; only their wording, and
    for some whether they are required, can change.

Per core field: ``name``, ``type``, the default ``label`` / ``placeholder``
/ ``help``, ``required``, and

``lock_required``  required is fixed at the default (the handler needs it)
``removable``      free mode only: the field may be taken off the form

``resolve_fields(key, raw)`` turns a saved ``*_blocks_json`` into the list
the admin builder and the public form both use; saves pass through
``normalize_fields`` so a posted builder can't rename or drop a locked
field.
"""
import json

F = dict  # a spec field

SPECS = {
    "contact": {
        "mode": "free",
        "types": ["text", "email", "phone", "textarea", "select", "radio", "checkboxes"],
        "fields": [
            F(name="name", type="text", label="Your name", required=True, lock_required=True, removable=False),
            F(name="email", type="email", label="Your email", required=True, lock_required=True, removable=False),
            F(name="phone", type="phone", label="Phone", required=False, removable=True),
            F(name="subject", type="text", label="Subject", required=False, removable=True),
            F(name="message", type="textarea", label="Message", required=True, lock_required=True,
              removable=False, placeholder="How can we help?"),
        ],
    },
    "story": {
        "mode": "fixed",
        "fields": [
            F(name="submitter_name", type="text", label="Name", required=True, lock_required=True, placeholder="Name"),
            F(name="submitter_email", type="email", label="Email", required=False),
            F(name="body", type="textarea", label="Story", required=True, lock_required=True,
              placeholder="Type/Paste your story here"),
            F(name="attachment", type="file", label="File Upload", required=False, lock_required=True,
              help="If your story is in a file, optionally upload it here instead of pasting it"),
            F(name="accept_terms", type="checkboxes", label="Accept Terms", required=True, lock_required=True,
              placeholder="Please read and accept the terms below:", options=["I accept the terms below"]),
        ],
    },
    "submission": {
        "mode": "fixed",
        "fields": [
            F(name="title", type="text", label="Title", required=True, lock_required=True),
            F(name="summary", type="textarea", label="Summary", help="short blurb shown in lists", lock_required=True),
            F(name="body", type="textarea", label="Full content", help="Markdown supported", lock_required=True),
            F(name="featured_image", type="file", label="Featured image",
              help="optional, JPG, PNG, or GIF, max 8 MB", lock_required=True),
            F(name="event_starts_at", type="text", label="Starts", lock_required=True, group="event"),
            F(name="event_ends_at", type="text", label="Ends", lock_required=True, group="event"),
            F(name="location_name", type="text", label="Location name",
              help='building, group, or "Online"', lock_required=True, group="event"),
            F(name="location_address", type="textarea", label="Address", lock_required=True, group="event"),
            F(name="google_maps_url", type="text", label="Google Maps URL", help="optional",
              lock_required=True, group="event"),
            F(name="website_url", type="text", label="Website URL", lock_required=True, group="event"),
            F(name="website_label", type="text", label="Website label", placeholder="Visit website",
              lock_required=True, group="event"),
            F(name="contact_name", type="text", label="Name", lock_required=True, group="event contact"),
            F(name="contact_phone", type="phone", label="Phone", lock_required=True, group="event contact"),
            F(name="contact_email", type="email", label="Email", lock_required=True, group="event contact"),
            F(name="submitter_name", type="text", label="Your name", required=True, lock_required=True),
            F(name="submitter_email", type="email", label="Your email", required=True, lock_required=True),
            F(name="submitter_phone", type="phone", label="Your phone", help="optional", lock_required=True),
            F(name="submitter_notes", type="textarea", label="Anything else?",
              help="notes for the admin reviewing this submission", lock_required=True),
        ],
    },
}


def _decode(raw):
    if not raw:
        return []
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return []
    return [b for b in data if isinstance(b, dict)] if isinstance(data, list) else []


def _core(spec_field, saved=None):
    """A core field with any saved wording (and, where allowed, required)
    laid over the spec's defaults."""
    out = {k: v for k, v in spec_field.items()}
    out.setdefault("required", False)
    out["core"] = True
    if saved:
        for k in ("label", "placeholder", "help"):
            if saved.get(k):
                out[k] = saved[k]
        if saved.get("options") and out["type"] in ("select", "radio", "checkboxes"):
            out["options"] = saved["options"]
        if not spec_field.get("lock_required"):
            out["required"] = bool(saved.get("required"))
    return out


def resolve_fields(key, raw):
    """The field list for built-in form ``key`` from its saved JSON."""
    spec = SPECS[key]
    saved = _decode(raw)
    by_name = {b.get("name"): b for b in saved}
    core_names = [f["name"] for f in spec["fields"]]
    if spec["mode"] == "fixed" or not saved:
        return [_core(f, by_name.get(f["name"])) for f in spec["fields"]]
    spec_by_name = {f["name"]: f for f in spec["fields"]}
    out, seen = [], set()
    for b in saved:
        name = b.get("name")
        if name in spec_by_name:
            if name in seen:
                continue
            seen.add(name)
            out.append(_core(spec_by_name[name], b))
        elif b.get("type") in spec.get("types", []):
            extra = dict(b)
            extra["core"] = False
            out.append(extra)
    # A core field the form can't do without comes back if missing.
    for name in core_names:
        f = spec_by_name[name]
        if name not in seen and not f.get("removable"):
            out.append(_core(f))
    return out


def normalize_fields(key, parsed):
    """Store shape for a posted builder: locked flags restored, core
    names kept, extras limited to the spec's types. Returns the list to
    json.dumps (core fields saved with their wording and required only)."""
    resolved = resolve_fields(key, parsed)
    out = []
    for f in resolved:
        keep = {k: f[k] for k in ("name", "type", "label", "required") if k in f}
        for k in ("placeholder", "help", "options", "accept"):
            if f.get(k):
                keep[k] = f[k]
        keep["id"] = f.get("id") or ("f-" + keep["name"])
        out.append(keep)
    return out


def field_map(key, raw):
    """``{name: field}`` for a built-in form: its public template reads
    each field's wording by name."""
    return {f["name"]: f for f in resolve_fields(key, raw)}

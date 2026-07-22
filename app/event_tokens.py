# SPDX-License-Identifier: AGPL-3.0-or-later
"""Auto-updating event date/time tags for announcement + event posts.

An admin can type a tag like ``{event_date}`` into a Post's GSR
Summary or Body and it renders as the post's event date wherever that
text is shown — lists, cards, detail pages, the GSR sheet, link
previews, notification emails. Edit the event's Starts/Ends fields and
every mention updates with it; nothing is baked into the stored text.

Storage vs. display
-------------------
``Post._summary`` / ``Post._body`` hold the RAW text (tags intact).
``Post.summary`` / ``Post.body`` are hybrid properties that expand tags
on read, so every existing renderer picked this up for free. Anything
that needs the authored text back — the edit form, the Duplicate
action — reads ``Post.summary_raw`` / ``Post.body_raw``.

Syntax
------
Single curly braces, lowercase, ``{event_*}``. Single braces (rather
than ``{{ }}``) keep the tags clear of Jinja, which never sees post
content as template *source* anyway. Case is ignored so ``{Event_Date}``
also resolves. An unknown ``{event_…}`` word is left alone — a typo
stays visible to the admin instead of silently vanishing.

A tag whose source datetime is missing (an announcement with no event
date, an ``{event_end_*}`` tag on an event with no end time) expands to
an empty string, so a half-filled post never leaks ``{event_time}`` onto
the public site.
"""
import re

# Matches any {event_…} word. Resolution happens against TOKENS below;
# non-matches are returned untouched by the substitution callback.
_TOKEN_RE = re.compile(r"\{(event_[a-z0-9_]+)\}", re.IGNORECASE)

# Cheap pre-check so the common case (no tags at all) costs one
# substring scan instead of a regex pass over the whole body.
_SENTINEL = "{event_"


def _ordinal(n):
    """18 → '18th'. Handles the 11/12/13 exceptions."""
    if 10 <= (n % 100) <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _time_full(dt):
    """11:00 AM — the long form used everywhere else in the portal."""
    return f"{dt.hour % 12 or 12}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'}"


def _time_short(dt):
    """11am, or 11:30am when the minutes aren't on the hour."""
    h = dt.hour % 12 or 12
    ap = "am" if dt.hour < 12 else "pm"
    return f"{h}{ap}" if dt.minute == 0 else f"{h}:{dt.minute:02d}{ap}"


def _date_long(dt):
    return f"{dt.strftime('%B')} {dt.day}, {dt.year}"


def _date_short(dt):
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _datetime_long(dt):
    return f"{_date_long(dt)} at {_time_full(dt)}"


def _datetime_short(dt):
    return f"{_date_short(dt)} at {_time_short(dt)}"


def _full(dt):
    return f"{dt.strftime('%A')}, {_date_long(dt)} at {_time_full(dt)}"


# ── Part formatters ─────────────────────────────────────────────────
# Every entry is (suffix, formatter, description). The suffix is
# appended to ``event_`` for the start tag and to ``event_end_`` for
# the matching end tag, so the two families stay in lockstep.
_PARTS = (
    ("datetime",      _datetime_long,                       "Full date and time"),
    ("datetime_short", _datetime_short,                     "Full date and time, abbreviated"),
    ("full",          _full,                                "Weekday, date and time"),
    ("date",          _date_long,                           "Date only"),
    ("date_short",    _date_short,                          "Date only, abbreviated"),
    ("date_numeric",  lambda dt: dt.strftime("%m/%d/%Y"),   "Date, numeric"),
    ("time",          _time_full,                           "Time only"),
    ("time_short",    _time_short,                          "Time only, compact"),
    ("weekday",       lambda dt: dt.strftime("%A"),         "Day of the week"),
    ("weekday_short", lambda dt: dt.strftime("%a"),         "Day of the week, abbreviated"),
    ("month",         lambda dt: dt.strftime("%B"),         "Month name"),
    ("month_short",   lambda dt: dt.strftime("%b"),         "Month name, abbreviated"),
    ("month_num",     lambda dt: str(dt.month),             "Month number"),
    ("day",           lambda dt: str(dt.day),               "Day of the month"),
    ("day_ordinal",   lambda dt: _ordinal(dt.day),          "Day of the month, ordinal"),
    ("year",          lambda dt: str(dt.year),              "Year"),
)


def _real_end(start, end):
    """Treat an end that equals the start as no end at all.

    The editor pins a blank Ends field to the Starts value, so a
    single-moment event would otherwise render as '7:30 PM – 7:30 PM'."""
    return None if (end is None or end == start) else end


def _range(start, end):
    """A whole-event range: '{date}, {time} – {time}' when the event
    starts and ends on the same day, 'July 18 – July 20, 2026' when it
    spans days (year printed once if both sides share it), and just the
    start datetime when there's no end."""
    if not start:
        return ""
    end = _real_end(start, end)
    if not end:
        return _datetime_long(start)
    if (start.year, start.month, start.day) == (end.year, end.month, end.day):
        return f"{_date_long(start)}, {_time_full(start)} – {_time_full(end)}"
    if start.year == end.year:
        return (f"{start.strftime('%B')} {start.day} – "
                f"{end.strftime('%B')} {end.day}, {end.year}")
    return f"{_date_long(start)} – {_date_long(end)}"


def _time_range(start, end):
    if not start:
        return ""
    end = _real_end(start, end)
    if not end:
        return _time_full(start)
    return f"{_time_full(start)} – {_time_full(end)}"


def _time_range_short(start, end):
    if not start:
        return ""
    end = _real_end(start, end)
    if not end:
        return _time_short(start)
    return f"{_time_short(start)}–{_time_short(end)}"


# ── Token table ─────────────────────────────────────────────────────
# name → (source, callable). Source is "start" / "end" (formatter takes
# one datetime) or "range" (formatter takes start + end).
def _build_tokens():
    tokens = {}
    for suffix, fn, _desc in _PARTS:
        tokens[f"event_{suffix}"] = ("start", fn)
        tokens[f"event_end_{suffix}"] = ("end", fn)
    tokens["event_range"] = ("range", _range)
    tokens["event_time_range"] = ("range", _time_range)
    tokens["event_time_range_short"] = ("range", _time_range_short)
    return tokens


TOKENS = _build_tokens()


def expand(text, start, end=None):
    """Replace every known ``{event_*}`` tag in ``text``.

    ``start`` / ``end`` are naive datetimes in the site's local time
    (the storage convention for ``Post.event_starts_at``). Returns the
    text unchanged when it holds no tags, and returns non-strings
    (``None``) as-is so callers can pass a nullable column straight
    through."""
    if not text or not isinstance(text, str) or _SENTINEL not in text.lower():
        return text

    def _sub(match):
        entry = TOKENS.get(match.group(1).lower())
        if entry is None:
            return match.group(0)     # unknown tag — leave it visible
        source, fn = entry
        try:
            if source == "range":
                return fn(start, end)
            dt = start if source == "start" else end
            return fn(dt) if dt else ""
        except (AttributeError, ValueError, TypeError):
            return ""

    return _TOKEN_RE.sub(_sub, text)


def expand_for_post(text, post):
    """``expand`` bound to a Post's event window."""
    return expand(text,
                  getattr(post, "event_starts_at", None),
                  getattr(post, "event_ends_at", None))


def has_tokens(text):
    """True when the raw text carries at least one recognised tag."""
    if not text or not isinstance(text, str) or _SENTINEL not in text.lower():
        return False
    return any(m.group(1).lower() in TOKENS for m in _TOKEN_RE.finditer(text))


# ── Editor support ──────────────────────────────────────────────────
# Sample datetime used to render the tag palette's "looks like" column
# when a post has no event date yet: Saturday, July 18, 2026, 11:00 AM
# – 1:30 PM. Fixed (not "now") so the help text is stable.
from datetime import datetime as _datetime   # noqa: E402

SAMPLE_START = _datetime(2026, 7, 18, 11, 0)
SAMPLE_END = _datetime(2026, 7, 18, 13, 30)


def catalog(start=None, end=None):
    """Grouped tag list for the editor palette.

    Each group is ``{"label": str, "tags": [{"tag", "desc", "example"}]}``.
    Examples resolve against the post's real event window when it has
    one, so the palette previews the actual post; otherwise against the
    fixed sample above."""
    s = start or SAMPLE_START
    e = end or (SAMPLE_END if start is None else None)

    def _row(name, desc, source, fn):
        if source == "range":
            example = fn(s, e)
        else:
            dt = s if source == "start" else e
            example = fn(dt) if dt else ""
        return {"tag": "{%s}" % name, "desc": desc, "example": example}

    start_rows = [_row(f"event_{sfx}", desc, "start", fn) for sfx, fn, desc in _PARTS]
    end_rows = [_row(f"event_end_{sfx}", desc, "end", fn) for sfx, fn, desc in _PARTS]
    range_rows = [
        _row("event_range", "Start to end, in full", "range", _range),
        _row("event_time_range", "Start to end time", "range", _time_range),
        _row("event_time_range_short", "Start to end time, compact", "range", _time_range_short),
    ]
    return [
        {"label": "Start date & time", "tags": start_rows},
        {"label": "Start to end", "tags": range_rows},
        {"label": "End date & time", "tags": end_rows},
    ]

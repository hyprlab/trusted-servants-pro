# SPDX-License-Identifier: AGPL-3.0-or-later
"""Display formatting for IP addresses in the admin tables.

A full IPv6 address is up to 45 characters — three times the widest
IPv4 — so rendering one verbatim in a ``white-space: nowrap`` table
cell blows the column out and pushes the row past the viewport. This
module produces a short, stable label for those, leaving the full value
available for a click-to-reveal.

Two steps, both lossless with respect to the stored value:

1. **Compress.** ``2001:0db8:85a3:0000:0000:8a2e:0370:7334`` and
   ``2001:db8:85a3::8a2e:370:7334`` are the same address; the second is
   the RFC 5952 canonical form and is already ~30% shorter.
2. **Elide the middle**, but only when the compressed form is still
   long enough to be a layout problem. Keeping the leading hextets
   (which identify the allocation and subnet) and the trailing ones
   (which distinguish hosts inside it) makes the abbreviation useful
   for scanning a column — the parts that differ between two visitors
   are the parts left visible.

Nothing here parses for security decisions: blocklist lookups and the
ban form keep using the raw stored string, so an unparseable value
displays as-is rather than being silently normalised into something
that no longer matches what is in the database.
"""
import ipaddress

# Compressed forms at or under this length fit the admin's IP column
# alongside the Block/Unblock control without wrapping, so they are
# shown whole and get no reveal affordance. Sized from the widest
# IPv4-with-port style value the column already handles comfortably.
_ABBREVIATE_OVER = 24

# Hextets kept on each side of the ellipsis.
_KEEP_LEADING = 2
_KEEP_TRAILING = 2


def _compress(value):
    """RFC 5952 canonical form, or the input unchanged if it does not
    parse. Never raises — admin tables render whatever was captured,
    including proxy artefacts like ``unknown`` or comma-joined
    X-Forwarded-For chains."""
    try:
        return ipaddress.ip_address(value.strip()).compressed
    except (ValueError, AttributeError):
        return value


def ip_display(value):
    """Return ``{full, short, abbreviated, is_v6}`` for an IP string.

    ``full`` is always the raw stored value — that is what the block
    form posts and what ``blocked_ips`` is keyed on, so the reveal
    shows the admin exactly the string the rest of the row acts on.
    ``short`` is what to render initially; when ``abbreviated`` is
    False the two describe the same text and no toggle is needed."""
    raw = (value or "").strip()
    if not raw:
        return {"full": "", "short": "", "abbreviated": False, "is_v6": False}

    try:
        parsed = ipaddress.ip_address(raw)
    except ValueError:
        # Not an address we can reason about (proxy chain, hostname,
        # "unknown"): leave it alone rather than guess at a shortening.
        return {"full": raw, "short": raw, "abbreviated": False, "is_v6": False}

    if parsed.version != 6:
        return {"full": raw, "short": raw, "abbreviated": False, "is_v6": False}

    # IPv4-mapped (``::ffff:203.0.113.42``): Python's canonical form
    # re-encodes the dotted quad as hextets (``::ffff:cb00:712a``),
    # which is correct but unrecognisable to an admin comparing it
    # against an IPv4 blocklist entry. Keep the dotted tail.
    mapped = parsed.ipv4_mapped
    if mapped is not None:
        return {"full": raw, "short": "::ffff:" + str(mapped),
                "abbreviated": False, "is_v6": True}

    compressed = parsed.compressed
    if len(compressed) <= _ABBREVIATE_OVER:
        # Already short — a link-local or a heavily-zero-compressed
        # address. Show it whole; an ellipsis here would hide
        # characters without buying any column width.
        return {"full": raw, "short": compressed,
                "abbreviated": False, "is_v6": True}

    # Split on the compressed form so the elision lands on hextet
    # boundaries. A "::" run yields empty parts, which we keep as-is:
    # they only appear in the middle, which is what gets elided.
    parts = compressed.split(":")
    if len(parts) <= _KEEP_LEADING + _KEEP_TRAILING:
        return {"full": raw, "short": compressed,
                "abbreviated": False, "is_v6": True}

    head = ":".join(parts[:_KEEP_LEADING])
    tail = ":".join(parts[-_KEEP_TRAILING:])
    return {"full": raw, "short": head + "…" + tail,
            "abbreviated": True, "is_v6": True}

"""URL scheme validation for user- and editor-supplied URLs.

Jinja autoescape blocks markup injection but NOT dangerous URL schemes:
``href="javascript:alert(1)"`` survives escaping as a live javascript: URL.
Every URL column that can hold a value typed by an untrusted (public
submission forms) or semi-trusted (editor-authored content) user must be
run through :func:`sanitize_url` before storage, and templates rendering
model URL columns into ``href`` should apply the ``|safe_url`` filter as
defense-in-depth at render time.
"""

from urllib.parse import urlsplit

# Schemes legitimate for public-facing links. tel:/mailto: cover the
# contact-link use cases; everything else (javascript:, data:, vbscript:,
# file:) is rejected.
ALLOWED_URL_SCHEMES = frozenset({"http", "https", "mailto", "tel"})


def sanitize_url(value, max_len=500):
    """Return ``value`` trimmed if it is a same-origin or allowed-scheme
    URL, else None.

    Allowed:
      * http://, https://, mailto:, tel: absolute URLs
      * protocol-free same-origin paths starting with "/" (but NOT "//",
        which browsers treat as protocol-relative offsite navigation)
      * fragment-only "#..." links (in-page anchors)

    Rejected: any other scheme (javascript:, data:, vbscript:, file:),
    protocol-relative URLs, backslash-smuggled variants, and whitespace/
    control-character payloads.
    """
    if value is None:
        return None
    url = str(value).strip()[:max_len]
    if not url:
        return None
    # Control chars / whitespace inside can be used to obfuscate a scheme
    # from naive checks (e.g. "java\tscript:"); browsers strip some of
    # these before parsing, so reject rather than try to out-normalize.
    if any(ord(c) < 0x20 or c in " \t\r\n" for c in url):
        return None
    # Backslash smuggling: several browsers normalize "/" to "...", so
    # "/\evil.com" becomes a protocol-relative offsite URL. Reject any
    # URL containing a backslash outright.
    if "\\" in url:
        return None
    if url.startswith("#"):
        return url
    if url.startswith("/"):
        return None if url.startswith("//") else url
    # Everything else must carry an explicit allowed scheme.
    scheme = urlsplit(url).scheme.lower()
    if scheme in ALLOWED_URL_SCHEMES:
        return url
    return None


def safe_href(value, max_len=500):
    """Render-side variant for templates: returns a safe URL string, or
    "#" when the value is absent/unsafe (never None, so ``href`` always
    gets a harmless inert target)."""
    return sanitize_url(value, max_len=max_len) or "#"

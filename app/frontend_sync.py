# SPDX-License-Identifier: AGPL-3.0-or-later
"""Frontend staging sync — outbound client.

The inbound side (the API a peer calls) lives in ``routes.py`` on the
``frontend_sync_bp`` blueprint. This module is the *driving* half: when an
admin clicks **Pull from peer** or **Push to peer**, these helpers reach
across to the configured sibling install's API and move the scoped
frontend bundle (presentation + page-builder Pages + assets — never
Stories, users, meetings, or libraries).

Pairing is a single shared secret stored on ``FrontendSyncPeer`` (see
``models.py``); the same token lives on both installs and authenticates
traffic in both directions. We send it in the ``X-Frontend-Sync-Token``
header, mirroring the remote-restore client style in
``backup_backends.py``.

All functions run inside an app context (they read config, hit the DB, and
write files) and raise :class:`FrontendSyncError` with a friendly message
on any failure so the admin routes can flash it directly.
"""
import os
import tempfile
import time

import requests
from flask import current_app

# Network timeouts: (connect, read). The read leg is generous because a
# bundle with fonts / hero images can take a moment to build and stream.
_TIMEOUT = (10, 180)
_TOKEN_HEADER = "X-Frontend-Sync-Token"
# One retry for failures that happened before the request reached the peer
# (see ``_request``), after a short pause to let a cold resolver settle.
_RETRIES = 1
_RETRY_DELAY = 1.0


class FrontendSyncError(Exception):
    """A sync attempt failed; the message is safe to show an admin."""


def _endpoint(peer, path):
    """Absolute URL for one of the peer's frontend-sync endpoints."""
    base = (peer.base_url or "").strip().rstrip("/")
    if not base:
        raise FrontendSyncError("No peer base URL configured.")
    if not (base.startswith("http://") or base.startswith("https://")):
        raise FrontendSyncError("Peer base URL must start with http:// or https://")
    return f"{base}/api/v1/frontend-sync/{path}"


def _headers(peer):
    from .version import __version__

    token = peer.token
    if not token:
        raise FrontendSyncError("No shared sync token configured.")
    # Identify ourselves properly: a peer behind a CDN/WAF is far more
    # likely to challenge a bare ``python-requests`` user agent.
    return {_TOKEN_HEADER: token,
            "User-Agent": f"trusted-servants-pro/{__version__} (frontend-sync)"}


def _never_delivered(exc):
    """True when the request never made it onto the wire — a DNS lookup that
    failed or a connection that was never established. Retrying those is safe
    even for a POST, because the peer has not seen (let alone applied)
    anything. A TLS error is excluded: a bad certificate won't fix itself."""
    if isinstance(exc, requests.exceptions.ConnectTimeout):
        return True
    if isinstance(exc, requests.exceptions.SSLError):
        return False
    if not isinstance(exc, requests.exceptions.ConnectionError):
        return False
    try:
        from urllib3.exceptions import MaxRetryError, NewConnectionError
    except ImportError:  # pragma: no cover - urllib3 always ships with requests
        return False
    inner = exc.args[0] if exc.args else None
    if isinstance(inner, MaxRetryError):
        inner = inner.reason
    # NewConnectionError covers both "connection refused" and (via its
    # NameResolutionError subclass) a failed DNS lookup.
    if not isinstance(inner, NewConnectionError):
        return False
    # EAI_NONAME — the name definitively does not exist. That's a typo in the
    # peer URL, not a blip, so retrying only doubles the admin's wait. The
    # blip we *do* want to retry is EAI_AGAIN ("Temporary failure in name
    # resolution"), which is what a dropped resolver query looks like.
    text = str(inner)
    return not ("[Errno -2]" in text or "Name or service not known" in text)


def _request(method, url, **kw):
    """Issue one sync request, retrying once if the first attempt never
    reached the peer.

    Containerised installs resolve names through Docker's embedded DNS,
    which forwards to the host resolver over UDP; a cold cache plus one
    dropped packet is enough for a single lookup to time out. The dashboard
    widget pings on every page load, so that blip used to paint a perfectly
    healthy pairing as "Unreachable" until the admin re-tested by hand."""
    attempt = 0
    while True:
        try:
            return requests.request(method, url, **kw)
        except requests.exceptions.RequestException as exc:
            attempt += 1
            if attempt > _RETRIES or not _never_delivered(exc):
                raise
            try:
                current_app.logger.info(
                    "frontend-sync: retrying %s %s after %r", method, url, exc)
            except Exception:  # noqa: BLE001
                pass
            # A retried upload must re-read its body from the start.
            for value in (kw.get("files") or {}).values():
                stream = value[1] if isinstance(value, tuple) else value
                if hasattr(stream, "seek"):
                    stream.seek(0)
            time.sleep(_RETRY_DELAY)


def _friendly_request_error(exc):
    # Log the raw exception: the admin-facing strings below are deliberately
    # vague, and a transient network fault is impossible to diagnose without
    # the underlying urllib3 detail.
    try:
        current_app.logger.warning("frontend-sync request failed: %r", exc)
    except Exception:  # noqa: BLE001 - logging must never mask the real error
        pass
    if isinstance(exc, requests.exceptions.SSLError):
        return "TLS/SSL error reaching the peer (check the certificate or use http:// for a trusted LAN)."
    if isinstance(exc, requests.exceptions.ConnectTimeout):
        return "Timed out connecting to the peer."
    if isinstance(exc, requests.exceptions.ReadTimeout):
        return "The peer took too long to respond."
    if isinstance(exc, requests.exceptions.ConnectionError):
        if "NameResolutionError" in repr(exc) or "Failed to resolve" in str(exc):
            return "Could not look up the peer's address (DNS lookup failed) — check the URL, or retry."
        return "Could not reach the peer (connection refused or host unreachable)."
    return f"Request to the peer failed: {exc}"


def _error_from_response(resp):
    """Pull the server's JSON ``error`` out of a non-2xx response, with a
    sensible fallback per status code."""
    detail = ""
    try:
        body = resp.json()
        if isinstance(body, dict):
            detail = body.get("error") or ""
    except ValueError:
        pass
    if resp.status_code == 401:
        return detail or "Peer rejected the token (check it matches, and that the peer has inbound sync enabled)."
    if resp.status_code == 429:
        # Ignore the peer's terse "too many attempts" — out of context it
        # reads like a lockout on this side rather than the peer's limiter.
        return "Peer is rate-limiting sync attempts; try again in a few minutes."
    if resp.status_code == 404:
        return "Peer does not expose the frontend-sync API (is it running this version?)."
    return detail or f"Peer returned HTTP {resp.status_code}."


def ping(peer):
    """Probe the peer for reachability + identity. Returns the parsed JSON
    (``{ok, app, version, format_version, name}``) or raises."""
    try:
        resp = _request("GET", _endpoint(peer, "ping"), headers=_headers(peer), timeout=_TIMEOUT)
    except requests.exceptions.RequestException as exc:
        raise FrontendSyncError(_friendly_request_error(exc))
    if resp.status_code != 200:
        raise FrontendSyncError(_error_from_response(resp))
    try:
        data = resp.json()
    except ValueError:
        raise FrontendSyncError("Peer responded but not with JSON — is the URL the portal root?")
    if data.get("app") != "trusted-servants-pro":
        raise FrontendSyncError("That URL does not look like a Trusted Servants Pro install.")
    return data


def pull_from_peer(peer):
    """Download the peer's scoped frontend bundle and apply it locally.
    Snapshots our current frontend first (rollback point). Returns
    ``(summary, snapshot_name)``."""
    from datetime import datetime
    from .routes import _import_frontend_bundle_zip, _frontend_sync_snapshot
    from .models import db

    upload_dir = current_app.config["UPLOAD_FOLDER"]
    data_dir = os.path.dirname(upload_dir.rstrip("/"))
    fd, zip_path = tempfile.mkstemp(prefix="tsp-fe-pull-", suffix=".zip", dir=data_dir)
    os.close(fd)
    try:
        try:
            with _request("GET", _endpoint(peer, "pull"), headers=_headers(peer),
                          timeout=_TIMEOUT, stream=True) as resp:
                if resp.status_code != 200:
                    raise FrontendSyncError(_error_from_response(resp))
                with open(zip_path, "wb") as out:
                    for block in resp.iter_content(chunk_size=1024 * 1024):
                        if block:
                            out.write(block)
        except requests.exceptions.RequestException as exc:
            raise FrontendSyncError(_friendly_request_error(exc))

        # Rollback point before we overwrite our own frontend.
        snapshot = _frontend_sync_snapshot()
        ok, result = _import_frontend_bundle_zip(zip_path)
        if not ok:
            raise FrontendSyncError(result)
        peer.last_pulled_at = datetime.utcnow()
        db.session.commit()
        return result, snapshot
    finally:
        try: os.unlink(zip_path)
        except OSError: pass


def push_to_peer(peer):
    """Build our scoped frontend bundle and push it to the peer, which
    snapshots + applies it. Returns the peer's applied-summary dict (with a
    ``snapshot`` key naming the rollback bundle it saved)."""
    from datetime import datetime
    from .routes import _write_frontend_bundle_zip
    from .models import db

    upload_dir = current_app.config["UPLOAD_FOLDER"]
    data_dir = os.path.dirname(upload_dir.rstrip("/"))
    fd, zip_path = tempfile.mkstemp(prefix="tsp-fe-push-", suffix=".zip", dir=data_dir)
    os.close(fd)
    try:
        _write_frontend_bundle_zip(zip_path, include_stories=False)
        try:
            with open(zip_path, "rb") as fh:
                resp = _request(
                    "POST", _endpoint(peer, "push"), headers=_headers(peer),
                    files={"archive": ("frontend-sync.zip", fh, "application/zip")},
                    timeout=_TIMEOUT)
        except requests.exceptions.RequestException as exc:
            raise FrontendSyncError(_friendly_request_error(exc))
        if resp.status_code != 200:
            raise FrontendSyncError(_error_from_response(resp))
        try:
            data = resp.json()
        except ValueError:
            raise FrontendSyncError("Peer applied the bundle but returned an unreadable response.")
        if not data.get("ok"):
            raise FrontendSyncError(data.get("error") or "Peer rejected the bundle.")
        peer.last_pushed_at = datetime.utcnow()
        db.session.commit()
        result = data.get("applied") or {}
        result["snapshot"] = data.get("snapshot")
        return result
    finally:
        try: os.unlink(zip_path)
        except OSError: pass

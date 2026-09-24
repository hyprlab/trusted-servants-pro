# Documentation

Configuring, securing, backing up and developing Trusted Servants Pro. Installing is in [INSTALL.md](INSTALL.md) and the [README](../README.md#quick-start).

## Configuration

A `.env` file sits alongside `docker-compose.yml`. At minimum it must define `TSP_SECRET_KEY` — a long, random value used to sign Flask session cookies.

Generate one with `openssl`:

```bash
openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-64
```

Example `.env`:

```
TSP_SECRET_KEY=REPLACE_WITH_OUTPUT_OF_THE_COMMAND_ABOVE
TSP_ADMIN_USERNAME=admin
TSP_ADMIN_PASSWORD=change-me-before-first-boot
TSP_ADMIN_EMAIL=admin@example.com
```

Keep `.env` out of version control and set it to mode `600` on the host (the installer does this automatically). Rotating `TSP_SECRET_KEY` will sign out all active users but does not affect stored Zoom / SMTP passwords — those are encrypted with a separate Fernet key stored at `data/zoom.key` (see [Security](#security)).

Other environment variables (all with sensible defaults):

| Variable | Default | Purpose |
| --- | --- | --- |
| `TSP_SECRET_KEY` | `dev-secret-change-me` | Flask session signing key. Required to be set in production. |
| `TSP_ADMIN_USERNAME` | `admin` | Seeded on first boot only. |
| `TSP_ADMIN_PASSWORD` | `admin` | Seeded on first boot only. |
| `TSP_ADMIN_EMAIL` | `admin@example.com` | Seeded on first boot only. |
| `TSP_DATA_DIR` | `/data` | Inside-container data directory. Mounted to `./data` on the host by default. |
| `TSP_UPLOAD_DIR` | `$TSP_DATA_DIR/uploads` | Location of uploaded files. |
| `TSP_FERNET_KEY` | _auto-generated_ | If set, used directly; otherwise a key is generated and stored in `data/zoom.key`. |
| `TSP_SESSION_DAYS` | `180` | Login session + remember-me cookie lifetime in days. Lower it (e.g. `7`) for a tighter idle-timeout posture. |
| `TSP_TRUSTED_PROXIES` | `1` | Number of trusted reverse-proxy hops for `X-Forwarded-For`. Set to `0` for a direct-bind deploy with no proxy in front (so spoofable headers are never trusted). |
| `TSP_TRUST_CF_HEADER` | `1` (on) | Honor Cloudflare's `CF-Connecting-IP` to recover the real visitor IP. Only accepted when the request peer is a verified Cloudflare edge IP, so it's safe to leave on even without Cloudflare. Set to `0` to disable. |
| `TSP_IMPORTER_ALLOW_PRIVATE` | _unset_ | Set to `1` to let the WordPress importer fetch from private/LAN addresses (SSRF guard bypass for local dev imports). |

Uploads are limited to **256 MB** per file.

## Security

- **Session cookies** are signed with `TSP_SECRET_KEY`. Rotating it will sign users out but does not affect encrypted credentials.
- **Zoom account passwords, OTP email password, and SMTP password** are encrypted with Fernet. The key lives at `data/zoom.key` (auto-generated on first boot) or is loaded from the `TSP_FERNET_KEY` env var. **Keep this file alongside your database if you restore to another host**, or set `TSP_FERNET_KEY` explicitly — the Data export bundles it for you.
- Public file URLs (`/pub/<filename>`) are intentionally human-readable and unauthenticated. Anyone with the link can read the file. Do not upload content you do not want shared.
- Access-request submissions are public (no login required) but rate-limited by the browser.

## Local development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Serves on http://localhost:8000 with `debug=True`.

## Backing up & migrating

Use **Settings → Data → Export** for a portable archive. To restore on a fresh server, start the container once (which creates the data directory), then upload the export through **Settings → Data → Import**. The existing state is moved to `data/backup-<timestamp>/` before the restore runs.

If you prefer the command line:

```bash
docker compose down
cp -r ./data ./data.bak
# copy the export zip contents (tsp.db, uploads/, zoom.key) into ./data/
docker compose up -d
```

## Project layout

```
app/
  __init__.py      # app factory, startup migrations, Fernet init
  auth.py          # login / logout / user CRUD
  crypto.py        # Fernet helpers
  mail.py          # SMTP send helper
  models.py        # SQLAlchemy models (Meeting, Library, Reading, User, ZoomAccount, ...)
  routes.py        # main blueprint — nearly all feature routes
  static/          # CSS, JS, images, login_fx engine
  templates/       # Jinja templates (base + per-feature)
scripts/           # one-off WP / Zoom import utilities
docker-compose.yml
Dockerfile
requirements.txt
run.py
README.md
```

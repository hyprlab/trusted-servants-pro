Title: Configuration & Security
Category: Configuration
Order: 1
Slug: configuration
Icon: sliders
Summary: Every environment variable, the .env file, the maximum upload size, how Trusted Servants Pro encrypts stored credentials, and agent access.

Trusted Servants Pro is configured entirely through environment variables, with
sensible defaults for everything except the session secret. In a Compose
deployment those variables live in a `.env` file that sits alongside your
`docker-compose.yml`.

## The .env file

At minimum, `.env` must define `TSP_SECRET_KEY` — a long, random value used to
sign Flask session cookies. Generate one with `openssl`:

```bash
openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-64
```

A typical `.env`:

```ini
TSP_SECRET_KEY=replace-with-the-output-of-the-command-above
TSP_ADMIN_EMAIL=you@yourfellowship.org
TSP_ADMIN_PASSWORD=change-me-before-first-boot
```

!!! warning "Keep .env private"
    Never commit `.env` to version control, and set it to mode `600` on the host
    (`chmod 600 .env`). The one-command installer does this for you.

## Environment variables

All variables have defaults except `TSP_SECRET_KEY` and, on the first boot,
`TSP_ADMIN_PASSWORD`: without them the portal refuses to start (unless
`TSP_DEBUG=1`, for local development only).

| Variable | Default | Purpose |
| --- | --- | --- |
| `TSP_SECRET_KEY` | _none_ | Flask session signing key. **Required.** |
| `TSP_ADMIN_EMAIL` | `admin@example.com` | The first admin's email address, which is also their username. Seeded on first boot only. |
| `TSP_ADMIN_PASSWORD` | _none_ | Seeded on first boot only, and required then. The seeded admin sets up two-factor authentication at first sign-in. |
| `TSP_ADMIN_USERNAME` | `TSP_ADMIN_EMAIL` | Seeded on first boot only. Usernames are email addresses; one that isn't is replaced by `TSP_ADMIN_EMAIL`. |
| `TSP_DATA_DIR` | `/data` | In-container data directory. Mounted to `./data` by default. |
| `TSP_UPLOAD_DIR` | `$TSP_DATA_DIR/uploads` | Where uploaded files are stored. |
| `TSP_TMP_DIR` | _the data volume_ | Scratch location for building backup archives. Defaults to the data volume (guaranteed headroom); point it at a dedicated scratch disk to override. Falls back to the system temp dir if unwritable. |
| `TSP_MAX_UPLOAD_MB` | `4096` | Maximum upload size in MiB (default 4 GiB). |
| `TSP_SESSION_DAYS` | `180` | How long a sign-in lasts, in days. Lower it (for example `7`) to sign people out sooner. |
| `TSP_TRUSTED_PROXIES` | `1` | Number of reverse proxies in front of the portal whose `X-Forwarded-For` header is trusted. Set to `0` when nothing sits in front, so a forged header is never believed. |
| `TSP_TRUST_CF_HEADER` | `1` (on) | Use Cloudflare's `CF-Connecting-IP` header to find the visitor's real IP. It is only read when the request comes from a Cloudflare address, so it is safe to leave on without Cloudflare. Set to `0` to turn it off. |
| `TSP_FERNET_KEY` | _auto-generated_ | Encryption key for stored credentials. If unset, a key is generated and saved to `data/zoom.key`. |
| `TSP_IMPORTER_ALLOW_PRIVATE` | _unset_ | Set to `1` to let the WordPress importer fetch from private or LAN addresses, for importing from a local test site. |
| `TSP_DEBUG` | `0` | Local development only: plain HTTP cookies, a fallback secret key, and a seeded admin (`TSP_ADMIN_EMAIL`, password `admin`) without two-factor. Never in production. |

!!! note "The admin variables only seed the first boot"
    `TSP_ADMIN_EMAIL` / `TSP_ADMIN_PASSWORD` / `TSP_ADMIN_USERNAME` create the
    initial admin **only when the database is empty**. Changing them later has no
    effect — manage users from **Settings → Users** instead.

## Upload size

Uploads default to a generous **4 GiB** ceiling so a full-portal restore bundle
(database plus the entire uploads directory in one request) isn't truncated.
Lower it with `TSP_MAX_UPLOAD_MB` if you want a tighter limit:

```yaml
environment:
  - TSP_MAX_UPLOAD_MB=512
```

## How credentials are encrypted

Trusted Servants Pro stores some secrets on your behalf — Zoom account
passwords, the OTP email password, and your SMTP password. These are **encrypted
at rest** with [Fernet](https://cryptography.io/en/latest/fernet/) symmetric
encryption.

- The Fernet key is auto-generated on first boot and written to
  `data/zoom.key`, **unless** you provide `TSP_FERNET_KEY` explicitly, in which
  case that value is used.
- The key is independent of `TSP_SECRET_KEY`. Rotating your session secret signs
  everyone out but does **not** affect stored credentials.

!!! danger "Keep zoom.key with your database"
    If you move your database to another host without the matching `zoom.key`
    (or `TSP_FERNET_KEY`), the portal can no longer decrypt stored Zoom/SMTP
    passwords. The **Settings → Data → Export** archive bundles the key for you,
    so a UI export/import migration always carries it along.

## A note on public file URLs

Files are served at human-readable URLs like `/pub/<original-filename>` —
intentionally without hashes or tokens. These URLs are **unauthenticated**:
anyone with the link can read the file. Don't upload anything you wouldn't want
shared. See [Security](#how-credentials-are-encrypted) above for how stored
secrets differ from public files.

## Agent access (MCP)

The portal has a built-in [MCP](https://modelcontextprotocol.io) server, so an
AI agent such as Claude Code can make changes to the public website. It is off
until an admin turns it on under **Web Frontend → Agent access**, which is also
where tokens are made and revoked and where every change an agent made is
listed.

- **Address:** `https://<your site>/tspro/mcp`, over Streamable HTTP. The agent
  sends its token as `Authorization: Bearer <token>`. When you make a token, the
  Agent access screen shows the `claude mcp add` command and a JSON block for
  other agents.
- **Tokens** belong to the admin who makes them and act as that admin. Each is
  read only; read and change; or read, change and delete. Only a hash is
  stored, and the token is shown once. A token stops working when it is
  revoked, when the server is turned off, or when its admin is no longer an
  admin.
- **How changes are made.** An agent reads a Web Frontend screen's forms and
  saves one with some fields changed. The save goes through the same route as
  the admin's own Save button, so it is checked and stored exactly as a click
  would be, and shows on that screen at once.
- **Review.** Each change is in the activity log under the admin's name with the
  token's label, on the Agent access screen, and in Watchtower's user log. Page
  saves are kept in the page's History, and an agent can save a published page
  as a draft for someone to publish.
- **Limits.** Agents reach only the Web Frontend section of the admin. They
  cannot read form submissions, make tokens, turn the server off, or change an
  admin's own preferences.

## Next steps

- [Email Relay](email-relay.md) — send mail even when your host blocks outbound SMTP ports.
- [Backup &amp; Restore](backup-restore.md) — export, import, and migrate.
- [Disk Space &amp; Housekeeping](disk-space.md) — keep an unattended server from filling its disk.
- [Upgrading &amp; Uninstalling](upgrading.md) — keep the portal current.

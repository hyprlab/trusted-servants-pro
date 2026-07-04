Title: Frontend Staging Sync
Category: Operations
Order: 5
Slug: frontend-sync
Icon: repeat
Summary: Build your public website on a separate Staging copy and move it to your Live site over the network — no bundle to download and re-upload.

Frontend staging sync lets you iterate on your public website somewhere safe and
then move the result to your live site over the network — without exporting a
bundle on one install and re-uploading it on the other. You pair two installs
once, then **Pull** the live site's current frontend down to staging to start
from real state, or **Push** your staged design up to live when it's ready.

Only the *frontend* travels. Recovery Stories, users, meetings, libraries, Zoom
accounts, backups, and uploads on the receiving side are never touched.

## What "the frontend" means here

A sync moves the **scoped frontend bundle** — everything that shapes the public
site, and nothing operational:

- Look-and-feel settings: theme, branding, navigation, mega-menus, the
  utility bar, header alert, hero, footer, and the submission/contact form
  presentation.
- Page-builder **Pages** (full schema, including per-page spacing and Open Graph
  overrides) and the resolved homepage designation.
- Custom layouts (homepage / footer / page), custom fonts, and custom icons.
- The intergroup officer list and the MediaItem catalog.
- Every uploaded file (images, fonts, icons) referenced by any of the above.

!!! note "What never syncs"
    Users, meetings, libraries, Zoom accounts, off-site backup targets, and
    SMTP/notification recipient routing stay put on each install. Recovery
    **Stories** are deliberately left alone on the receiving side, since
    they're usually submitted and edited on the live site.

## The two roles

A pairing is asymmetric. Each install plays one role, and the setup wizard shows
only that side's fields:

- **Live site** — your production source of truth. It *mints* the shared token
  and accepts inbound traffic (it serves pulls and accepts pushes). It never
  reaches out on its own.
- **Staging copy** — the dev install. It *pastes* the token, stores the live
  site's address, and is the side that clicks **Pull** or **Push**.

Inbound is opt-in and derived from the role automatically: choosing **Live**
turns inbound on; choosing **Staging** leaves it off. That keeps a destructive
inbound path closed unless you explicitly designate an install as live.

## How pairing is secured

Pairing is a single **shared secret**: the *same* token lives on both installs
and authenticates traffic in both directions (sent in an
`X-Frontend-Sync-Token` header). The token is high-value — it gates writes to
your public site — so:

- It's **Fernet-encrypted at rest** (the same key system as Zoom and SMTP
  credentials).
- Failed auth attempts are **rate-limited** per IP (10 failures in 15 minutes
  trips the limiter).
- Every Pull or Push requires you to type **`REPLACE`** to confirm.
- The **receiving side auto-saves a rollback snapshot** of its own frontend
  *before* applying anything (see [Rollback](#rolling-back), below).

## Set it up

You'll do two short passes — one on each install. Both happen in
**Settings → Data → Frontend staging sync**, and the wizard saves without
reloading the page.

### 1. On your Live site

1. Open **Settings → Data → Frontend staging sync**.
2. Choose **This is the Live site**.
3. Click **Generate token**. Copy the value it shows — you'll paste it into
   staging next. (Generating a fresh token replaces any previous one.)

That's it: the live site is now set to receive, and it carries no peer URL of
its own.

### 2. On your Staging copy

1. Open **Settings → Data → Frontend staging sync**.
2. Choose **This is the Staging copy**.
3. Paste the **token** from the live site.
4. Enter the live site's **address** (the portal root, e.g.
   `https://meetings.example.org`). It must start with `http://` or `https://`.
5. Click **Test connection**. A success message names the live install and its
   version; an error tells you exactly what to fix (wrong token, unreachable
   host, TLS problem, or a peer that doesn't have inbound enabled).

!!! tip "Use http:// only on a trusted LAN"
    If staging and live talk over the public internet, use `https://`. Plain
    `http://` is fine when both boxes sit on the same trusted network, and it
    sidesteps certificate errors during local testing.

## Pull and push

Once the connection test passes, you can move the frontend in either direction
from the staging copy. The fastest place to do it is the **Web Frontend →
Overview** Status card, which gains one-click **Pull from Live** and **Push to
Live** buttons plus a live connection indicator — no need to reopen Settings.

- **Pull from Live** — download the live site's current frontend and apply it to
  staging. Use this to start a redesign from exactly what's live today.
- **Push to Live** — build staging's frontend and send it to the live site,
  which applies it. Use this to deploy your finished design.

Each action snapshots the *receiving* install first, then reports a summary of
what was applied (pages, nav items, layouts, fonts, icons, assets).

!!! warning "A sync overwrites the receiving side's frontend"
    Pull replaces **staging's** public site; Push replaces **live's**. The
    operational data listed above is untouched, but the entire frontend on the
    receiving side is swapped for the sender's. The `REPLACE` confirmation and
    the automatic rollback snapshot exist for exactly this reason.

## Rolling back

Before applying any inbound sync, the receiving install writes a **full**
frontend bundle of its current state (this one *does* include Stories) to a
`frontend-sync-snapshots/` folder inside its data directory, named
`frontend-pre-sync-YYYYMMDD-HHMMSS.zip`. The ten most recent snapshots are kept.

If a sync didn't land the way you wanted, restore the snapshot through the normal
**Settings → Data → Frontend bundle import** form on that install.

## Troubleshooting

- **"Peer rejected the token"** — the tokens don't match, or the peer doesn't
  have inbound enabled. Re-generate on live, re-paste on staging, and confirm
  the live install's role is set to **Live site**.
- **"Peer does not expose the frontend-sync API"** — the live install is running
  an older version. Upgrade it — see [Upgrading](/docs/upgrading).
- **"Peer is rate-limiting sync attempts"** — too many failed auth attempts;
  wait a few minutes and try again.
- **TLS/SSL error** — fix the live site's certificate, or use `http://` if both
  installs are on a trusted LAN.

## Next steps

- [Backup &amp; Restore](/docs/backup-restore) — the full-portal export/import,
  including the Frontend bundle import used for rollback.
- [Configuration &amp; Security](/docs/configuration) — how the Fernet key
  protects stored secrets like the sync token.
- [Upgrading &amp; Uninstalling](/docs/upgrading) — keep both installs on a
  version that speaks the sync API.

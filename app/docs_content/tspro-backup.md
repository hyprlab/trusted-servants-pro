Title: Off-site Backups with TS Pro Backup
Category: Operations
Order: 2
Slug: tspro-backup
Icon: shield
Summary: Stand up the TS Pro Backup companion server with Docker Compose, then connect your portal so every backup is end-to-end encrypted and pushed off-site automatically on a schedule you control.

The [Backup &amp; Restore](/docs/backup-restore) guide protects you against
*accidents* — a bad import, a fat-fingered delete — by keeping copies of your
`./data` directory on the same machine. But if that machine itself dies (a disk
failure, a deleted droplet, a ransomware event, a provider closing your
account), local snapshots die with it. For real disaster recovery you need your
backups to live **somewhere else entirely**.

**TS Pro Backup** is a small companion server you run **off-site** — on a
different host, ideally a different provider or even a different continent. Your
portal connects to it over HTTPS and pushes backup archives to it on a schedule.
The backup server stores them, enforces a retention policy, and gives you a
clean web console (styled to match TS Pro) to browse and download what's there.

```
TSP portal  ──HTTPS──▶  TS Pro Backup server  ──▶  ./data/storage/
(your site)             (off-site companion)        (encrypted archives)
```

The headline feature is **end-to-end encryption**. Every TS Pro Backup *site*
gets its own keypair. Your portal encrypts each archive to that site's **public
key** *before it leaves your server*, and only the matching **private key** —
which you hold, and the backup server never sees — can decrypt it. The backup
server stores nothing but ciphertext. Even if it is fully compromised, your
backups stay private.

!!! note "This is the off-site layer, not a replacement for local snapshots"
    Keep using **Settings → Data → Export** and the local snapshots described in
    [Backup &amp; Restore](/docs/backup-restore) for quick, same-machine
    recovery. TS Pro Backup is the *additional*, off-site layer for when the
    whole machine is gone. The two complement each other.

This guide has four parts:

1. **[Stand up the backup server](#part-1-stand-up-the-backup-server)** on an off-site host with Docker Compose.
2. **[Put HTTPS in front of it](#part-2-put-https-in-front-of-the-server)** with a reverse proxy.
3. **[Create a site and copy its keys](#part-3-create-a-site-in-the-console)** in the backup server's console.
4. **[Connect Trusted Servants Pro](#part-4-connect-trusted-servants-pro)** so it backs up to the server automatically.

---

## Before you begin

You'll need:

- A **second host** to run the backup server on — separate from the machine
  running your portal. The whole value of off-site backup is that this box can
  survive your portal's machine dying, so put it somewhere independent: a small
  VPS on a different provider, a home server, a NAS that runs Docker, etc.
- **Docker and Docker Compose** installed on that host.
- A **domain name** you can point at the backup server (e.g.
  `backup.example.org`) so the portal can reach it over HTTPS.
- A little bit of **disk space** on the backup host — enough to hold as many
  archives as your retention policy keeps. A full portal bundle is the size of
  your database plus all uploads, so size the volume accordingly.

!!! tip "Where should the backup server live?"
    A cheap VPS on a *different* provider than your portal is the sweet spot — it
    keeps the two failure domains independent and costs only a few dollars a
    month. The server is a single lightweight container with a SQLite database;
    it needs almost no CPU or memory, only disk for the stored archives.

---

## Part 1: Stand up the backup server

TS Pro Backup ships as a published image on Docker Hub —
[`hyprlab/tspro-backup`](https://hub.docker.com/r/hyprlab/tspro-backup). You
don't have to clone anything to run it; a `docker-compose.yml` and a `.env` are
all you need.

### 1.1 — Create a working directory

On the **backup host**:

```bash
mkdir tspro-backup && cd tspro-backup
```

Everything for the server lives here: the compose file, your `.env`, and a
`./data` folder the container creates for its database and stored archives.

### 1.2 — Create `docker-compose.yml`

Create a file named `docker-compose.yml` with the following contents. It pulls
the published image — no source checkout required:

```yaml
services:
  tspro-backup:
    image: hyprlab/tspro-backup:latest
    container_name: tspro-backup
    ports:
      # The container always listens on 8000 inside; this publishes it on
      # 8095 of the host. In production a TLS reverse proxy (Part 2) sits in
      # front and the portal points at the https:// URL.
      - "${TSPB_PORT:-8095}:8000"
    volumes:
      - ./data:/data            # tspro_backup.db + storage/ + auto-generated keys
    environment:
      # Signs console sessions. REQUIRED — set a long random value in .env.
      - TSPB_SECRET_KEY=${TSPB_SECRET_KEY:?TSPB_SECRET_KEY must be set in .env}
      # First-boot console admin (ignored once the admin row exists).
      - TSPB_ADMIN_USERNAME=${TSPB_ADMIN_USERNAME:-admin}
      - TSPB_ADMIN_PASSWORD=${TSPB_ADMIN_PASSWORD:-admin}
      # Optional at-rest encryption passphrase for the storage volume.
      - TSPB_REST_PASSPHRASE=${TSPB_REST_PASSPHRASE:-}
      # Max single upload in MiB — whole-site bundles can be large.
      - TSPB_MAX_UPLOAD_MB=${TSPB_MAX_UPLOAD_MB:-8192}
      # Set to 1 ONLY for local HTTP testing without TLS.
      - TSPB_DEBUG=${TSPB_DEBUG:-0}
    restart: unless-stopped
```

A few things worth understanding:

- The container listens on **port 8000 inside**, published to **8095 on the
  host**. The server serves both its web console *and* its JSON backup API on
  this single port.
- The `./data` volume holds everything stateful: `tspro_backup.db` (sites,
  settings, and backup metadata), `storage/site-<id>/` (the stored archive
  blobs), and any auto-generated keys. Back this folder up the same way you'd
  back up any data directory.
- `restart: unless-stopped` keeps the server coming back after reboots.

!!! note "Building from source instead?"
    If you'd rather build the image yourself, clone the
    [tspro-backup repository](https://github.com/hyprlab/tspro-backup),
    uncomment `build: .` in the compose file, and start it with
    `docker compose up -d --build`.

### 1.3 — Create the `.env` file

The one value you **must** set is `TSPB_SECRET_KEY`. It signs the console login
session. Generate a strong, random value:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then create a file named `.env` next to your compose file:

```ini
# Signs console sessions. REQUIRED — paste the output of the command above.
TSPB_SECRET_KEY=replace-with-a-long-random-value

# First-boot console admin. Used only to create the initial admin account;
# change the password from the console afterwards (these are then ignored).
TSPB_ADMIN_USERNAME=admin
TSPB_ADMIN_PASSWORD=change-me-on-first-login

# Host port to expose the console on (container always listens on 8000).
TSPB_PORT=8095

# Optional: at-rest encryption passphrase for the storage volume. Leave blank
# to let the server generate a random key in ./data/rest.key. See the note
# below before you rely on this.
TSPB_REST_PASSPHRASE=

# Max single upload in MiB. Whole-site bundles can be large.
TSPB_MAX_UPLOAD_MB=8192

# Set to 1 ONLY for local plain-HTTP testing.
TSPB_DEBUG=0
```

!!! danger "Keep TSPB_SECRET_KEY private, and protect rest.key"
    Treat `TSPB_SECRET_KEY` like a password — **never commit `.env` to version
    control**, and `chmod 600 .env` on the host. Separately, if you use at-rest
    encryption, **back up `TSPB_REST_PASSPHRASE` (or `./data/rest.key`)**:
    losing it makes the stored archives unrecoverable at the storage layer. (The
    end-to-end layer from Part 3 is independent of this — more on the two layers
    below.)

### 1.4 — Start the server

```bash
docker compose up -d
```

The first boot creates the seed admin and initializes the database in `./data`.
Confirm it's running:

```bash
docker compose ps
docker compose logs -f      # Ctrl-C to stop following
```

The console is now reachable on **port 8095** of the host. From a browser on the
same network, open `http://<backup-host>:8095` — you should see the TS Pro
Backup login page. Sign in with the `TSPB_ADMIN_USERNAME` /
`TSPB_ADMIN_PASSWORD` you set above.

!!! warning "Don't stop here for production"
    Right now the console and API are served over plain **HTTP**. Your login
    cookie and the per-site API key would cross the network unencrypted, and the
    console sets `Secure` cookies that browsers won't send over plain HTTP
    anyway. Before you point your portal at it, continue to Part 2 and put HTTPS
    in front. (For a quick *local* test on a trusted LAN you can set
    `TSPB_DEBUG=1` and come back — but never run it plaintext in production.)

---

## Part 2: Put HTTPS in front of the server

Your portal authenticates to the backup server with a **Bearer API key**, and
you log into the console with a **session cookie**. Neither should ever travel
over plaintext HTTP. The standard fix is a reverse proxy that terminates TLS and
forwards to the server on `127.0.0.1:8095`.

Point a DNS record — e.g. `backup.example.org` — at the backup host first, then
pick one of the following.

### Option A — Caddy (automatic HTTPS)

Caddy fetches and renews a Let's Encrypt certificate for you with zero extra
config. In your `Caddyfile`:

```
backup.example.org {
    reverse_proxy 127.0.0.1:8095
}
```

Reload Caddy and you're done — `https://backup.example.org` now serves the
console with a valid certificate.

### Option B — nginx

If you already run nginx (with certificates from Certbot or similar), add a
`server` block for `backup.example.org`:

```
location / {
    proxy_pass http://127.0.0.1:8095;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;

    # Whole-site bundles can be large — don't let the proxy truncate uploads.
    client_max_body_size 8192m;
}
```

!!! tip "Raise the proxy's upload limit, or rely on chunked uploads"
    A full-portal archive (database + all uploads) can be several gigabytes. Make
    sure your reverse proxy's maximum request body size is at least as large as
    your bundles — `client_max_body_size` in nginx, or the default-generous
    Caddy. The portal also splits very large bundles into **chunked uploads**
    automatically, but giving the proxy headroom avoids surprises.

!!! tip "Lock the published port to localhost behind a proxy"
    Once a reverse proxy terminates TLS, you generally don't want the plaintext
    `8095` port reachable from the public internet. Either change the compose
    `ports` mapping to `127.0.0.1:8095:8000` (so only the proxy on the same host
    can reach it) or block `8095` at your firewall. Then leave `TSPB_DEBUG=0`.

Your backup server is now reachable at **`https://backup.example.org`**. That
HTTPS URL is the basis of what you'll give the portal in Part 4.

---

## Part 3: Create a site in the console

Open the console — `https://backup.example.org` in production — and sign in.
Everything in this part is done in the web interface; there are no JSON or env
files to edit.

### 3.1 — Change the admin password

If you're still on the seeded `change-me-on-first-login` password, change it now
from the console's account settings. The first-boot `.env` credentials are
ignored once the admin row exists, so this is your real login from here on.

### 3.2 — Review the server settings

On the **Settings** page you can configure server-wide behavior:

- **End-to-end encryption** is **required by default** and there's rarely a
  reason to change that — it's what makes the storage zero-knowledge.
- **Default retention** — a grandfather-father-son (GFS) policy: keep the last
  *N* daily, weekly, monthly, and yearly archives per site. Retention runs
  independently per scope, so a burst of frontend-only snapshots never evicts
  your whole-site backups. Set sensible defaults here; you can tune per-site
  later.
- **Encryption at rest** *(optional)* — streaming AES-256 on the storage volume,
  using a key the *server* holds. This is defense-in-depth for the disk and is
  **independent** of the end-to-end layer (with E2EE on, the bytes are already
  opaque to the server). Enable it if you want the volume encrypted even at rest.
- **Cloudflare Turnstile** *(optional)* — a bot challenge on the console login
  page. If you enable it, the server needs outbound HTTPS to
  `challenges.cloudflare.com`.

### 3.3 — Add a site and copy its keys

A **site** represents one portal pushing backups here. Go to **Sites → Add
site** and give it a name (e.g. your group's name). On creation the console
shows you two secrets **once**:

| Secret | Looks like | What it's for |
| --- | --- | --- |
| **API key** | `tspb_…` | The portal sends this as a Bearer token to authenticate every upload. You'll paste it into the portal in Part 4. |
| **Private key** | `tspsk_…` | The *only* thing that can decrypt this site's backups. The server never stores it. You'll need it to restore. |

Copy **both** now and store them somewhere safe — a password manager is ideal.

!!! danger "The private key is shown once and can never be recovered"
    The site's **private key** (`tspsk_…`) is the only thing that can decrypt the
    archives this site uploads, and the backup server *never keeps a copy* —
    that's exactly what makes the storage zero-knowledge. If you lose it, every
    backup stored for this site is **permanently unrecoverable**. Save it in your
    password manager *before* you leave this page.

The site's **public key** stays on the server. Your portal fetches it
automatically when you wire things up — you don't need to copy it by hand.

---

## Part 4: Connect Trusted Servants Pro

Now switch over to your **portal's** admin interface. The off-site backup setup
lives under **Settings → Data**, in the **Off-site backups** card.

Click **Set up off-site backup →** (or **Add another backup** if you already
have a target). This opens a short five-step wizard.

### Step 1 — Choose the backend

Give the target a **name** (just for you, e.g. "Off-site VPS"), then pick the
backend. Choose **TS&nbsp;Pro Backup** *(end-to-end encrypted)* — the option
described as pushing to a dedicated off-site server that can't read your
backups. Continue.

### Step 2 — Connection

Two fields, both verified against the keys you copied in Part 3:

| Field | What to enter |
| --- | --- |
| **Backup server API endpoint** | Your server's HTTPS address with the API base path, e.g. `https://backup.example.org/api/v1`. It must end in `/api/v1`. |
| **Site API key** | The `tspb_…` key you copied from the site in step 3.3. Stored **encrypted** on the portal. |

Then click **Test connection**. On success the portal fetches the site's public
key and shows its **encryption key fingerprint**:

> 🔑 Encryption key fingerprint: `…` — confirm this matches the backup server's
> console.

!!! tip "Verify the fingerprint"
    Compare the fingerprint shown in the portal against the one shown for the
    site in the backup server's console. Matching fingerprints confirm the portal
    is encrypting to the *right* key — a quick guard against a misconfigured URL
    or a man-in-the-middle. They should be identical.

### Step 3 — Schedule

Choose how often the portal pushes a backup. Pick a **preset** — *Top of every
hour*, *Every day at 03:00 UTC*, *Every day at 12:00 UTC*, *Every Sunday at
03:00 UTC*, *First of the month* — or select **Custom cron expression** and
enter a standard 5-field cron (`min · hr · day · mo · dow`), interpreted in the
site's timezone (set under **Settings → Timezone**).

Under **Retention — keep the last N archives**, set how many archives the portal
keeps on the remote; older ones are pruned from the remote after each successful
upload. (The backup *server* also applies its own GFS retention from step 3.2 —
the two layers stack, and whichever is stricter wins.)

### Step 4 — Encryption

For a TS Pro Backup target there's **nothing to configure here**. The wizard
confirms the destination is end-to-end encrypted automatically: every archive is
encrypted to the backup server's public key (it shows the fingerprint again)
before it leaves your portal, and you'll use the site's **private key** to
decrypt when restoring. Continue.

### Step 5 — Review &amp; enable

Review the summary — name, destination, encryption key, schedule, retention.
Leave **Run a first backup now** checked so you can confirm the whole path works
immediately, then click **Enable target**.

The first backup runs synchronously, so you'll see the result right on the page.
On success the target appears in the **Off-site backups** list with an **OK**
status pill and a "last run" timestamp; the scheduler then keeps running on the
cron you chose.

!!! tip "Confirm it landed on the server"
    Open the backup server's console and look at the site — you should see the
    archive you just pushed, with its size and timestamp. Seeing it there is
    proof the full path worked: portal → HTTPS → backup server → encrypted
    storage.

---

## Restoring from an off-site backup

When you need to recover, you download the archive from the backup server,
decrypt it with the site's private key, and import it into a portal.

1. In the portal, go to **Settings → Data → Off-site backups** and open the
   target's **Restore** view (also reachable from **Manage backups**). The portal
   lists the archives available on the server for this site.
2. Select the archive you want. Because the destination is end-to-end encrypted,
   you'll be asked for the **Private key** (`tspsk_…`) — the one you saved in
   step 3.3. It's used locally to decrypt and is **never uploaded**.
3. **Download selected archive.** You get a standard portal export `.zip`,
   decrypted.
4. To restore it *into a portal*, use **Settings → Data → Import** and select the
   downloaded `.zip`. The import replaces the database, `uploads/`, and the
   encryption key in place — see [Backup &amp; Restore](/docs/backup-restore)
   for exactly what import does and how it keeps the prior state aside.

!!! note "You can restore onto a brand-new server"
    This is the disaster-recovery path: stand up a fresh portal (see
    [Installation](/docs/installation)), then import a decrypted archive pulled
    from the backup server. As long as you have the site's **private key**, your
    backups are usable even if the original machine is gone for good.

---

## How it works under the hood

- **End-to-end encryption (E2EE).** Each site has an X25519 keypair. The portal
  encrypts every archive to the site's *public* key using an ECIES-style hybrid
  scheme (a fresh ephemeral key per archive + AES-256-GCM), streaming in blocks
  so even multi-gigabyte bundles encrypt with constant memory. The server only
  ever receives ciphertext, and its API **rejects any upload that isn't already
  encrypted**. Only the site's *private* key — which you hold — can decrypt.
- **Two backup scopes.** The server distinguishes **whole-site** backups
  (`full` — database + uploads + key seed) from **frontend-only** backups
  (`frontend` — just the public web frontend), and applies retention to each
  scope independently, so frequent frontend snapshots never push out your
  full-site archives.
- **Chunked uploads.** For bundles larger than a single request can carry behind
  a proxy body cap, the portal automatically splits the upload into chunks and
  the server reassembles them, so large whole-site backups don't fail at the
  proxy.
- **Two encryption layers, on purpose.** E2EE (above) is keyed to *you* and
  makes the storage zero-knowledge. The optional **at-rest** encryption from step
  3.2 is keyed to the *server* and protects the disk volume. They're independent;
  with E2EE on, the bytes are already opaque to the server regardless.

---

## Troubleshooting

!!! warning "Portal test fails with a connection or TLS error"
    The portal can't reach the API endpoint. Check that:

    - The **Backup server API endpoint** is the **HTTPS** URL and ends in
      `/api/v1` (e.g. `https://backup.example.org/api/v1`).
    - The URL resolves from the *portal* host — try
      `curl -I https://backup.example.org/api/v1/ping` from the portal box.
    - Your reverse proxy is up and its certificate is valid.
    - A firewall isn't blocking inbound 443 to the backup host.

!!! warning "Portal test fails with 401 (unauthorized)"
    The **Site API key** doesn't match. Re-copy the `tspb_…` key from the site in
    the backup server's console and paste it into **Site API key**. Note that
    generating a new key for the site in the console invalidates the old one
    immediately.

!!! warning "Fingerprint shown in the portal doesn't match the console"
    Stop and investigate — don't enable the target. A mismatch means the portal
    fetched a different public key than you expect (wrong server URL, a stale DNS
    record, or a proxy pointing somewhere unexpected). Fix the endpoint and test
    again until the fingerprints are identical.

!!! warning "A large backup fails partway through the upload"
    Almost always the reverse proxy's request-body limit is too small. Raise it
    (`client_max_body_size` in nginx) to comfortably exceed your bundle size, or
    confirm chunked uploads aren't being blocked by an intermediary. Also check
    that the backup host has enough free disk for the new archive plus what
    retention keeps.

!!! warning "Restore says the private key is wrong"
    The `tspsk_…` private key must be the one for *this* site, exactly as shown
    when the site was created. Keys aren't interchangeable between sites, and the
    server can't help — it never had a copy. Use the value from your password
    manager.

---

## Security notes

- **Always run the backup server behind TLS in production.** The Bearer key and
  console cookie must never cross plaintext. Leave `TSPB_DEBUG=0`.
- **Change the seeded admin password** immediately (step 3.1).
- **Keep `TSPB_SECRET_KEY` long, random, and stable**, and never commit `.env`.
- **Guard the site private keys.** They're your only way to read your backups,
  and the server can't recover them. A password manager entry per site is the
  right home.
- **If you use at-rest encryption, back up `rest.key` / `TSPB_REST_PASSPHRASE`**
  along with the volume — losing it makes the stored bytes unrecoverable at the
  storage layer, by design.
- **Back up the backup server's `./data` too.** It holds the site list, settings,
  metadata, and the stored archives. To migrate the server to a new host, stop
  the container and copy the whole `./data` directory.

## Next steps

- [Backup &amp; Restore](/docs/backup-restore) — local exports, imports, and
  what an import actually replaces.
- [Configuration &amp; Security](/docs/configuration) — the portal's own
  environment variables and how it encrypts stored credentials.
- [Email Relay](/docs/email-relay) — the other companion container, for hosts
  that block outbound SMTP.
- [Upgrading &amp; Uninstalling](/docs/upgrading) — staying current and clean
  teardown.

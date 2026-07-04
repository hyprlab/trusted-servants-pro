Title: Email Relay
Category: Configuration
Order: 2
Slug: email-relay
Icon: send
Summary: Stand up the TS Pro Relay container so your portal can send email even when your host blocks outbound SMTP ports — then connect your TS Pro install and your SMTP server.

Some hosts — most famously DigitalOcean droplets, but also many other cloud
providers — **block outbound SMTP ports** (25, 465, and 587) to cut down on
spam. On those hosts Trusted Servants Pro can't reach your mail server directly,
so password resets, access requests, contact-form notifications, and test emails
all silently fail to deliver.

**TS Pro Relay** solves this. It's a tiny companion container you run somewhere
that *does* have SMTP egress. Instead of talking SMTP itself, your portal POSTs
each message as JSON to the relay over **HTTPS**, and the relay performs the
actual SMTP delivery on its behalf.

```
TSP app  ──HTTPS──▶  TS Pro Relay  ──SMTP:587/465──▶  mail server
(no SMTP egress)     (companion)                      (Gmail, SES, …)
```

There are two big wins beyond just getting mail out:

- **Your SMTP password never touches the portal.** Credentials live only on the
  relay. The portal stores nothing but the relay's URL and an API key.
- **The relay can run anywhere.** Put it on a $4 VPS, a home server, or any box
  with port 587 open. The portal only needs to reach it over HTTPS.

!!! note "You only need this if your host blocks SMTP"
    If your portal already sends mail fine over **Direct SMTP** (the default),
    you don't need the relay at all. Reach for it only when outbound SMTP is
    blocked and your test emails never arrive. See
    [Configuration &amp; Security](/docs/configuration) for the standard,
    relay-free email setup.

This guide has four parts:

1. **[Stand up the relay container](#part-1-stand-up-the-relay-container)** on a host with SMTP egress.
2. **[Put HTTPS in front of it](#part-2-put-https-in-front-of-the-relay)** with a reverse proxy.
3. **[Configure the relay's SMTP server and API key](#part-3-configure-the-relays-smtp-server-and-api-key)** from its web interface.
4. **[Connect Trusted Servants Pro to the relay](#part-4-connect-trusted-servants-pro-to-the-relay).**

---

## Before you begin

You'll need:

- A **host with outbound SMTP access** to run the relay on. This can be the same
  machine as your portal *if* that machine can reach your mail server — but the
  whole point is usually that it can't, so this is typically a **second box**: a
  small VPS on a provider that doesn't block SMTP, a home server, or similar.
- **Docker and Docker Compose** installed on that host.
- Your **SMTP server details** — host, port, security mode (STARTTLS / SSL /
  none), username, and password. These are the same credentials you'd put into
  any email client.
- A **domain name** you can point at the relay (e.g. `relay.example.com`) so it
  can be reached over HTTPS in production.

!!! tip "Where should the relay live?"
    A common, reliable setup is a small VPS dedicated to the relay. It's a
    single lightweight container with a SQLite database — it needs almost no
    resources. Many groups run it on the cheapest tier their provider offers.

---

## Part 1: Stand up the relay container

The relay ships as a published image on Docker Hub —
[`hyprlab/tspro-relay`](https://hub.docker.com/r/hyprlab/tspro-relay). You
don't need to clone anything to run it; a `docker-compose.yml` and a `.env` are
enough.

### 1.1 — Create a working directory

On the relay host:

```bash
mkdir tspro-relay && cd tspro-relay
```

Everything for the relay lives here: the compose file, your `.env`, and a
`./data` folder the container will create for its database.

### 1.2 — Create `docker-compose.yml`

Create a file named `docker-compose.yml` with the following contents:

```yaml
services:
  relay:
    image: hyprlab/tspro-relay:latest
    # The relay serves BOTH the admin UI and the JSON send API on one port.
    # In production you put a TLS-terminating reverse proxy in front (Part 2)
    # and point the TSP app at the https:// URL.
    ports:
      - "0.0.0.0:8026:8000"
    environment:
      # Signs admin sessions AND derives the at-rest encryption key for the
      # stored SMTP password + API key. REQUIRED — set a long random value.
      - RELAY_SECRET_KEY=${RELAY_SECRET_KEY:?set RELAY_SECRET_KEY in .env}
      # First-boot admin login (ignored once the admin row exists).
      - RELAY_ADMIN_USER=${RELAY_ADMIN_USER:-admin}
      - RELAY_ADMIN_PASSWORD=${RELAY_ADMIN_PASSWORD:-admin}
      - RELAY_LOG_LEVEL=${RELAY_LOG_LEVEL:-INFO}
      # Set to 1 ONLY for local HTTP testing without TLS.
      - RELAY_INSECURE_COOKIES=${RELAY_INSECURE_COOKIES:-}
    volumes:
      - ./data:/data        # relay.db (settings, admin, transaction log)
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz',timeout=5).status==200 else 1)"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

A few things worth understanding:

- The container listens on **port 8000 inside**, published to **8026 on the
  host**. The relay serves both its admin web interface *and* the JSON send API
  on this single port.
- The `./data` volume holds `relay.db` — a SQLite database with the relay's
  settings, the admin account, and the transaction log. Back this folder up the
  same way you'd back up any data directory.
- The healthcheck lets Docker (and any orchestrator) know when the relay is
  ready and stays alive.

!!! note "Building from source instead?"
    If you'd rather build the image yourself, clone the relay repository and
    replace the `image:` line with `build: .`, then start it with
    `docker compose up -d --build`.

### 1.3 — Create the `.env` file

The one value you **must** set is `RELAY_SECRET_KEY`. It signs the admin login
session *and* derives the key that encrypts the stored SMTP password and API key
at rest. Generate a strong, random value:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then create a file named `.env` next to your compose file:

```ini
# Signs login sessions AND encrypts the stored SMTP password + API key.
# REQUIRED — paste the output of the command above.
RELAY_SECRET_KEY=replace-with-a-long-random-value

# First-boot admin login. Used only to create the initial admin account;
# change the password from the UI afterwards (these are then ignored).
RELAY_ADMIN_USER=admin
RELAY_ADMIN_PASSWORD=change-me-on-first-login
```

!!! danger "Keep RELAY_SECRET_KEY stable and private"
    Treat this like a password. **Never commit `.env` to version control**, and
    `chmod 600 .env` on the host. If you ever *rotate* this key, the relay can no
    longer decrypt its stored SMTP password and API key — you'll have to
    re-enter them in the UI. Lose it and you start over.

### 1.4 — Start the relay

```bash
docker compose up -d
```

Confirm it's running and healthy:

```bash
docker compose ps
```

The relay's UI and API are now reachable on **port 8026** of the host. From a
browser on the same network, open `http://<relay-host>:8026` — you should see
the relay's login page. Sign in with the `RELAY_ADMIN_USER` /
`RELAY_ADMIN_PASSWORD` you set above.

!!! warning "Don't stop here for production"
    Right now the interface and API are served over plain **HTTP**. The login
    cookie and the API key would cross the network unencrypted. Before you point
    your portal at it, continue to Part 2 and put HTTPS in front. (For a quick
    *local* test on a trusted LAN you can skip ahead and come back — but never
    run it plaintext in production.)

---

## Part 2: Put HTTPS in front of the relay

Your portal authenticates to the relay with a **Bearer API key**, and you log
into the relay's web interface with a **session cookie**. Neither should ever
travel over plaintext HTTP. The standard fix is a reverse proxy that terminates
TLS and forwards to the relay on `127.0.0.1:8026`.

Point a DNS record — e.g. `relay.example.com` — at the relay host first, then
pick one of the following.

### Option A — Caddy (automatic HTTPS)

Caddy fetches and renews a Let's Encrypt certificate for you with zero extra
config. In your `Caddyfile`:

```
relay.example.com {
    reverse_proxy 127.0.0.1:8026
}
```

Reload Caddy and you're done — `https://relay.example.com` now serves the relay
with a valid certificate.

### Option B — nginx

If you already run nginx (with certificates from Certbot or similar), add a
`location` block to the server that handles `relay.example.com`:

```
location / {
    proxy_pass http://127.0.0.1:8026;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

!!! tip "Lock the published port to localhost behind a proxy"
    Once a reverse proxy is terminating TLS, you generally don't want the
    plaintext `8026` port reachable from the public internet. Either change the
    compose `ports` mapping to `127.0.0.1:8026:8000` (so only the proxy on the
    same host can reach it) or block `8026` at your firewall.

Your relay is now reachable at **`https://relay.example.com`**. That HTTPS URL is
what you'll give the portal in Part 4.

---

## Part 3: Configure the relay's SMTP server and API key

Open the relay's web interface — `https://relay.example.com` in production — and
sign in. Go to the **Settings** page. Everything in this part is done in the UI;
there are no JSON or env files to edit.

### 3.1 — Change the admin password

If you're still on the seeded `change-me-on-first-login` password, change it now
under **Admin account** (username, current password, new password). The
first-boot `.env` credentials are ignored once the admin row exists, so this is
your real login from here on.

### 3.2 — Enter your SMTP server

In the **SMTP delivery** card, fill in your mail server details:

| Field | What to enter |
| --- | --- |
| **SMTP host** | Your mail server hostname, e.g. `smtp.gmail.com`, `email-smtp.us-east-1.amazonaws.com`. |
| **Port** | `587` for STARTTLS, `465` for SSL/TLS, `25` for unencrypted (rare). |
| **Security** | **STARTTLS (587)**, **SSL/TLS (465)**, or **None (plain)** — match your port. |
| **Username** | Your SMTP username (often your full email address, or an SES/API user). |
| **Password** | The SMTP password or app password. Stored **encrypted at rest**. |
| **Default From email** | Fallback sender address if a message doesn't specify one. |
| **Default From name** | Fallback sender display name. |
| **Allowed From** *(optional)* | A comma-separated allowlist of addresses/domains permitted as the From header. |
| **Max attachment size (MB)** | Reject messages whose attachments exceed this. Default 25. |

Click **Save SMTP settings**.

!!! tip "Use the Allowed From list"
    Set **Allowed From** to your real sender address or domain (e.g.
    `noreply@example.org` or `example.org`). The relay will then refuse to send
    mail claiming to be from anyone else — so even a leaked API key can't be used
    to spoof arbitrary senders. Leave it blank only if you have a reason to.

!!! note "Gmail and other providers need an app password"
    If your mail provider uses 2-factor authentication (Gmail, Outlook, etc.),
    your normal account password won't work for SMTP. Generate a dedicated
    **app password** in that provider's security settings and use it here.

### 3.3 — Copy the API key

In the **API key** card you'll find the shared secret your portal will send as a
Bearer token. Click **Reveal**, then **Copy** — you'll paste it into the portal
in Part 4. (You can **Generate new key** at any time, but doing so stops the
portal from sending until you update its stored key to match.)

### 3.4 — Send a test from the relay itself

Before involving the portal, prove the relay can talk to your mail server. In the
**Send a test email** card, enter a recipient address and click **Send test**.
The result is recorded in the relay's **Transaction Log** (the **Logs** page),
along with the SMTP status and any error.

- ✅ **Delivered?** Your SMTP settings are correct — move on to Part 4.
- ❌ **Failed?** The log shows the SMTP error. Common causes are a wrong
  password, the wrong port/security combination, or — if even the *relay* can't
  reach the mail server — the relay host *also* blocking outbound SMTP. (Run the
  relay somewhere that doesn't.)

!!! note "Optional: bot protection on the login page"
    The Settings page also offers **Cloudflare Turnstile** to challenge the
    relay's sign-in page. It's entirely optional. If you enable it, the relay
    needs outbound HTTPS to `challenges.cloudflare.com` to verify challenges.

---

## Part 4: Connect Trusted Servants Pro to the relay

Now switch over to your **portal's** admin interface. Open **Settings** and
select the **Domain / Email** tab.

1. **Sending method** → choose **API relay (HTTPS)**. Extra fields appear for the
   relay connection. (The default is **Direct SMTP**; switching to the relay is
   what routes mail through your new container.)
2. **Relay URL** → the HTTPS address of your relay, e.g.
   `https://relay.example.com`. No trailing path is needed — just the base URL.
3. **Relay API key** → paste the key you copied from the relay's Settings page in
   step 3.3. (Leave this blank on later edits to keep the existing key; the
   portal stores it **encrypted**, the same way the relay does.)
4. **From email** / **From name** → your sender identity. These apply in *both*
   transports, so the sender doesn't change when you switch to the relay.
5. Click **Save Email Settings**.

!!! note "From email / From name apply to both modes"
    The relay has its *own* Default From, used only as a fallback. Whatever you
    set here in the portal is what's sent on each message and takes precedence,
    so set your real sender identity in the portal.

### Send the end-to-end test

Still on the **Domain / Email** tab, use **Send Test**: enter a recipient and
send. This exercises the whole path — portal → HTTPS → relay → SMTP → mailbox.

Then confirm it from the relay side: open the relay's **Transaction Log**. A
successful test appears there with the sender, recipient(s), subject, and a
**sent** status. Seeing the message in that log is proof the portal reached the
relay and the relay delivered it.

Once the test arrives, you're done — every email the portal sends (password
resets, access requests, contact-form notifications, recovery-contact messages)
now flows through the relay.

---

## How it works under the hood

When the portal sends a message in relay mode, it POSTs JSON to the relay's
`POST /api/send` endpoint with the API key as a `Authorization: Bearer <key>`
header. The body carries the sender, recipients, subject, plain-text and
optional HTML bodies, an optional reply-to, and any attachments (base64-encoded).
The relay validates the key, checks the From against its allowlist, enforces the
attachment-size limit, performs the SMTP delivery, and logs the result. You don't
have to call this API yourself — the portal does it for you — but it's handy to
know when reading the transaction log.

The relay also exposes an unauthenticated `GET /healthz` liveness probe (used by
the Docker healthcheck) that reports whether SMTP and an API key are configured,
without leaking any secrets.

---

## Troubleshooting

!!! warning "Portal test fails with a connection or TLS error"
    The portal can't reach the relay URL. Check that:

    - The **Relay URL** is the **HTTPS** address and resolves from the portal
      host (`curl -I https://relay.example.com` from the portal box).
    - Your reverse proxy is up and its certificate is valid.
    - A firewall isn't blocking inbound 443 to the relay host.

!!! warning "Portal test fails with 401 (unauthorized)"
    The API key the portal sends doesn't match the relay's current key. Re-copy
    the key from the relay's **API key** card and paste it into **Relay API key**
    in the portal, then **Save Email Settings**. Remember: regenerating the key
    on the relay invalidates the old one immediately.

!!! warning "Portal test fails with 403 (From not allowed)"
    The relay's **Allowed From** list doesn't include the portal's **From
    email**. Add that address (or its domain) to **Allowed From** on the relay,
    or clear the list.

!!! warning "Portal test fails with 413 (attachments too big)"
    A message exceeded the relay's **Max attachment size (MB)**. Raise the limit
    on the relay, or send smaller attachments.

!!! warning "Relay's own test fails (502 / SMTP error)"
    The problem is between the relay and your mail server, not the portal. Open
    the relay's **Transaction Log** for the exact SMTP error, and re-check the
    SMTP host, port, security mode, username, and password in Part 3. If the
    relay host *also* blocks outbound SMTP, move the relay to a host that
    doesn't.

---

## Security notes

- **Always run the relay behind TLS in production.** The Bearer key and login
  cookie must never cross plaintext.
- **Change the seeded admin password** immediately (Part 3.1).
- **Keep `RELAY_SECRET_KEY` long, random, and stable** — rotating it invalidates
  the stored SMTP password and API key.
- **Use the Allowed From list** so a leaked key can't spoof arbitrary senders.
- **Back up the relay's `./data` folder** along with your portal data; it holds
  the encrypted SMTP credentials and the transaction log.

## Next steps

- [Configuration &amp; Security](/docs/configuration) — environment variables and how the portal encrypts its own stored credentials.
- [Backup &amp; Restore](/docs/backup-restore) — protect your portal's data.
- [Installation](/docs/installation) — the full portal deployment guide.

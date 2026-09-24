# Installing on a server

The one-command installer for Ubuntu 24.04, upgrades, disk usage and uninstalling. For a local or hand-written Docker setup, the [README](../README.md#quick-start) has the compose file.

`install.sh` in this repo is a turnkey installer that provisions Docker, writes a hardened `docker-compose.yml`, generates a `TSP_SECRET_KEY`, configures Caddy for TLS (Let's Encrypt or self-signed), and installs Watchtower so the portal picks up new releases automatically. Follow these steps on a fresh Ubuntu 24.04 server:

## 1. Provision a server

Spin up an Ubuntu 24.04 LTS instance on whatever provider you like (DigitalOcean, Hetzner, AWS Lightsail, bare metal, etc.). You'll need root or sudo access. The portal is happy on 1 vCPU / 1 GB RAM for small groups.

## 2. Point DNS at the server (required for Let's Encrypt)

If you want a real TLS certificate, the domain's DNS **must resolve to this server's public IP before you run the installer**. Let's Encrypt performs an HTTP-01 challenge on port 80 during issuance. If the hostname resolves anywhere else, the challenge fails and the portal is left unreachable over HTTPS.

Two gotchas:

- **Cloudflare users: set the record to "DNS only" (grey cloud), not proxied (orange cloud), during installation.** Cloudflare's proxy terminates TLS at its edge and intercepts port 80, which breaks the HTTP-01 challenge and returns one of Cloudflare's own IPs for the A record, so Let's Encrypt never sees the real server. You can flip the record back to proxied *after* the certificate is issued.
- If you don't have a domain, or don't want TLS, leave the installer's domain prompt blank. The installer then issues a self-signed cert (browser will warn on the first visit).

The installer runs a DNS pre-check: if the hostname you enter doesn't resolve to this machine's public IP, it falls back to a self-signed certificate automatically and prints instructions for re-enabling Let's Encrypt. Fix the DNS and rerun `install.sh` to switch to a real cert.

## 3. Run the installer

SSH in and run one of these from the server:

```bash
# Pipe directly from GitHub (recommended):
curl -fsSL https://raw.githubusercontent.com/hyprlab/trusted-servants-pro/main/install.sh | sudo bash

# Or clone and run locally if you'd rather read it first:
git clone https://github.com/hyprlab/trusted-servants-pro.git
cd trusted-servants-pro
sudo bash install.sh
```

The installer will:

1. Apt-update, install Docker Engine + the Compose plugin, and open UFW for 22/80/443.
2. Prompt for a **domain**: enter the hostname you set up in step 2, or leave blank for a self-signed cert.
3. Prompt for a **contact email** if you entered a domain (used for Let's Encrypt renewal notices).
4. Generate a random `TSP_SECRET_KEY` and write it to `/opt/tspro/.env` (mode `600`).
5. Pull `hyprlab/tspro:latest`, start the container, and wait for it to respond.

Typical runtime is 2–5 minutes on a fresh VM.

## 4. Sign in

The installer prints the portal URL when it's done (either `https://<your-domain>` or `https://<server-ip>`). Sign in with:

- Username: `admin`
- Password: `admin`

**Change the admin password immediately** from Settings → Users.

## 5. Optional: non-interactive installs

You can skip all prompts by passing env vars on the same line:

```bash
sudo TSP_DOMAIN=portal.example.org \
     TSP_ACME_EMAIL=you@example.org \
     TSP_ADMIN_PASSWORD='a-strong-password' \
     bash install.sh
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `TSP_INSTALL_DIR` | `/opt/tspro` | Where compose/data/backups live. |
| `TSP_IMAGE` | `hyprlab/tspro:latest` | Image tag to deploy. |
| `TSP_DOMAIN` | _unset_ | Public hostname. If set, Caddy requests a Let's Encrypt cert. |
| `TSP_ACME_EMAIL` | `admin@$TSP_DOMAIN` | Contact address for cert renewal notices. |
| `TSP_ADMIN_USERNAME` / `TSP_ADMIN_PASSWORD` / `TSP_ADMIN_EMAIL` | `admin` / `admin` / `admin@example.com` | Seeded on first boot only. |

## 6. Upgrading and day-to-day commands

Watchtower polls Docker Hub every 24 hours and restarts the `tspro` container when a new image is published, with no action needed. If you'd like to force an upgrade or inspect state:

```bash
cd /opt/tspro
docker compose ps                             # running containers
docker compose logs -f tsp                    # tail portal logs
docker compose pull && docker compose up -d   # upgrade now
docker compose down                           # stop everything
```

Back up `/opt/tspro/data/` (or use **Settings → Data → Export** from the UI) to preserve the SQLite database, uploads, and Fernet key.

### Keeping disk usage in check

The installer's `docker-compose.yml` is configured with three independent safeguards so an unattended box won't fill its own disk:

- **A daily image-prune janitor** (the `docker-prune` service) sweeps every image and build-cache entry unused for more than 72 hours, once a day. This is the real guarantee: it reclaims images **no matter how they were orphaned** (manual `docker compose pull`, re-tagged `:latest` churn, or partial pulls), which the next two safeguards don't cover on their own. *(The prune is host-wide, which is correct for a dedicated TSP host; don't add it on a shared host running other Docker stacks.)*
- **Watchtower removes the old image after each auto-update** (`WATCHTOWER_CLEANUP=true`). This only covers updates Watchtower itself performs. Anything pulled or re-tagged another way is left behind, which is why the janitor above exists. Without *either*, a long-running box can pile up *hundreds* of stale images.
- **Container logs are capped** (`max-size: 10m`, `max-file: 3` per service), so the default unbounded `json-file` driver can't grow without limit.

On top of these, the portal shows admins a **low-disk-space warning** (a banner on every admin page and an entry in the Notification Center) when the data volume or host disk crosses 85%, so you get runway to act before anything fails.

If you installed an **older release** (before these settings shipped) and your disk is filling up, you can reclaim space and adopt the new settings without a reinstall:

```bash
cd /opt/tspro
docker image prune -af        # delete every image not backing a running container
docker builder prune -af      # delete build cache
df -h /                        # confirm space is back
# Then refresh your compose with the current hardened version and restart:
docker compose pull && docker compose up -d
```

To pick up the prune janitor, `WATCHTOWER_CLEANUP`, and log-rotation settings on an existing install, re-run `install.sh` (it rewrites `docker-compose.yml` in place and preserves your `.env` and `data/`).

## 7. Uninstalling

`uninstall.sh` ships next to the installer and reverses what it did. Safe defaults: it stops and removes only the TSP containers, named volumes, and the install directory. Docker itself, the firewall, and base packages are left alone unless you ask.

```bash
# From a clone of the repo:
sudo bash uninstall.sh

# Or pipe directly from GitHub:
curl -fsSL https://raw.githubusercontent.com/hyprlab/trusted-servants-pro/main/uninstall.sh | sudo bash
```

You'll be asked to type `yes` before anything is removed. Add flags to go further:

| Flag | Effect |
| --- | --- |
| `-y`, `--yes` | Skip the confirmation prompt (required when piping from curl non-interactively). |
| `--keep-data` | Preserve `/opt/tspro/data/` (database, uploads, `zoom.key`). |
| `--purge-images` | Also `docker image rm` the pulled TSP, Caddy, and Watchtower images. |
| `--remove-ufw-rules` | Revert the 80/tcp and 443/tcp UFW rules. OpenSSH is left intact so you don't lock yourself out. |
| `--remove-docker` | Purge `docker-ce` + the Compose plugin, remove the apt source and keyring the installer added, and delete `/var/lib/docker`. |
| `--nuke` | Shorthand for `--purge-images --remove-ufw-rules --remove-docker`. |

Full teardown of everything the installer put on the server:

```bash
sudo bash uninstall.sh --nuke --yes
```

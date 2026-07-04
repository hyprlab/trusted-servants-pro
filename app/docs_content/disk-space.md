Title: Disk Space & Housekeeping
Category: Operations
Order: 3
Slug: disk-space
Icon: database
Summary: How Trusted Servants Pro keeps an unattended server from filling its own disk — the daily image-prune janitor, capped container logs, a low-disk warning for admins, and the dashboard Disk tile — plus how to adopt the safeguards on an older install.

A self-hosted portal is meant to run for months without anyone logging into the
host. The risk over that timescale isn't the application — it's the *box*
slowly filling its own disk until every disk-backed operation fails at once:
off-site backups stop with `database or disk is full`, uploads fail, and even
`docker compose pull` reports `no space left on device`.

Two things cause this on a long-lived Docker host, and both happen quietly:

- **Stale images pile up.** Every automatic update leaves the previous image
  behind, and manual `docker compose pull` or `:latest` re-tags orphan more. A
  box left alone for a year was observed holding **170 images (~20 GB
  reclaimable)** on a 24 GB disk.
- **Container logs grow without limit.** Docker's default `json-file` log driver
  is unbounded, so a chatty container's logs can reach multiple gigabytes.

Trusted Servants Pro ships safeguards against both, plus a heads-up long before
the disk is actually full. This guide explains each one and how to turn them on
for an install that predates them.

!!! note "New installs are already protected"
    If you ran the [one-command installer](/docs/installation#path-a-one-command-installer-production-https)
    or used the production [`docker-compose.deploy.yml`](https://github.com/hyprlab/trusted-servants-pro/blob/main/docker-compose.deploy.yml),
    every safeguard below is already in place. The section on
    [adopting them on an older install](#adopting-the-safeguards-on-an-existing-install)
    is for servers set up before these shipped.

## The three deployment safeguards

The installer's generated `docker-compose.yml` (and the production
`docker-compose.deploy.yml`) carry three independent layers of protection. They
overlap on purpose — each covers a gap the others don't.

### 1. The daily image-prune janitor

A small sidecar service, `docker-prune`, runs once a day and sweeps every image
and build-cache entry unused for more than 72 hours:

```yaml
  # Daily image-prune janitor — an independent safety net for disk growth.
  docker-prune:
    image: docker:cli
    container_name: tspro-prune
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        while true; do
          docker image prune -af --filter "until=72h" || true
          docker builder prune -af --filter "until=72h" || true
          sleep 86400
        done
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

This is the real guarantee against the disk-fill failure mode. Unlike
Watchtower's cleanup (below), it reclaims images **no matter how they were
orphaned** — manual pulls, re-tag churn, partial pulls — not just the ones a
Watchtower-performed update left behind.

!!! warning "The prune is host-wide — use a dedicated TSP host"
    `docker image prune` operates on the **whole Docker daemon**, not just the
    TSP stack. That's exactly what you want on a box dedicated to Trusted
    Servants Pro, but it would also remove unused images from any *other* project
    on the same host. For that reason the janitor is **not** included in the
    development `docker-compose.yml` — only in the installer output and the
    production deploy file. Don't add it on a shared machine.

### 2. Watchtower removes the old image after each update

The installer sets `WATCHTOWER_CLEANUP=true`, so Watchtower deletes the
superseded image immediately after it performs an auto-update. This only covers
updates Watchtower *itself* performs — anything you pull or re-tag by hand is
left for the janitor above to collect. Without *either*, a long-running box
accumulates one stale image per daily update indefinitely.

### 3. Container logs are capped

Every service in the compose file pins the log driver to a bounded size:

```yaml
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

That caps each container at 30 MB of rotated logs (3 × 10 MB) instead of letting
the default unbounded driver grow forever.

## The low-disk warning

Safeguards reduce the risk; the warning gives you runway if something still
trends toward full. When the **data volume** (where the database, uploads, and
backups live) or the host root crosses **85%** used, admins see:

- A **"Low disk space" banner** at the top of every admin page, showing how much
  space is left.
- A matching **Low disk space** entry in the **Notification Center**, with the
  live figures.

Both are **admin-only** — editors, viewers, and anonymous visitors never see
them. The check is cached (so it costs nothing per page) and the warning clears
on its own once you free space back below the threshold.

!!! tip "85% is deliberately early"
    The threshold trips well before the disk is actually full, so you have time
    to act — prune images, expand the volume, or trim old backups — before
    backups, uploads, or updates can start failing.

## The Disk tile on the dashboard

For an at-a-glance read without waiting for the warning, the admin **Server**
panel on the dashboard (*Dashboard → "Your Role and Server Stats"*) shows a
**Disk** tile beside CPU and Memory. It reports percent used plus `used / total`
(e.g. "92 GB / 196 GB") with a sparkline, measured on the **data volume** — the
disk that actually fills. The tile turns **amber at 85%**, the same point the
low-disk warning trips, so the dashboard doubles as a live disk monitor. Like
the rest of the Server panel, it's visible to admins only.

## Where backups stage their scratch files

Building an off-site backup needs temporary room for a `VACUUM`-copied database
and the in-progress archive. Trusted Servants Pro stages these scratch files on
the **data volume** — the same mount that holds `tsp.db` and `uploads/`, where
headroom is guaranteed — rather than the system temp dir (`/tmp`), which on many
hosts is a small tmpfs or a space-constrained overlay. This is why a healthy
data volume matters for backups, not just for stored content.

If you mount a dedicated scratch disk and would rather stage there, point
`TSP_TMP_DIR` at it (see [Configuration](/docs/configuration#environment-variables)).
If the directory you choose isn't writable, the portal falls back to the system
temp dir automatically.

## Adopting the safeguards on an existing install

If you installed an **older release** — before these settings shipped — and your
disk is filling up, you can reclaim space and adopt the safeguards **without a
reinstall**. Your `.env` and `data/` are preserved.

First, clear out what's already accumulated:

```bash
cd /opt/tspro                 # or wherever your compose file lives
docker image prune -af        # delete every image not backing a running container
docker builder prune -af      # delete build cache
df -h /                       # confirm space is back
```

Then adopt the hardened compose. `docker compose pull` only updates *images* —
it never rewrites your compose file — so re-run the installer, which rewrites
`docker-compose.yml` in place (preserving `.env` and `data/`) to add the prune
janitor, `WATCHTOWER_CLEANUP`, and log rotation:

```bash
curl -fsSL https://raw.githubusercontent.com/hyprlab/trusted-servants-pro/main/install.sh | sudo bash
```

After it finishes, confirm the janitor is running alongside the portal:

```bash
docker compose ps             # you should see tspro and tspro-prune
```

## Next steps

- [Installation](/docs/installation) — the production installer and the Compose
  path, both of which set these safeguards up.
- [Configuration &amp; Security](/docs/configuration) — every environment
  variable, including `TSP_TMP_DIR`.
- [Backup &amp; Restore](/docs/backup-restore) — local exports and restores.
- [Off-site Backups with TS Pro Backup](/docs/tspro-backup) — encrypted,
  scheduled, off-machine backups.

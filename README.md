# Trusted Servants Pro

A self-hosted portal for recovery-fellowship trusted servants and members: run your public website, organize meetings, share readings and files, manage Zoom host accounts and collect access requests, all from one admin, with no command line required.

Flask + SQLAlchemy + SQLite, packaged to run in a single Docker container with a persistent volume.

## Highlights

- **Public website.** A themeable public site with a page builder, header and footer studios, mega menus, forms and popups, each edited beside a live preview. Build it on a Staging copy and push it to Live over the network.
- **Meetings.** In-person, online and hybrid meetings with schedules, Zoom details, libraries and files. The public schedule marks meetings happening now.
- **Libraries.** Readings, scripts and service documents as files, links or text, public or members only, with categories and drag-to-order.
- **File Browser.** Every upload in one place, with a view of each file beside its details and everywhere it's used. Public links read `/pub/<filename>`, with no hashes or tokens.
- **Announcements, events, stories and blog.** Written in Markdown with a formatting toolbar and live preview. Visitors can submit events and stories for review.
- **Watchtower.** Visitor metrics, missing pages, failed sign-ins, IP blocking, access requests and the Delete Log in one place.
- **Access requests.** Visitors ask for an account from the sign-in page or a popup on the public site. New accounts start as Viewer and join the trusted servants email list.
- **Roles and security.** Admin, editor and viewer roles with per-module access and two-factor sign-in. Zoom, email and backup credentials are encrypted.
- **Zoom accounts.** Host credentials assigned to meetings, with a weekly calendar showing each account's free time and overlaps. Online meeting pages give members what they need to fetch one-time passcodes.
- **Backups.** Daily snapshots, scheduled off-site backups (end-to-end encrypted to TS Pro Backup, or SFTP, FTP or Dropbox) and a one-screen restore. A full export and import moves a portal between servers.
- **Email List.** Send Markdown updates to trusted servants by group, with a delivery record for every copy.
- **Alert bar.** Admins post a message to everyone signed in, on the dashboard, above the top bar or in the sidebar.
- **Lists.** Every list has live search, filters with counts, sort, list or grid views and bulk actions. On a phone the filters fold away.
- **Dashboard.** Widgets you can switch on and drag into order, with a server overview for admins.
- **Appearance.** Light, dark or follow-system for each user, and a branded sign-in screen with particle effects.
- **Settings.** Users, locations and officers, modules, email, timezone, security and data in one window with one save bar.

## Quick start

```bash
docker compose up -d --build
```

Open http://localhost:8090 and sign in with the admin account seeded on first boot. Set `TSP_ADMIN_PASSWORD` in `.env` before first run: without it the app refuses to boot on an empty database. For local development, set `TSP_DEBUG=1` in `.env` instead: that serves over plain HTTP (no Secure cookie flag) and falls back to seeding `admin` / `admin`. Never run production with `TSP_DEBUG=1`.

### docker-compose.yml

```yaml
services:
  tsp:
    image: hyprlab/tspro:latest
    container_name: tspro
    ports:
      - "8090:8000"
    volumes:
      - ./data:/data
    environment:
      - TSP_SECRET_KEY=${TSP_SECRET_KEY:?TSP_SECRET_KEY must be set in .env}
      - TSP_ADMIN_USERNAME=${TSP_ADMIN_USERNAME:-admin}
      - TSP_ADMIN_PASSWORD=${TSP_ADMIN_PASSWORD:-}
      - TSP_ADMIN_EMAIL=${TSP_ADMIN_EMAIL:-admin@example.com}
      - TSP_DEBUG=${TSP_DEBUG:-0}
    restart: unless-stopped
    # Cap container logs so an unattended box can't fill its disk over
    # time (the default json-file driver is unbounded).
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

## Documentation

- [Installing on a server](docs/INSTALL.md): the one-command Ubuntu installer, upgrades, disk usage, uninstalling.
- [Documentation](docs/DOCUMENTATION.md): configuration, security, local development, backups, project layout.
- [Contributing](docs/CONTRIBUTING.md) and [Releasing](docs/RELEASING.md): conventions and the release procedure.
- [Release notes](RELEASE_NOTES.md) and the technical [changelog](CHANGELOG.md).

## AI notice

Trusted Servants Pro is built by a human maintainer working with generative AI as a development tool:

- **Code:** the large majority of the Python, JavaScript, and CSS in this repository was written with Anthropic's Claude (via Claude Code), working from the maintainer's direction. The maintainer decides what gets built, reviews the results, tests every release, and signs off on everything that ships.
- **Text:** documentation, release notes, and in-app copy are largely AI-drafted and human-edited.
- **The app itself contains no AI.** Trusted Servants Pro has no AI features and makes no requests to AI services, so your fellowship's documents and member data never leave your server for one. AI was used to *build* the app, not to run it.

Bug reports and pull requests are welcome from humans and their AI tools alike; everything merged gets the same human review.

## License

Trusted Servants Pro is released under the [GNU Affero General Public License v3.0](LICENSE) (AGPLv3).

You're free to run, copy, modify, and redistribute the portal. If you host a modified version for other users to interact with over a network, you must make the corresponding source code available to those users under the same license. See the `LICENSE` file for the full text.

© Hyprlab. Open-source contributions welcome.

## Third-party assets

- **Pattern Monster:** the "Pattern tile" dynamic background's 330 seamless
  SVG patterns are vendored from [pattern.monster](https://pattern.monster)
  ([source](https://github.com/catchspider2002/svelte-svg-patterns)), MIT
  licensed. Licence text: `app/dynbg_patterns.LICENSE.md`. Refresh with
  `python scripts/import_pattern_monster.py`.

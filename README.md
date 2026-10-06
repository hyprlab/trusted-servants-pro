# Trusted Servants Pro

A self-hosted portal for recovery-fellowship trusted servants and members: organize meetings, share readings and files, manage Zoom host accounts, collect access requests, and brand it to your group, all from a single admin UI, no command line required.

Flask + SQLAlchemy + SQLite, packaged to run in a single Docker container with a persistent volume.

## Highlights

### Meetings
- Full create / edit / archive / restore with per-meeting logo and alert banner.
- In-person, online, and hybrid types with matching zoom/address fields shown conditionally.
- Unlimited per-day schedules (day-of-week + start time + duration + optional "opens" time).
- A list with a sidebar of live search, filters (status, type, the day they meet) with counts, sort, and list or grid views; each meeting is edited on its own page.
- Attach any number of libraries with `all` or `granular` visibility so each meeting can show just the readings it uses.
- Meeting detail page: schedule table, Zoom info (meeting ID, passcode, link, host account) with click-to-copy and Reveal controls, embedded OTP email credentials for hybrid/online meetings, and per-category file lists (documents, scripts, links, videos, images).

### Libraries
- Grouped reading collections with optional alert banner and description.
- Drag-and-drop ordering, inline edit, thumbnail support, optional inline body text, and external-link entries.
- File uploads or existing-asset selection from the File Browser.
- The same list layout as Meetings, with a back link from a library to all libraries.

### File Browser
- Central media library indexed from every upload across the app (`MediaItem` auto-backfilled on startup).
- A sidebar of live search, upload, kind of file and uploader filters with counts, sort, and list or grid views; rename, and delete with a reference-count guard.
- Opening a file shows it in the page, without a reload: images (zoom in place with click, wheel or pinch), PDFs, video and audio, beside its details: the full link (click to copy), kind, format, size, image dimensions and camera data, uploader, and every meeting, library, post, story or page that uses it. Previous and Next step through the list in its order.
- Public shareable URLs at `/pub/<original-filename>`: human-readable, no hashes or tokens. Serves the newest file of that name with the correct `Content-Disposition`.
- Inline **Copy Link** buttons everywhere a file appears (File Browser, Meetings, Libraries).

### Access Requests
- Request Access on the login screen and as a popup on the public site (from the mega menu and the footer, beside Login) captures name, phone, email, role(s), meeting and an optional message, with a honeypot and optional Turnstile.
- New accounts default to Viewer, and every new user is added to the trusted servants email list.
- Submissions emailed to a configurable recipient list via the portal's SMTP settings.
- Admin-only Access Requests page (sidebar with pending-count badge) for triage: Mark Handled / Reopen / Delete.
- Recent requests widget on the dashboard.

### Zoom accounts
- Encrypted credential storage (Fernet with a local key file, see [Security](docs/DOCUMENTATION.md#security)).
- Assign any account to any meeting schedule.
- Weekly assignment calendar starting Sunday, with automatic time-conflict detection (overlapping slots on the same account highlighted red).
- Separate OTP email credentials shown to members on online/hybrid meeting pages so they can retrieve one-time codes without admin involvement.
- Viewable by editors and viewers (read-only); admin-only for create/edit/delete.

### Login experience
- Redesigned split login screen with animated canvas particle background.
- Nine selectable effects: Off, Network, Starfield, Fireflies, Bubbles, Snow, Waves, Orbits, Rain.
- Adjustable **speed** and **particle size** sliders, **mouse-reactive physics**, live preview inside Settings.
- Configurable background: default sine-wave gradient, solid color, or custom gradient with 2–4 color stops and a palette randomizer.
- Optional 3D **login transition**: doors swing open on successful authentication to reveal a moving full-saturation sine-wave rainbow with the branding logo, then fades to the active theme's background before the next page loads.
- Light or dark carries through: the login screen follows the same choice before paint.

### Appearance & branding
- Each user picks Light, Dark, or Follow system for their own account, on any device they sign in from.
- Unified accent color (`#0b5cff`) across buttons, links, and active nav states.
- Inter font (weights 100–900) shipped app-wide.
- Admin-configurable sidebar footer logo (upload + width slider + link URL) and login screen (particles, background, transition).

### Dashboard
- Stats row (meeting count, library count, your role).
- Configurable widgets: Recent Meetings, Libraries, Recent Files, Intergroup, Public Information Chair contact, Access Requests (admin).
- Each widget toggleable from the Customize Dashboard modal and reordered by dragging; every widget shares one layout.

### Settings
- A window with a section list on the left (on a phone, a list that slides to each section) and one save bar for every section.
- Sections: **Appearance** (light or dark, branding, login screen), **Your Access**, **Users**, **Global** (locations, officers, fellowships), **Sidebar**, **Modules**, **Domain / Email**, **Timezone**, **Alert Bar**, **Security**, **Data**, **About**.
- **Alert Bar:** admins post a message to signed-in users on the dashboard, above the top bar, or at the foot of the sidebar, in a tone they choose, optionally dismissible, with an expiry and a details window written in Markdown with a live preview.
- Role gating: admins see everything; editors and viewers see Appearance, Your Access, and About.

### Email
- Global SMTP configuration (host, port, username/password, STARTTLS / SSL / plain).
- Encrypted password storage using the same Fernet key as Zoom credentials.
- Configurable From name + address, comma-separated recipient list for access-request notifications, and a one-click Send Test button.

### Data export / import
- One-click **Export** produces a zip containing a VACUUM-copied SQLite database, every upload, and the `zoom.key` file used to decrypt stored Zoom credentials.
- One-click **Import** takes an export archive, validates it, moves the existing database + uploads + key to a timestamped `backup-YYYYMMDD-HHMMSS/` folder inside `./data`, restores the archive in place, re-runs migrations, and signs the user out. No command-line access required.

### Frontend staging sync
- Build your public website on a separate **Staging** copy of the app and move it to your **Live** site over the network, with no bundle to download and re-upload. Only the frontend travels (theme, navigation, mega-menus, layouts, fonts, icons, page-builder Pages, and the assets they reference); recovery Stories, users, meetings, libraries, and uploads on the receiving side are never touched.
- A role-aware setup wizard (Settings → Data → **Frontend staging sync**) asks whether each install is the Live site or the Staging copy and shows only that side's fields. The Live site mints a shared token and is set to receive; the Staging copy pastes the token, points at the Live URL, tests the connection, then pulls or pushes. Pairing is a single Fernet-encrypted shared secret authenticated in both directions, with rate-limiting and a `REPLACE`-style confirm; the receiving side auto-saves a rollback snapshot before applying.
- On the Staging copy, the **Web Frontend → Overview** Status card gains one-click **Pull from Live** / **Push to Live** controls with a live connection indicator, so you can deploy without opening Settings.

### Session
- 6-month remember-me cookie so users aren't repeatedly prompted for credentials.

### Mobile
- Dedicated mobile layouts across the app; list filters fold behind a Filters button so the list comes first.
- Stacked "data cards" replace overflowing tables, actions expand to full width.
- Sidebar is a slide-in drawer with tap-outside-to-close.

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

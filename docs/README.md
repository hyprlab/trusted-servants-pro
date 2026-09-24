# Documentation

The README is the front door. Everything else lives here, and every file in
this directory is listed below; `tools/check-docs.py` fails if one is not.

| File | What is in it |
| --- | --- |
| [INSTALL.md](INSTALL.md) | The one-command Ubuntu installer, upgrades, disk usage, uninstalling |
| [DOCUMENTATION.md](DOCUMENTATION.md) | Configuration, security, local development, backups, project layout |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Commits, prose style, code, credit, issue replies |
| [RELEASING.md](RELEASING.md) | SemVer, when releases happen, and the ship procedure |
| [CREDITS.md](CREDITS.md) | Who contributed what |

## Where a new piece of documentation goes

| What you have | Where it goes |
| --- | --- |
| A feature worth pitching | The README's Highlights, only if it earns the space |
| Installing or upgrading a server | [INSTALL.md](INSTALL.md) |
| How to configure or run something | [DOCUMENTATION.md](DOCUMENTATION.md) |
| A convention for anyone editing the repository | [CONTRIBUTING.md](CONTRIBUTING.md) |
| A change to how releases are made | [RELEASING.md](RELEASING.md) |
| Credit for somebody's work | `CONTRIBUTORS` for the name, [CREDITS.md](CREDITS.md) for the work |
| What changed in a release, for users | [RELEASE_NOTES.md](../RELEASE_NOTES.md) |
| What changed in a release, technically | [CHANGELOG.md](../CHANGELOG.md) |
| Images | `app/static/`, never `docs/`, which holds Markdown only |

A new `docs/*.md` must be added to the first table and linked from somewhere
it will be found.

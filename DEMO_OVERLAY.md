# Demo overlay (the `demo` branch)

This branch is **`main` + a thin demo overlay**. It exists only on the `demo`
branch — `main` stays clean. Keep it in sync by merging `main` in:

```bash
cd /home/jason/tspro-demo      # the demo worktree (branch: demo)
git fetch
git merge main                 # pull every main change into the demo
```

Because the overlay is almost entirely **new files**, merges are usually
conflict-free. The only files shared with `main` are a handful of small,
clearly-marked edits (see below); a conflict can only happen if `main` changes
those exact lines.

## Demo-only files (pure additions — never on `main`)

```
app/demo.py                              per-session DB + uploads isolation engine
app/demo_seed.py                         seeds the demo fellowship (Meridian Recovery Collective)
app/product.py                           product marketing blueprint + demo entry routes
app/docs.py                              the docs site at /docs (renders app/docs_content/)
app/docs_content/*.md                    the docs site's guides
app/templates/product/docs_*.html        docs site pages
app/static/js/docs.js                    docs site search and navigation
app/feature_request.py                   the feature request form
app/templates/product/_feature_request.html, app/static/js/feature_request.js
app/static/img/logo_tspro_teal.svg       the marketing page's logo
app/templates/product/landing.html       the marketing homepage
app/templates/product/_demo_banner.html  the per-page demo banner
app/static/css/product.css               marketing page styles (light + dark)
app/static/js/product.js                 marketing page interactions + theme toggle
app/static/img/product/*.png             real screenshots of the live demo (see regen below)
docker-compose.demo.yml                  demo deployment (sets TSP_DEMO_MODE=1)
demo/run-demo.sh                         one-command launch
demo/screenshots.js                      regenerates the marketing screenshots (puppeteer)
demo/README.md                           demo deployment docs
DEMO_OVERLAY.md                          this file
```

The marketing page uses the existing TS Pro logos (`app/static/img/logo_tspro_white.svg`
for dark, `logo_tspro_about.svg` for light) — those already ship on `main`, so they're
not part of the overlay.

### Regenerating the marketing screenshots

The screenshots in `app/static/img/product/` are captured from the running demo with a
headless browser. To refresh them after a UI change:

```bash
# with the demo running (e.g. on :8095):
docker run --rm --network host -w /home/pptruser \
  -e NODE_PATH=/home/pptruser/node_modules \
  -v "$PWD/demo/screenshots.js":/shot.js:ro \
  -v "$PWD/app/static/img/product":/out \
  ghcr.io/puppeteer/puppeteer:latest node /shot.js
```

`DEMO_BASE` sets the demo's address (the script defaults to `:8090`); edit the
shot list in `demo/screenshots.js` to change what's captured. The container's
user can't write into the repository, so capture into a world-writable folder
and copy the files in:

```bash
mkdir -p /tmp/demo-shots && chmod 777 /tmp/demo-shots
docker run --rm --network host -w /home/pptruser \
  -e NODE_PATH=/home/pptruser/node_modules -e DEMO_BASE=http://localhost:8095 \
  -v "$PWD/demo/screenshots.js":/shot.js:ro -v /tmp/demo-shots:/out \
  ghcr.io/puppeteer/puppeteer:latest node /shot.js
cp /tmp/demo-shots/*.png app/static/img/product/
```

## The seed on every boot

`seed_demo_data()` fills an empty golden database once. On every later boot it
still adds the File Browser's sample files if they're missing (a flyer, a photo
with camera details, a PDF guide and a CSV, drawn with Pillow) and moves the
seeded events and announcements forward, so the events stay upcoming however
long ago the golden database was made. Visitor analytics are regenerated on
every boot as well (`refresh_demo_metrics`).

## The docs site's links

Main's `tools/check-docs.py` (run by the commit hook) checks every link in every
Markdown file, these guides included. So guides link to each other as files,
`installation.md#section`, which `app/docs.py` turns into `/docs/installation#section`,
and a link to another page of the site is written `site:/demo`. Keep headings
free of characters GitHub and Python-Markdown slug differently (an em dash, `+`),
or an anchor that checks on one won't land on the other.

## Shared files with overlay edits (the only merge friction)

Every edit is wrapped in `>>> TSP demo overlay … <<<` (or `{# TSP demo overlay #}`)
markers and is a **no-op on a normal install**, so they're safe and easy to spot.

| File | Edit | Why it's harmless on `main` |
|------|------|-----------------------------|
| `app/__init__.py` | 4 blocks behind `if demo_mode` (engine config, install/register, seed + analytics-refresh call, skip backups) | All gated on `TSP_DEMO_MODE`; off by default |
| `app/templates/base.html` | `{% include 'product/_demo_banner.html' ignore missing %}` | `ignore missing` → renders nothing without the partial |
| `app/templates/frontend/base.html` | same include | same |
| `app/templates/frontend/headers/classic.html` | `href="{{ home_url or url_for('frontend.index') }}"` | `home_url` is unset off-demo → falls back to `url_for` |
| `app/templates/frontend/headers/recovery-blue.html` | same | same |
| `app/static/css/frontend.css` | appended `.fe-pp .fe-hero` full-bleed rule (+ `overflow-x: clip`) so page-builder heroes span full width | Additive rule at EOF; only affects page-builder hero blocks. When `main` appends rules at the end too, the merge conflicts there: keep both, with the overlay block last |

## The bugfix

The branch's first commit fixed a real bug in `app/__init__.py`'s `file_type`
filter (a `NameError` on any name without an extension, which broke `/library`
for text-only library items). It is on `main` since `2694a80`, so the two
branches no longer differ there.

## Running the demo

```bash
cd /home/jason/tspro-demo
bash demo/run-demo.sh           # → http://localhost:8090  (product page; /demo = live demo)
```

`TSP_DEMO_MODE` is the only switch. With it off, this tree behaves exactly like `main`.

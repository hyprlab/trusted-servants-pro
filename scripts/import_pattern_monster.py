# SPDX-License-Identifier: AGPL-3.0-or-later
"""One-off importer: vendor the Pattern Monster catalogue for the
"Pattern tile" dynamic background.

Pattern Monster (https://pattern.monster) publishes its pattern
library under the MIT licence in
https://github.com/catchspider2002/svelte-svg-patterns. This script
pulls `src/routes/_index.js` from that repo and writes the subset of
fields the app needs to `app/dynbg_patterns.json`, alongside the
licence text (MIT requires the copyright + permission notice to travel
with copies).

Re-run to refresh the catalogue:

    python scripts/import_pattern_monster.py

Requires the GitHub CLI (`gh`) to be installed and authenticated.
"""
import json
import subprocess
import sys
from pathlib import Path

REPO = "catchspider2002/svelte-svg-patterns"
ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "app" / "dynbg_patterns.json"
OUT_LICENSE = ROOT / "app" / "dynbg_patterns.LICENSE.md"


def fetch(path: str) -> str:
    return subprocess.check_output(
        ["gh", "api", f"repos/{REPO}/contents/{path}",
         "-H", "Accept: application/vnd.github.raw"],
        text=True,
    )


def main() -> int:
    src = fetch("src/routes/_index.js")
    raw = json.loads(src[src.index("["): src.rindex("]") + 1])
    patterns = []
    for p in raw:
        layers = [seg.strip() for seg in p["path"].split("~") if seg.strip()]
        patterns.append({
            "key": p["slug"],
            "name": p["title"],
            # 'fill' | 'stroke' | 'stroke-join' — decides which SVG
            # attributes get injected at render time (see dynbg.py).
            "mode": p["mode"],
            "w": p["width"],
            "h": p["height"],
            # Raw <path d='…'/> elements, one per ink colour.
            "layers": layers,
            "tags": p.get("tags", []),
            "max_stroke": p.get("maxStroke", 1),
        })
    OUT_JSON.write_text(json.dumps({
        "_source": f"https://github.com/{REPO} (src/routes/_index.js)",
        "_license": "MIT — see dynbg_patterns.LICENSE.md",
        "patterns": patterns,
    }, separators=(",", ":")) + "\n")
    OUT_LICENSE.write_text(
        "Pattern library vendored from Pattern Monster\n"
        f"https://pattern.monster · https://github.com/{REPO}\n\n"
        + fetch("LICENSE.md")
    )
    print(f"wrote {len(patterns)} patterns → {OUT_JSON.relative_to(ROOT)}")
    print(f"wrote licence → {OUT_LICENSE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env bash
# Set the version and turn both Unreleased sections into that version's.
#
#   tools/bump-version.sh 2.20.0
#
# CHANGELOG.md's "## [Unreleased]" becomes "## [X.Y.Z] — date"; RELEASE_NOTES.md's
# "## Unreleased" becomes "## X.Y.Z — date (latest)", and the previous heading
# loses its "(latest)". It edits __version__ in app/version.py and runs
# check-docs. It does not commit, tag or push: docs/RELEASING.md is the
# procedure around it.
set -euo pipefail
cd "$(dirname "$0")/.."

INIT=app/version.py
CURRENT=$(sed -n 's/^__version__ = "\(.*\)"/\1/p' "$INIT")
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "usage: tools/bump-version.sh X.Y.Z   (current: $CURRENT)" >&2
    exit 1
fi

python3 - "$CURRENT" "$VERSION" <<'PY'
import re, sys, datetime, pathlib
current, version = sys.argv[1], sys.argv[2]
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
if not SEMVER.match(version):
    sys.exit(f"'{version}' is not a release version (X.Y.Z, https://semver.org/).")

import importlib.util
spec = importlib.util.spec_from_file_location("check_docs", "tools/check-docs.py")
cd = importlib.util.module_from_spec(spec); spec.loader.exec_module(cd)
if cd.sort_key(version) <= cd.sort_key(current):
    sys.exit(f"{version} is not newer than {current}. A version never counts backwards.")
today = datetime.date.today().isoformat()

def unreleased(path, heading):
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^" + re.escape(heading) + r"[ \t]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    if not m:
        sys.exit(f"{path} has no '{heading}' section.")
    if not m.group(1).strip():
        sys.exit(f"{path}'s {heading} section is empty. Write the entries before bumping.")
    return text, m

cl = pathlib.Path("CHANGELOG.md")
rn = pathlib.Path("RELEASE_NOTES.md")
cl_text, cl_m = unreleased(cl, "## [Unreleased]")
rn_text, rn_m = unreleased(rn, "## Unreleased")

new = f"## [Unreleased]\n\n## [{version}] — {today}\n\n{cl_m.group(1).strip()}\n\n"
cl.write_text(cl_text[:cl_m.start()] + new + cl_text[cl_m.end():], encoding="utf-8")

rest = re.sub(r"^(##\s+\S+.*?)\s*\(latest\)", r"\1", rn_text[rn_m.end():], count=1, flags=re.M)
new = f"## Unreleased\n\n## {version} — {today} (latest)\n\n{rn_m.group(1).strip()}\n\n"
rn.write_text(rn_text[:rn_m.start()] + new + rest, encoding="utf-8")
PY

sed -i "s/^__version__ = \".*\"/__version__ = \"$VERSION\"/" "$INIT"
echo "$CURRENT -> $VERSION ($INIT, CHANGELOG.md, RELEASE_NOTES.md)"
python3 tools/check-docs.py

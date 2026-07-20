#!/usr/bin/env bash
# Vendors packages/kit from the upstream owner, ojusave/firstmile.
#
# packages/kit is owned by ojusave/firstmile. Never hand-edit it here. Make the
# change in a firstmile checkout, land it on firstmile main, then run this script
# to pull it down and commit the result.
set -euo pipefail

UPSTREAM_URL="https://github.com/ojusave/firstmile"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Add the upstream remote if missing; keep its URL correct otherwise (idempotent).
if git remote get-url upstream >/dev/null 2>&1; then
  git remote set-url upstream "$UPSTREAM_URL"
else
  git remote add upstream "$UPSTREAM_URL"
fi

git fetch upstream main
git checkout upstream/main -- packages/kit
git rev-parse upstream/main:packages/kit > .firstmile-kit-tree

echo "Synced packages/kit from upstream/main ($(cat .firstmile-kit-tree))."
echo "Review the diff, then commit packages/kit and .firstmile-kit-tree together."

#!/usr/bin/env bash
# What a version bump changes, measured in a tree with built images:
#   tasks/20261116-140453-buildtime-01/bump-proof.sh NEXT_VERSION
# Plans every image, moves page/version.mjs to NEXT_VERSION, writes the pins, builds the runtime
# and plans again; prints the files the bump changed, the image inputs before and after, and the
# plans' difference, and puts the version back.
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../.."
next="$1"
unset DISPLAY DOLLY_BUILD_IMAGES DOLLY_SNAPSHOT_IMAGE
[[ -z "$(git status --porcelain -- page/version.mjs)" ]] || { echo "page/version.mjs has changes" >&2; exit 1; }
before="$(mktemp)"; after="$(mktemp)"; status="$(mktemp)"
git status --porcelain > "${status}"
npm run -s image -- --plan < /dev/null | grep -E '^  (build|reuse) ' > "${before}"
inputs_before="$(cat dist/dolly-image-build-id.mjs)"
sed -i -E "s/^(export const DOLLY_VERSION = \")[^\"]*/\1${next}/" page/version.mjs
node scripts/update-recipe-pins.mjs < /dev/null
npm run -s build:runtime < /dev/null > /dev/null 2>&1
npm run -s lint:dollyfiles < /dev/null
npm run -s image -- --plan < /dev/null | grep -E '^  (build|reuse) ' > "${after}"
echo "files the bump changed:"
{ git status --porcelain | diff "${status}" - || true; } | sed -n 's/^> /  /p'
echo "image inputs before: ${inputs_before}"
echo "image inputs after:  $(cat dist/dolly-image-build-id.mjs)"
echo "plan: $(grep -c '^  reuse ' "${after}") reuse, $(grep -c '^  build ' "${after}") build of $(wc -l < "${after}") images"
if diff "${before}" "${after}" > /dev/null; then echo "plan after the bump: identical to the plan before it"
else echo "plan after the bump differs:"; diff "${before}" "${after}" || true; fi
git checkout -q -- page/version.mjs
npm run -s build:runtime < /dev/null > /dev/null 2>&1
rm -f "${before}" "${after}" "${status}"

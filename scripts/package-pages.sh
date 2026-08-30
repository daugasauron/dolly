#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:-${project_dir}/build/dolly-pages.tar.gz}"
staging="$(mktemp -d)"
trap 'rm -rf -- "${staging}"' EXIT

for required in \
  index.html \
  coi-serviceworker.js \
  src/browser.mjs \
  src/http-policy.mjs \
  src/runtime-worker.mjs \
  dist/dolly.mjs \
  dist/dolly.wasm \
  dist/dolly.data \
  dist/dolly-system.snapshot \
  dist/dolly-system-snapshot.mjs; do
  if [[ ! -f "${project_dir}/${required}" ]]; then
    echo "dolly: Pages artifact is missing ${required}" >&2
    exit 1
  fi
done

mkdir -p "${staging}/site/src" "${staging}/site/dist" "$(dirname -- "${output}")"
cp "${project_dir}/index.html" "${project_dir}/coi-serviceworker.js" \
  "${staging}/site/"
cp "${project_dir}/src/browser.mjs" \
  "${project_dir}/src/http-policy.mjs" \
  "${project_dir}/src/runtime-worker.mjs" \
  "${staging}/site/src/"
cp \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${project_dir}/dist/dolly-system-snapshot.mjs" \
  "${project_dir}/dist/dolly-system.snapshot" \
  "${project_dir}/dist/dolly.data" \
  "${project_dir}/dist/dolly.mjs" \
  "${project_dir}/dist/dolly.wasm" \
  "${staging}/site/dist/"
touch "${staging}/site/.nojekyll"
tar -C "${staging}/site" -czf "${output}" .
echo "dolly: wrote $(du -h "${output}" | cut -f1) Pages artifact to ${output}"

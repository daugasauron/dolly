#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:-${project_dir}/build/dolly-pages.tar.gz}"
staging=""
temporary_output=""
cleanup() {
  [[ -z "${staging}" ]] || rm -rf -- "${staging}"
  [[ -z "${temporary_output}" ]] || rm -f -- "${temporary_output}"
}
trap cleanup EXIT
staging="$(mktemp -d)"
mkdir -p "$(dirname -- "${output}")"
temporary_output="$(mktemp "$(dirname -- "${output}")/.dolly-pages.XXXXXX")"

node "${project_dir}/scripts/generate-routes.mjs"

mapfile -t image_rows < <(node "${project_dir}/scripts/list-images.mjs")
mapfile -t module_names < <(node "${project_dir}/scripts/list-images.mjs" --modules)
image_names=()
dollyfiles=()
for row in "${image_rows[@]}"; do
  IFS=$'\t' read -r image_name dollyfile <<<"${row}"
  image_names+=("${image_name}")
  dollyfiles+=("${dollyfile}")
done

for required in \
  index.html \
  terminal.html \
  coi-serviceworker.js \
  src/browser.mjs \
  src/dollyfile-view.mjs \
  src/http-policy.mjs \
  src/module-cache.mjs \
  src/session-store.mjs \
  src/runtime-worker.mjs \
  dist/dolly-images.mjs \
  dist/dolly.mjs \
  dist/dolly.wasm \
  dist/dolly.data; do
  if [[ ! -f "${project_dir}/${required}" ]]; then
    echo "dolly: Pages artifact is missing ${required}" >&2
    exit 1
  fi
done
for required in "${dollyfiles[@]}"; do
  [[ -f "${project_dir}/${required}" ]] || {
    echo "dolly: Pages artifact is missing ${required}" >&2
    exit 1
  }
done
node "${project_dir}/scripts/verify-static-sources.mjs"
for image_name in "${image_names[@]}"; do
  for required in \
    "dist/dolly-${image_name}-system.snapshot" \
    "dist/dolly-${image_name}-system-snapshot.mjs"; do
    [[ -f "${project_dir}/${required}" ]] || {
      echo "dolly: Pages artifact is missing ${required}" >&2
      exit 1
    }
  done
done

mkdir -p "${staging}/site/src" "${staging}/site/dist" "${staging}/site/docs" \
  "${staging}/site/modules" "${staging}/site/abi" "${staging}/site/include/dolly"
cp "${project_dir}/index.html" "${project_dir}/terminal.html" \
  "${dollyfiles[@]/#/${project_dir}/}" \
  "${project_dir}/coi-serviceworker.js" \
  "${staging}/site/"
cp "${project_dir}/src/browser.mjs" \
  "${project_dir}/src/dollyfile-view.mjs" \
  "${project_dir}/src/http-policy.mjs" \
  "${project_dir}/src/module-cache.mjs" \
  "${project_dir}/src/session-store.mjs" \
  "${project_dir}/src/runtime-worker.mjs" \
  "${staging}/site/src/"
for module_name in "${module_names[@]}"; do
  cp "${project_dir}/modules/${module_name}.dm" "${staging}/site/modules/"
done
cp "${project_dir}"/abi/*.wat "${staging}/site/abi/"
cp "${project_dir}"/include/dolly/*.h "${staging}/site/include/dolly/"
cp "${project_dir}/docs/dollyfile.md" "${project_dir}/docs/architecture.md" \
  "${project_dir}/docs/security.md" "${project_dir}/docs/port-status.md" \
  "${project_dir}/docs/sessions.md" \
  "${staging}/site/docs/"
for image_name in "${image_names[@]}"; do
  cp -R "${project_dir}/build/routes/${image_name}" "${staging}/site/"
done
cp -R "${project_dir}/build/routes/custom" "${project_dir}/build/routes/rebuild" \
  "${project_dir}/build/routes/load" \
  "${staging}/site/"
cp -R "${project_dir}/build/routes/view" "${staging}/site/"
cp -R "${project_dir}/dist/static" "${staging}/site/"
cp \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${project_dir}/dist/dolly-images.mjs" \
  "${project_dir}/dist/dolly.data" \
  "${project_dir}/dist/dolly.mjs" \
  "${project_dir}/dist/dolly.wasm" \
  "${staging}/site/dist/"
for image_name in "${image_names[@]}"; do
  cp \
    "${project_dir}/dist/dolly-${image_name}-system-snapshot.mjs" \
    "${project_dir}/dist/dolly-${image_name}-system.snapshot" \
    "${staging}/site/dist/"
done
touch "${staging}/site/.nojekyll"
tar -C "${staging}/site" -czf "${temporary_output}" .
mv -- "${temporary_output}" "${output}"
echo "dolly: wrote $(du -h "${output}" | cut -f1) Pages artifact to ${output}"

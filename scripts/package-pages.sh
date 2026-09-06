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
  src/http-broker.mjs \
  src/kernel-plugin.mjs \
  src/image-entry.mjs \
  src/image-artifact.mjs \
  src/image-build.mjs \
  src/image-inputs.mjs \
  src/snapshot-records.mjs \
  src/process-ffi.mjs \
  src/process-abi.mjs \
  src/wasm-interface.mjs \
  src/process-supervisor.mjs \
  src/process-worker.mjs \
  src/session-store.mjs \
  src/session-transport.mjs \
  src/sessions.mjs \
  src/runtime-worker.mjs \
  dist/dolly-images.mjs \
  dist/dolly.mjs \
  dist/dolly.wasm \
  dist/dolly.data \
  dist/dolly-process-abi.mjs \
  dist/dolly-process-0.wasm \
  dist/dolly-process-dso-0.wasm \
  dist/dolly-errno.mjs \
  dist/dolly-kernel-plugin-abi.mjs \
  dist/dolly-browser-0.wasm \
  dist/dolly-process-gate-0.wasm; do
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
node "${project_dir}/scripts/site-release.mjs" source "${staging}/site" "${project_dir}"
cp "${project_dir}/build/routes/index.html" "${project_dir}/terminal.html" \
  "${dollyfiles[@]/#/${project_dir}/}" \
  "${project_dir}/coi-serviceworker.js" \
  "${staging}/site/"
cp "${project_dir}/src/browser.mjs" \
  "${project_dir}/src/dollyfile-view.mjs" \
  "${project_dir}/src/http-policy.mjs" \
  "${project_dir}/src/http-broker.mjs" \
  "${project_dir}/src/kernel-plugin.mjs" \
  "${project_dir}/src/image-entry.mjs" \
  "${project_dir}/src/image-artifact.mjs" \
  "${project_dir}/src/image-build.mjs" \
  "${project_dir}/src/image-inputs.mjs" \
  "${project_dir}/src/snapshot-records.mjs" \
  "${project_dir}/src/process-ffi.mjs" \
  "${project_dir}/src/process-abi.mjs" \
  "${project_dir}/src/wasm-interface.mjs" \
  "${project_dir}/src/process-supervisor.mjs" \
  "${project_dir}/src/process-worker.mjs" \
  "${project_dir}/src/session-store.mjs" \
  "${project_dir}/src/session-transport.mjs" \
  "${project_dir}/src/sessions.mjs" \
  "${project_dir}/src/runtime-worker.mjs" \
  "${staging}/site/src/"
for module_name in "${module_names[@]}"; do
  cp "${project_dir}/modules/${module_name}.dm" "${staging}/site/modules/"
done
cp "${project_dir}"/abi/*.wat "${staging}/site/abi/"
cp "${project_dir}"/include/dolly/*.h "${staging}/site/include/dolly/"
node "${project_dir}/scripts/package-documentation.mjs" "${project_dir}" "${staging}/site" \
  docs/dollyfile.md docs/architecture.md docs/security.md docs/port-status.md \
  docs/browser-boundary.md docs/http.md docs/sessions.md docs/sources.md
for image_name in "${image_names[@]}"; do
  cp -R "${project_dir}/build/routes/${image_name}" "${staging}/site/"
done
cp -R "${project_dir}/build/routes/custom" "${project_dir}/build/routes/rebuild" \
  "${project_dir}/build/routes/load" \
  "${project_dir}/build/routes/session" \
  "${staging}/site/"
cp "${project_dir}/build/routes/404.html" "${staging}/site/404.html"
cp -R "${project_dir}/build/routes/view" "${staging}/site/"
source_rows="$(node "${project_dir}/scripts/list-images.mjs" --sources)"
while IFS=$'\t' read -r source_path source_metadata; do
  [[ "${source_path}" == /static/* ]] || continue
  destination="${staging}/site${source_path}"
  mkdir -p "$(dirname -- "${destination}")"
  cp -- "${project_dir}/dist${source_path}" "${destination}"
done <<< "${source_rows}"
cp \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${project_dir}/dist/dolly-images.mjs" \
  "${project_dir}/dist/dolly.data" \
  "${project_dir}/dist/dolly.mjs" \
  "${project_dir}/dist/dolly.wasm" \
  "${project_dir}/dist/dolly-process-abi.mjs" \
  "${project_dir}/dist/dolly-process-0.wasm" \
  "${project_dir}/dist/dolly-process-dso-0.wasm" \
  "${project_dir}/dist/dolly-errno.mjs" \
  "${project_dir}/dist/dolly-kernel-plugin-abi.mjs" \
  "${project_dir}/dist/dolly-browser-0.wasm" \
  "${project_dir}/dist/dolly-process-gate-0.wasm" \
  "${staging}/site/dist/"
for image_name in "${image_names[@]}"; do
  cp \
    "${project_dir}/dist/dolly-${image_name}-system-snapshot.mjs" \
    "${project_dir}/dist/dolly-${image_name}-system.snapshot" \
    "${staging}/site/dist/"
done
node "${project_dir}/scripts/share-pages-snapshots.mjs" "${staging}/site/dist"
touch "${staging}/site/.nojekyll"
site_bytes="$(du -sb "${staging}/site" | cut -f1)"
if (( site_bytes > 1000000000 )); then
  echo "dolly: Pages site exceeds 1 GB (${site_bytes} bytes)" >&2
  exit 1
fi
echo "dolly: Pages site is ${site_bytes} bytes"
node "${project_dir}/scripts/site-release.mjs" accept "${staging}/site" "${project_dir}"
tar -C "${staging}/site" -czf "${temporary_output}" .
mv -- "${temporary_output}" "${output}"
node "${project_dir}/scripts/site-release.mjs" publish "${staging}/site" "${project_dir}/build/releases"
echo "dolly: wrote $(du -h "${output}" | cut -f1) Pages artifact to ${output}"
sha256sum -- "${output}"

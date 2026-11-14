#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
releases="${1:-${project_dir}/build/releases}"
site="${2:-}"
if [[ -n "${site}" && "${site}" != "slopshare.dev" ]]; then
  echo "dolly: unknown site: ${site}" >&2
  exit 1
fi
staging=""
cleanup() { [[ -z "${staging}" ]] || rm -rf -- "${staging}"; }
trap cleanup EXIT
# Staged beside the releases so publication is a rename, not a copy.
mkdir -p "${releases}"
staging="$(mktemp -d "${releases}/.staging-XXXXXX")"

node "${project_dir}/scripts/generate-routes.mjs"

mapfile -t image_rows < <(node "${project_dir}/scripts/list-images.mjs")
image_names=()
dollyfiles=()
for row in "${image_rows[@]}"; do
  IFS=$'\t' read -r image_name dollyfile <<<"${row}"
  image_names+=("${image_name}")
  dollyfiles+=("${dollyfile}")
done

for required in "${dollyfiles[@]}"; do
  [[ -f "${project_dir}/${required}" ]] || {
    echo "dolly: Pages artifact is missing ${required}" >&2
    exit 1
  }
done
for image_name in "${image_names[@]}"; do
  for required in \
    "dist/dolly-${image_name}-system.snapshot" \
    "dist/dolly-${image_name}-system-snapshot.json"; do
    [[ -f "${project_dir}/${required}" ]] || {
      echo "dolly: Pages artifact is missing ${required}" >&2
      exit 1
    }
  done
done

# The site keeps checkout paths: published pages, code, recipes and sources.
mkdir -p "${staging}/site/dist"
node "${project_dir}/scripts/site-release.mjs" source "${staging}/site" "${project_dir}"
# abi/*.wat is copied whole, whether or not a recipe names a contract as a source.
mapfile -t sources < <(node "${project_dir}/scripts/list-images.mjs" --sources | grep -v "^abi/.*\.wat$")
(cd "${project_dir}" && cp --parents -R index.html amy-index.txt 404.html terminal.html coi-serviceworker.js LICENSE llms.txt licences \
  host page/*.mjs site/*.mjs site/*.css site/icon.svg abi/*.wat "${sources[@]}" "${image_names[@]}" view rebuild \
  custom/index.html custom/rebuild custom/run session sessions "${staging}/site/")
if [[ "${site}" == "slopshare.dev" ]]; then
  node "${project_dir}/scripts/package-domain.mjs" "${staging}/site"
fi
documents=("${project_dir}"/docs/*.md)
node "${project_dir}/scripts/package-documentation.mjs" "${project_dir}" "${staging}/site" \
  "${documents[@]#"${project_dir}/"}"
cp \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/IosevkaTerm-SemiBold-page.woff" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${project_dir}/dist/dolly-image-build-id.mjs" \
  "${project_dir}/dist/dolly-build-id.json" \
  "${project_dir}/dist/dolly-abi.json" \
  "${project_dir}/dist/dolly-images.json" \
  "${project_dir}/dist/dolly.data" \
  "${project_dir}/dist/dolly.wasm" \
  "${project_dir}/dist/dolly-process-abi.mjs" \
  "${project_dir}/dist/dolly-process-worker.mjs" \
  "${project_dir}/dist/dolly-runtime-worker.mjs" \
  "${project_dir}/dist/dolly-process-dso.mjs" \
  "${project_dir}/dist/dolly-process-stack.mjs" \
  "${project_dir}/dist/dolly-kernel-plugin-abi.mjs" \
  "${project_dir}"/dist/dolly-*-0.wasm \
  "${staging}/site/dist/"
for image_name in "${image_names[@]}"; do
  cp \
    "${project_dir}/dist/dolly-${image_name}-system-snapshot.json" \
    "${staging}/site/dist/"
done
# Each published recipe's rows (abi/README.md): a host builds from them without parsing it.
mkdir -p "${staging}/site/dist/rows"
node -e 'const { images } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")), names = new Set(process.argv.slice(2));
  for (const { image, sha256 } of images) if (names.has(image)) console.log(sha256);' \
  "${project_dir}/dist/dolly-images.json" "${image_names[@]}" | while read -r sha256; do
  cp "${project_dir}/dist/rows/${sha256}.rows" "${staging}/site/dist/rows/"
done
node "${project_dir}/scripts/share-pages-snapshots.mjs" "${staging}/site/dist" "${project_dir}/dist"
touch "${staging}/site/.nojekyll"
node "${project_dir}/scripts/offline-files.mjs" "${staging}/site" > "${staging}/site/dist/dolly-offline.json"
site_bytes="$(du -sb "${staging}/site" | cut -f1)"
echo "dolly: Pages site is ${site_bytes} bytes"
node "${project_dir}/scripts/site-release.mjs" accept "${staging}/site" "${project_dir}"
node "${project_dir}/scripts/site-release.mjs" publish "${staging}/site" "${releases}"

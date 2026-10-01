#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:-${project_dir}/build/dolly-pages.tar.gz}"
releases="${2:-${project_dir}/build/releases}"
site="${3:-}"
if [[ -n "${site}" && "${site}" != "daugasauron.com" && "${site}" != "github-pages" ]]; then
  echo "dolly: unknown site: ${site}" >&2
  exit 1
fi
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
cp -R "${project_dir}/host" "${staging}/site/host"
node "${project_dir}/scripts/site-release.mjs" source "${staging}/site" "${project_dir}"
cp "${project_dir}/build/routes/index.html" "${project_dir}/terminal.html" \
  "${dollyfiles[@]/#/${project_dir}/}" \
  "${project_dir}/coi-serviceworker.js" \
  "${staging}/site/"
cp "${project_dir}"/src/*.mjs "${staging}/site/src/"
cp "${project_dir}"/abi/*.wat "${staging}/site/abi/"
mapfile -t headers < <(node "${project_dir}/scripts/host-modules.mjs" headers)
cp "${headers[@]/#/${project_dir}/}" "${staging}/site/include/dolly/"
cp "${project_dir}/LICENSE" "${staging}/site/LICENSE"
for image_name in "${image_names[@]}"; do
  cp -R "${project_dir}/build/routes/${image_name}" "${staging}/site/"
done
cp -R "${project_dir}/build/routes/custom" "${project_dir}/build/routes/rebuild" \
  "${project_dir}/build/routes/load" \
  "${project_dir}/build/routes/session" \
  "${staging}/site/"
cp "${project_dir}/build/routes/404.html" "${staging}/site/404.html"
cp -R "${project_dir}/build/routes/view" "${staging}/site/"
if [[ "${site}" == "daugasauron.com" ]]; then
  node "${project_dir}/scripts/package-domain.mjs" "${staging}/site"
elif [[ "${site}" == "github-pages" ]]; then
  node "${project_dir}/scripts/package-github-pages.mjs" "${staging}/site"
fi
source_rows="$(node "${project_dir}/scripts/list-images.mjs" --sources)"
while IFS=$'\t' read -r source_path source_file; do
  case "${source_path}" in
    /static/*|/modules/*) ;;
    *) continue ;;
  esac
  destination="${staging}/site${source_path}"
  mkdir -p "$(dirname -- "${destination}")"
  cp -- "${project_dir}/${source_file}" "${destination}"
done <<< "${source_rows}"
documents=("${project_dir}"/docs/*.md)
node "${project_dir}/scripts/package-documentation.mjs" "${project_dir}" "${staging}/site" \
  "${documents[@]#"${project_dir}/"}"
cp \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${project_dir}/dist/dolly-image-build-id.mjs" \
  "${project_dir}/dist/dolly-images.mjs" \
  "${project_dir}/dist/dolly.data" \
  "${project_dir}/dist/dolly.mjs" \
  "${project_dir}/dist/dolly-seed.mjs" \
  "${project_dir}/dist/dolly.wasm" \
  "${project_dir}/dist/dolly-process-abi.mjs" \
  "${project_dir}/dist/dolly-process-worker.mjs" \
  "${project_dir}/dist/dolly-errno.mjs" \
  "${project_dir}/dist/dolly-kernel-plugin-abi.mjs" \
  "${project_dir}"/dist/dolly-*-0.wasm \
  "${staging}/site/dist/"
for image_name in "${image_names[@]}"; do
  cp \
    "${project_dir}/dist/dolly-${image_name}-system-snapshot.mjs" \
    "${staging}/site/dist/"
done
node "${project_dir}/scripts/share-pages-snapshots.mjs" "${staging}/site/dist" "${project_dir}/dist"
touch "${staging}/site/.nojekyll"
site_bytes="$(du -sb "${staging}/site" | cut -f1)"
echo "dolly: Pages site is ${site_bytes} bytes"
node "${project_dir}/scripts/site-release.mjs" accept "${staging}/site" "${project_dir}"
tar -C "${staging}/site" -czf "${temporary_output}" .
mv -- "${temporary_output}" "${output}"
node "${project_dir}/scripts/site-release.mjs" publish "${staging}/site" "${releases}"
echo "dolly: wrote $(du -h "${output}" | cut -f1) Pages artifact to ${output}"
sha256sum -- "${output}"

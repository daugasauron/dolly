#!/usr/bin/env bash
# Prints the directory holding Xonotic's pinned source archive (DarkPlaces,
# gmqcc, the QuakeC game logic and the licence texts) with the Dolly engine
# patch applied.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_XONOTIC_SOURCE_URL}" "${DOLLY_XONOTIC_SOURCE_SHA256}" \
  "${project_dir}/.cache/xonotic/xonotic-${DOLLY_XONOTIC_VERSION}-source.zip")"
recipe_hash="$(sha256sum "${project_dir}/demos/xonotic/darkplaces-dolly.patch" | cut -d' ' -f1)"
output="${project_dir}/build/generated/xonotic-${DOLLY_XONOTIC_SOURCE_SHA256}-${recipe_hash}"
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.xonotic.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  unzip -q "${archive}" 'Xonotic/source/darkplaces/*' 'Xonotic/source/gmqcc/*' 'Xonotic/source/qcsrc/*' \
    'Xonotic/source/d0_blind_id/*.h' 'Xonotic/COPYING' 'Xonotic/GPL-2' 'Xonotic/GPL-3' -d "${temporary}"
  mv "${temporary}/Xonotic/source"/* "${temporary}/Xonotic/COPYING" "${temporary}/Xonotic/GPL-2" "${temporary}/Xonotic/GPL-3" "${temporary}/"
  rm -rf "${temporary}/Xonotic"
  patch --silent --fuzz=0 --no-backup-if-mismatch -d "${temporary}" -p0 < "${project_dir}/demos/xonotic/darkplaces-dolly.patch"
  mv -T "${temporary}" "${output}"
fi
printf '%s\n' "${output}"

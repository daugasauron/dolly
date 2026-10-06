#!/usr/bin/env bash
# Prints the directory holding the pk3 archives of Xonotic's pinned release,
# extracted from its 1.2 GB zip. The browser test fetches two of them.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_XONOTIC_URL}" "${DOLLY_XONOTIC_SHA256}" \
  "${project_dir}/.cache/xonotic/xonotic-${DOLLY_XONOTIC_VERSION}.zip")"
output="${project_dir}/.cache/xonotic/release/Xonotic/data"
if [[ ! -f "${output}/xonotic-20230620-maps.pk3" ]]; then
  unzip -q -o "${archive}" 'Xonotic/data/*' -d "${project_dir}/.cache/xonotic/release"
fi
printf '%s\n' "${output}"

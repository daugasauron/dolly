#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="${project_dir}/.cache/stb-${DOLLY_STB_COMMIT}"
header="${source_dir}/stb_truetype.h"

mkdir -p "${source_dir}"
if [[ ! -f "${header}" ]]; then
  curl --fail --location --output "${header}" "${DOLLY_STB_TRUETYPE_URL}"
fi
printf '%s  %s\n' "${DOLLY_STB_TRUETYPE_SHA256}" "${header}" |
  sha256sum --check --status
printf '%s\n' "${header}"

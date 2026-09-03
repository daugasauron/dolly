#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="${project_dir}/.cache/stb-${DOLLY_STB_COMMIT}"
header="${source_dir}/stb_truetype.h"

mkdir -p "${source_dir}"
if [[ ! -f "${header}" ]]; then
  temporary="$(mktemp "${source_dir}/stb-truetype.XXXXXX")"
  trap 'rm -f -- "${temporary}"' EXIT
  curl --fail --location --output "${temporary}" "${DOLLY_STB_TRUETYPE_URL}"
  printf '%s  %s\n' "${DOLLY_STB_TRUETYPE_SHA256}" "${temporary}" |
    sha256sum --check --status
  mv -- "${temporary}" "${header}"
  trap - EXIT
fi
printf '%s  %s\n' "${DOLLY_STB_TRUETYPE_SHA256}" "${header}" |
  sha256sum --check --status
printf '%s\n' "${header}"

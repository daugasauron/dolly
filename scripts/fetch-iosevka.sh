#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
font_dir="${project_dir}/.cache/fonts"
font="${font_dir}/IosevkaTerm-SemiBold.woff2"
url="${DOLLY_IOSEVKA_URL}"
sha256="${DOLLY_IOSEVKA_SHA256}"

mkdir -p "${font_dir}"
if [[ ! -f "${font}" ]]; then
  curl --fail --location --output "${font}" "${url}"
fi
printf '%s  %s\n' "${sha256}" "${font}" | sha256sum --check --status
printf '%s\n' "${font}"

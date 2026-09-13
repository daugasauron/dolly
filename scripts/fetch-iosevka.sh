#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
font_dir="${project_dir}/.cache/fonts"
web_font="${font_dir}/IosevkaTerm-SemiBold.woff2"
runtime_font="${font_dir}/IosevkaTerm-SemiBold.ttf"

"${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_IOSEVKA_URL}" "${DOLLY_IOSEVKA_SHA256}" "${web_font}"
"${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_IOSEVKA_TTF_URL}" "${DOLLY_IOSEVKA_TTF_SHA256}" "${runtime_font}"

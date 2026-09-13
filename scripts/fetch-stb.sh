#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
exec "${project_dir}/scripts/fetch-verified-file.sh" \
  "${DOLLY_STB_TRUETYPE_URL}" "${DOLLY_STB_TRUETYPE_SHA256}" "${project_dir}/.cache/stb-${DOLLY_STB_COMMIT}/stb_truetype.h"

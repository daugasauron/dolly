#!/usr/bin/env bash
# Prints the pinned stb header NAME (stb_truetype.h by default), fetched once.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
case "${1:-stb_truetype.h}" in
  stb_truetype.h) url="${DOLLY_STB_TRUETYPE_URL}" sha="${DOLLY_STB_TRUETYPE_SHA256}" ;;
  stb_image.h) url="${DOLLY_STB_IMAGE_URL}" sha="${DOLLY_STB_IMAGE_SHA256}" ;;
  *) echo "fetch-stb: unknown header $1" >&2; exit 64 ;;
esac
exec "${project_dir}/scripts/fetch-verified-file.sh" "${url}" "${sha}" "${project_dir}/.cache/stb-${DOLLY_STB_COMMIT}/${1:-stb_truetype.h}"

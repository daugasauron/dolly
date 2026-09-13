#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
exec "${project_dir}/scripts/fetch-verified-file.sh" \
  "${DOLLY_LIBFFI_URL}" "${DOLLY_LIBFFI_SHA256}" "${project_dir}/.cache/libffi-${DOLLY_LIBFFI_VERSION}.tar.gz"

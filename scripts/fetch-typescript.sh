#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
exec "${project_dir}/scripts/fetch-verified-file.sh" \
  "${DOLLY_TYPESCRIPT_URL}" "${DOLLY_TYPESCRIPT_SHA256}" "${project_dir}/.cache/typescript-${DOLLY_TYPESCRIPT_VERSION}.tgz"

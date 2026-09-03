#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="${project_dir}/.cache/typescript-${DOLLY_TYPESCRIPT_VERSION}.tgz"

mkdir -p "${project_dir}/.cache"
if [[ ! -f "${archive}" ]]; then
  curl --fail --location --output "${archive}" "${DOLLY_TYPESCRIPT_URL}"
fi
printf '%s  %s\n' "${DOLLY_TYPESCRIPT_SHA256}" "${archive}" |
  sha256sum --check --status
printf '%s\n' "${archive}"

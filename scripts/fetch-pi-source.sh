#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="${project_dir}/.cache/pi-source-${DOLLY_PI_SOURCE_COMMIT}"

mkdir -p "${project_dir}/.cache"
if [[ ! -d "${source_dir}/.git" ]]; then
  if [[ -e "${source_dir}" ]]; then
    echo "dolly: ${source_dir} exists but is not a Pi checkout" >&2
    exit 1
  fi
  temporary="$(mktemp -d "${project_dir}/.cache/pi-source-fetch.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  git clone --quiet --filter=blob:none --no-checkout \
    "${DOLLY_PI_SOURCE_URL}" "${temporary}"
  git -C "${temporary}" checkout --quiet "${DOLLY_PI_SOURCE_COMMIT}"
  mv -- "${temporary}" "${source_dir}"
  trap - EXIT
fi

bash "${project_dir}/scripts/verify-git-source.sh" "${source_dir}" "${DOLLY_PI_SOURCE_COMMIT}"
printf '%s\n' "${source_dir}"

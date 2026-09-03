#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="${project_dir}/.cache/uucode-${DOLLY_UUCODE_COMMIT}.tar.gz"
source_dir="${project_dir}/.cache/uucode-${DOLLY_UUCODE_COMMIT}"

mkdir -p "${project_dir}/.cache"
if [[ ! -f "${archive}" ]]; then
  temporary_archive="$(mktemp "${project_dir}/.cache/uucode-download.XXXXXX")"
  trap 'rm -f -- "${temporary_archive}"' EXIT
  curl --fail --location --output "${temporary_archive}" "${DOLLY_UUCODE_URL}"
  printf '%s  %s\n' "${DOLLY_UUCODE_SHA256}" "${temporary_archive}" |
    sha256sum --check --status
  mv -- "${temporary_archive}" "${archive}"
  trap - EXIT
fi
printf '%s  %s\n' "${DOLLY_UUCODE_SHA256}" "${archive}" |
  sha256sum --check --status

if [[ ! -f "${source_dir}/src/root.zig" ]]; then
  if [[ -e "${source_dir}" ]]; then
    echo "dolly: ${source_dir} exists but is not the pinned uucode source tree" >&2
    exit 1
  fi
  temporary="$(mktemp -d "${project_dir}/.cache/uucode-fetch.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  tar -xzf "${archive}" -C "${temporary}" --strip-components=1
  mv -- "${temporary}" "${source_dir}"
  trap - EXIT
fi

printf '%s\n' "${source_dir}"

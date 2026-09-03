#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="${project_dir}/.cache/zig-${DOLLY_ZIG_VERSION}.tar.xz"
source_dir="${project_dir}/.cache/zig-${DOLLY_ZIG_VERSION}"

mkdir -p "${project_dir}/.cache"
if [[ ! -f "${archive}" ]]; then
  temporary_archive="$(mktemp "${project_dir}/.cache/zig-download.XXXXXX")"
  trap 'rm -f -- "${temporary_archive}"' EXIT
  curl --fail --location --output "${temporary_archive}" "${DOLLY_ZIG_URL}"
  printf '%s  %s\n' "${DOLLY_ZIG_SHA256}" "${temporary_archive}" |
    sha256sum --check --status
  mv -- "${temporary_archive}" "${archive}"
  trap - EXIT
fi
printf '%s  %s\n' "${DOLLY_ZIG_SHA256}" "${archive}" |
  sha256sum --check --status

if [[ ! -f "${source_dir}/src/main.zig" ||
      ! -f "${source_dir}/lib/std/std.zig" ]]; then
  if [[ -e "${source_dir}" ]]; then
    echo "dolly: ${source_dir} exists but is not the pinned Zig source tree" >&2
    exit 1
  fi
  temporary="$(mktemp -d "${project_dir}/.cache/zig-fetch.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  tar -xJf "${archive}" -C "${temporary}" --strip-components=1
  mv -- "${temporary}" "${source_dir}"
  trap - EXIT
fi

printf '%s\n' "${source_dir}"

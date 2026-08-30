#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-zig.sh")"
patch_file="${project_dir}/patches/zig-0.16.0-dolly-native.patch"
patch_digest="$(sha256sum "${patch_file}" | cut -d ' ' -f 1)"
prepared_dir="${project_dir}/.cache/zig-native-${DOLLY_ZIG_VERSION}-${patch_digest:0:16}"

if [[ ! -f "${prepared_dir}/.dolly-native-source" ]]; then
  temporary_dir="$(mktemp -d "${project_dir}/.cache/zig-native.XXXXXX")"
  trap 'rm -rf -- "${temporary_dir}"' EXIT
  cp -a --reflink=auto "${source_dir}/." "${temporary_dir}/"
  patch --batch --forward --directory="${temporary_dir}" --strip=1 --input="${patch_file}" >&2
  printf '%s\n' "${patch_digest}" > "${temporary_dir}/.dolly-native-source"
  mv -- "${temporary_dir}" "${prepared_dir}"
  trap - EXIT
fi

printf '%s\n' "${prepared_dir}"

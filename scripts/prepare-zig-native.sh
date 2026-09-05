#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-zig.sh")"
patch_file="${project_dir}/patches/zig-0.16.0-dolly-native.patch"
recipe_digest="$({
  cd -- "${project_dir}"
  printf '%s\n' "zig-source=${DOLLY_ZIG_SHA256}"
  sha256sum scripts/prepare-zig-native.sh patches/zig-0.16.0-dolly-native.patch
} | sha256sum | cut -d ' ' -f 1)"
prepared_dir="${project_dir}/.cache/zig-native-${DOLLY_ZIG_VERSION}-${recipe_digest:0:16}"

if [[ ! -f "${prepared_dir}/.dolly-native-source" ||
      "$(<"${prepared_dir}/.dolly-native-source")" != "${recipe_digest}" ]]; then
  if [[ -e "${prepared_dir}" ]]; then
    echo "dolly: incomplete prepared Zig source: ${prepared_dir}" >&2
    exit 1
  fi
  temporary_dir="$(mktemp -d "${project_dir}/.cache/zig-native.XXXXXX")"
  trap 'rm -rf -- "${temporary_dir}"' EXIT
  cp -a --reflink=auto "${source_dir}/." "${temporary_dir}/"
  patch --batch --forward --directory="${temporary_dir}" --strip=1 --input="${patch_file}" >&2
  printf '%s\n' "${recipe_digest}" > "${temporary_dir}/.dolly-native-source"
  mv -T -- "${temporary_dir}" "${prepared_dir}"
  trap - EXIT
fi

printf '%s\n' "${prepared_dir}"

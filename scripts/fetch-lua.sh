#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
version="${DOLLY_LUA_VERSION}"
archive="${project_dir}/.cache/lua-${version}.tar.gz"
source_dir="${project_dir}/build/vendor/lua-${version}"
url="${DOLLY_LUA_URL}"
sha256="${DOLLY_LUA_SHA256}"

mkdir -p "${project_dir}/.cache" "${project_dir}/build/vendor"

if [[ ! -f "${archive}" ]]; then
  curl --fail --location --output "${archive}" "${url}"
fi

printf '%s  %s\n' "${sha256}" "${archive}" | sha256sum --check --status

if [[ ! -d "${source_dir}" ]]; then
  tar -xzf "${archive}" -C "${project_dir}/build/vendor"
fi

printf '%s\n' "${source_dir}"

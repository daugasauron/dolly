#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="${project_dir}/.cache/make-${DOLLY_MAKE_VERSION}.tar.gz"
source_dir="${project_dir}/.cache/make-${DOLLY_MAKE_VERSION}-source"

"${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_MAKE_URL}" "${DOLLY_MAKE_SHA256}" "${archive}" > /dev/null

if [[ ! -f "${source_dir}/src/main.c" ]]; then
  temporary="$(mktemp -d "${project_dir}/.cache/make-extract.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  tar -xzf "${archive}" -C "${temporary}"
  mv -- "${temporary}/make-${DOLLY_MAKE_VERSION}" "${source_dir}"
  rm -rf -- "${temporary}"
  trap - EXIT
fi

printf '%s\n' "${source_dir}"

#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" libuv)"
recipe_hash="$(cd "${project_dir}"; sha256sum demos/cmake/prepare-libuv.sh \
  demos/cmake/libuv-dolly.patch demos/cmake/libuv/dolly.h | sha256sum | cut -d' ' -f1)"
output="${project_dir}/build/generated/libuv-${DOLLY_LIBUV_SHA256}-${recipe_hash}"
temporary=""
cleanup() {
  if [[ -n "${temporary}" ]]; then rm -rf -- "${temporary}"; fi
}
trap cleanup EXIT
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.libuv.XXXXXX")"
  tar -xzf "${archive}" -C "${temporary}"
  source_dir="${temporary}/libuv-${DOLLY_LIBUV_VERSION}"
  patch --silent --no-backup-if-mismatch -d "${source_dir}" -p1 \
    < "${project_dir}/demos/cmake/libuv-dolly.patch"
  cp "${project_dir}/demos/cmake/libuv/dolly.h" "${source_dir}/include/uv/dolly.h"
  mv -T "${source_dir}" "${output}"
fi
printf '%s\n' "${output}"

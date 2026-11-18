#!/usr/bin/env bash
# Prints a directory with Blender's release archive unpacked.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${project_dir}"
key="$(sha256sum demos/blender/source-pins.sh demos/blender/prepare-build-sources.sh | sha256sum | cut -c1-16)"
output="${project_dir}/build/generated/blender-build-${key}"
if [[ ! -d "${output}" ]]; then
  mkdir -p build/generated
  temporary="$(mktemp -d build/generated/.blender-build.XXXXXX)"
  trap 'rm -rf -- "${temporary}"' EXIT
  source config/source-pins.sh
  archive="$(bash scripts/fetch-verified-file.sh "${DOLLY_BLENDER_URL}" "${DOLLY_BLENDER_SHA256}" \
    ".cache/blender/downloads/blender-${DOLLY_BLENDER_VERSION}.tar.xz")"
  tar -xf "${archive}" -C "${temporary}"
  mv -T "${temporary}" "${output}"
  trap - EXIT
fi
printf '%s\n' "${output}"

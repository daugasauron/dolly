#!/usr/bin/env bash
# Prints a directory with the verified upstream archives of build-sources.txt
# unpacked, without the two symbolic links Dolly's tar would refuse (OpenEXR's
# fuzz directory, expat's top-level README).
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${project_dir}"
key="$(sha256sum demos/blender/build-sources.txt demos/blender/prepare-build-sources.sh | sha256sum | cut -c1-16)"
output="${project_dir}/build/generated/blender-build-${key}"
if [[ ! -d "${output}" ]]; then
  mkdir -p build/generated
  temporary="$(mktemp -d build/generated/.blender-build.XXXXXX)"
  trap 'rm -rf -- "${temporary}"' EXIT
  while read -r name url checksum; do
    archive="$(bash scripts/fetch-verified-file.sh "${url}" "${checksum}" ".cache/blender/downloads/${name}")"
    tar -xf "${archive}" -C "${temporary}"
  done < demos/blender/build-sources.txt
  find "${temporary}" -type l -delete
  mv -T "${temporary}" "${output}"
  trap - EXIT
fi
printf '%s\n' "${output}"

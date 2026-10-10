#!/usr/bin/env bash
# Prints the directory holding ReactOS Paint: the C sources, English resources
# and icons of base/applications/mspaint at the pinned ReactOS commit (the
# 0.3.17 release), each file checked against mspaint.sha256, with
# mspaint-dolly.patch applied.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
fetched="${project_dir}/.cache/reactos-mspaint-${DOLLY_REACTOS_COMMIT}"
while read -r hash file; do
  path="reactos/base/applications/mspaint/${file}"
  [[ "${file}" != COPYING.LIB ]] || path=reactos/COPYING.LIB
  "${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_REACTOS_URL}/${DOLLY_REACTOS_COMMIT}/${path}" "${hash}" "${fetched}/${file}" > /dev/null
done < "${project_dir}/demos/wine/mspaint.sha256"
patch_hash="$(sha256sum "${project_dir}/demos/wine/mspaint-dolly.patch" | cut -d' ' -f1)"
output="${project_dir}/build/generated/reactos-mspaint-${DOLLY_REACTOS_COMMIT:0:12}-${patch_hash:0:16}"
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.mspaint.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  cp -r -- "${fetched}/." "${temporary}"
  patch --silent --fuzz=0 --no-backup-if-mismatch --binary -d "${temporary}" -p1 < "${project_dir}/demos/wine/mspaint-dolly.patch"
  mv -T -- "${temporary}" "${output}"
fi
printf '%s\n' "${output}"

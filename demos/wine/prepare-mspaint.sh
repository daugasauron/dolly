#!/usr/bin/env bash
# Prints the directory holding ReactOS Paint: the C sources, English resources
# and icons of base/applications/mspaint at the pinned ReactOS commit (the
# 0.3.17 release), each file checked against mspaint.sha256.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
output="${project_dir}/.cache/reactos-mspaint-${DOLLY_REACTOS_COMMIT}"
while read -r hash file; do
  path="reactos/base/applications/mspaint/${file}"
  [[ "${file}" != COPYING.LIB ]] || path=reactos/COPYING.LIB
  "${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_REACTOS_URL}/${DOLLY_REACTOS_COMMIT}/${path}" "${hash}" "${output}/${file}" > /dev/null
done < "${project_dir}/demos/wine/mspaint.sha256"
printf '%s\n' "${output}"

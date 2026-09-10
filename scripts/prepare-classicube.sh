#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" classicube)"
recipe_hash="$(sha256sum "${project_dir}/config/classicube-dolly.patch" | cut -d' ' -f1)"
output="${project_dir}/build/generated/classicube-${DOLLY_CLASSICUBE_SHA256}-${recipe_hash}"
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.classicube.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  tar -xzf "${archive}" --strip-components=1 -C "${temporary}"
  # Preserve upstream CRLF while applying the small SDL compatibility patch.
  patch --silent --binary --fuzz=0 --no-backup-if-mismatch -d "${temporary}" -p1 \
    < "${project_dir}/config/classicube-dolly.patch"
  mv -T "${temporary}" "${output}"
fi
printf '%s\n' "${output}"

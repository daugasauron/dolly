#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" seven_kingdoms)"
recipe_hash="$(cd "${project_dir}"; sha256sum scripts/prepare-seven-kingdoms.sh \
  config/seven-kingdoms-dolly.patch | sha256sum | cut -d' ' -f1)"
output="${project_dir}/build/generated/seven-kingdoms-${DOLLY_SEVEN_KINGDOMS_SHA256}-${recipe_hash}"
temporary=""
cleanup() {
  if [[ -n "${temporary}" ]]; then rm -rf -- "${temporary}"; fi
}
trap cleanup EXIT
if [[ ! -d "${output}" ]]; then
  mkdir -p "${project_dir}/build/generated"
  temporary="$(mktemp -d "${project_dir}/build/generated/.seven-kingdoms.XXXXXX")"
  tar -xzf "${archive}" --strip-components=1 -C "${temporary}"
  patch --silent --fuzz=0 --no-backup-if-mismatch -d "${temporary}" -p1 \
    < "${project_dir}/config/seven-kingdoms-dolly.patch"
  mv -T "${temporary}" "${output}"
  temporary=""
fi
printf '%s\n' "${output}"

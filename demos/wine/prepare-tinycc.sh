#!/usr/bin/env bash
# Prints a directory holding TinyCC's win64 binary release unpacked (tcc/) and,
# beside it, the source release that goes with it and that release's COPYING.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
output="${project_dir}/.cache/tinycc-${DOLLY_TINYCC_VERSION}-win64"
if [[ ! -d "${output}" ]]; then
  binaries="$("${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_TINYCC_WIN64_URL}" "${DOLLY_TINYCC_WIN64_SHA256}" \
    "${project_dir}/.cache/tcc-${DOLLY_TINYCC_VERSION}-win64-bin.zip")"
  sources="$("${project_dir}/scripts/fetch-verified-file.sh" "${DOLLY_TINYCC_URL}" "${DOLLY_TINYCC_SHA256}" \
    "${project_dir}/.cache/tcc-${DOLLY_TINYCC_VERSION}.tar.bz2")"
  temporary="$(mktemp -d "${project_dir}/.cache/.tinycc.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  unzip -q "${binaries}" -d "${temporary}"
  cp -- "${sources}" "${temporary}/tcc-source.tar.bz2"
  tar -xjf "${sources}" -C "${temporary}" --strip-components=1 "tcc-${DOLLY_TINYCC_VERSION}/COPYING"
  mv -T -- "${temporary}" "${output}"
fi
printf '%s\n' "${output}"

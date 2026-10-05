#!/usr/bin/env bash
# Prints a directory with the verified upstream archives of build-sources.tsv and
# the 0 A.D. source (its SpiderMonkey still packed) and its premake extracted.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${project_dir}"
key="$(sha256sum config/source-pins.sh demos/zero-ad/build-sources.tsv demos/zero-ad/prepare-build-sources.sh | sha256sum | cut -d' ' -f1)"
output="${project_dir}/build/generated/zero-ad-build-${key}"
if [[ ! -d "${output}" ]]; then
  mkdir -p build/generated
  temporary="$(mktemp -d build/generated/.zero-ad-build.XXXXXX)"
  trap 'rm -rf -- "${temporary}"' EXIT
  while IFS=$'\t' read -r name url checksum; do
    archive="$(bash scripts/fetch-verified-file.sh "${url}" "${checksum}" ".cache/0ad/downloads/${name}")"
    case "${name}" in
      *.zip) unzip -q "${archive}" -d "${temporary}" ;;
      *) tar -xf "${archive}" -C "${temporary}" ;;
    esac
  done < demos/zero-ad/build-sources.tsv
  source config/source-pins.sh
  archive="$(bash scripts/fetch-verified-file.sh "${DOLLY_0AD_SOURCE_URL}" "${DOLLY_0AD_SOURCE_SHA256}" \
    ".cache/0ad/0ad-${DOLLY_0AD_VERSION}-unix-build.tar.xz")"
  tar -xf "${archive}" -C "${temporary}"
  # Repacked for Dolly's tar, which rejects the archive's pax global header.
  tar -xf "${temporary}/0ad-${DOLLY_0AD_VERSION}/libraries/source/premake-core/premake-core-5.0.0-beta7.tar.gz" -C "${temporary}"
  mv -T "${temporary}" "${output}"
  trap - EXIT
fi
printf '%s\n' "${output}"

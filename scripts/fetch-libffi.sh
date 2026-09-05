#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="${project_dir}/.cache/libffi-${DOLLY_LIBFFI_VERSION}.tar.gz"

mkdir -p "${project_dir}/.cache"
if [[ ! -f "${archive}" ]]; then
  temporary="$(mktemp "${project_dir}/.cache/libffi-download.XXXXXX")"
  trap 'rm -f -- "${temporary}"' EXIT
  curl --fail --location --silent --show-error \
    "${DOLLY_LIBFFI_URL}" -o "${temporary}"
  actual="$(sha256sum "${temporary}" | awk '{print $1}')"
  if [[ "${actual}" != "${DOLLY_LIBFFI_SHA256}" ]]; then
    echo "dolly: libffi archive checksum mismatch" >&2
    exit 1
  fi
  mv -- "${temporary}" "${archive}"
  trap - EXIT
fi

actual="$(sha256sum "${archive}" | awk '{print $1}')"
if [[ "${actual}" != "${DOLLY_LIBFFI_SHA256}" ]]; then
  echo "dolly: cached libffi archive checksum mismatch" >&2
  exit 1
fi
printf '%s\n' "${archive}"

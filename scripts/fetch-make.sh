#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="${project_dir}/.cache/make-${DOLLY_MAKE_VERSION}.tar.gz"
source_dir="${project_dir}/.cache/make-${DOLLY_MAKE_VERSION}-source"

mkdir -p "${project_dir}/.cache"
if [[ ! -f "${archive}" ]]; then
  temporary="$(mktemp "${project_dir}/.cache/make-download.XXXXXX")"
  trap 'rm -f -- "${temporary}"' EXIT
  curl --fail --location --silent --show-error "${DOLLY_MAKE_URL}" -o "${temporary}"
  actual="$(sha256sum "${temporary}" | awk '{print $1}')"
  if [[ "${actual}" != "${DOLLY_MAKE_SHA256}" ]]; then
    echo "dolly: GNU Make archive checksum mismatch" >&2
    exit 1
  fi
  mv -- "${temporary}" "${archive}"
  trap - EXIT
fi

actual="$(sha256sum "${archive}" | awk '{print $1}')"
if [[ "${actual}" != "${DOLLY_MAKE_SHA256}" ]]; then
  echo "dolly: cached GNU Make archive checksum mismatch" >&2
  exit 1
fi

if [[ ! -f "${source_dir}/src/main.c" ]]; then
  temporary="$(mktemp -d "${project_dir}/.cache/make-extract.XXXXXX")"
  trap 'rm -rf -- "${temporary}"' EXIT
  tar -xzf "${archive}" -C "${temporary}"
  mv -- "${temporary}/make-${DOLLY_MAKE_VERSION}" "${source_dir}"
  trap - EXIT
fi

printf '%s\n' "${source_dir}"

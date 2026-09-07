#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
if [[ $# != 1 || ! "$1" =~ ^[a-z][a-z0-9_]*$ ]]; then
  echo 'usage: fetch-pinned-archive.sh NAME' >&2
  exit 1
fi
prefix="DOLLY_${1^^}"
url_key="${prefix}_URL"
hash_key="${prefix}_SHA256"
url="${!url_key}"
expected="${!hash_key}"
[[ "${expected}" =~ ^[a-f0-9]{64}$ ]]
archive="${project_dir}/.cache/${1}-${expected}.tar.gz"
temporary=""
cleanup() {
  if [[ -n "${temporary}" ]]; then rm -f -- "${temporary}"; fi
}
trap cleanup EXIT
mkdir -p "${project_dir}/.cache"
if [[ ! -f "${archive}" ]]; then
  temporary="$(mktemp "${project_dir}/.cache/.${1}-download.XXXXXX")"
  curl --fail --location --silent --show-error --retry 3 "${url}" -o "${temporary}"
  actual="$(sha256sum "${temporary}" | cut -d' ' -f1)"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "dolly: $1 source checksum mismatch" >&2
    exit 1
  fi
  mv -- "${temporary}" "${archive}"
  temporary=""
fi
actual="$(sha256sum "${archive}" | cut -d' ' -f1)"
if [[ "${actual}" != "${expected}" ]]; then
  echo "dolly: cached $1 source checksum mismatch" >&2
  exit 1
fi
printf '%s\n' "${archive}"

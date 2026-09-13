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
exec "${project_dir}/scripts/fetch-verified-file.sh" "${url}" "${expected}" \
  "${project_dir}/.cache/${1}-${expected}.tar.gz"

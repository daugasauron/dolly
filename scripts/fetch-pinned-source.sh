#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" "$@")"
output="${archive%.tar.gz}-source"
temporary=""
cleanup() {
  if [[ -n "${temporary}" ]]; then rm -rf -- "${temporary}"; fi
}
trap cleanup EXIT
if [[ ! -d "${output}" ]]; then
  temporary="$(mktemp -d "${project_dir}/.cache/.${1}-extract.XXXXXX")"
  tar -xzf "${archive}" --strip-components=1 -C "${temporary}"
  mv -T "${temporary}" "${output}"
  temporary=""
fi
printf '%s\n' "${output}"

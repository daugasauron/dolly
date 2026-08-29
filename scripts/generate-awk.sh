#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$("${project_dir}/scripts/fetch-awk.sh")"
bison="$("${project_dir}/scripts/build-bison.sh")"
generated_dir="${project_dir}/build/generated/awk"
parser="${generated_dir}/awkgram.tab.c"
header="${generated_dir}/awkgram.tab.h"

mkdir -p "${generated_dir}"
temporary_dir="$(mktemp -d "${generated_dir}/.awk-parser.XXXXXX")"
cleanup() {
  rm -f "${temporary_dir}/awkgram.tab.c" "${temporary_dir}/awkgram.tab.h"
  rmdir "${temporary_dir}" 2>/dev/null || true
}
trap cleanup EXIT
(
  cd "${source_dir}"
  "${bison}" -d -o "${temporary_dir}/awkgram.tab.c" awkgram.y
)
mv "${temporary_dir}/awkgram.tab.c" "${parser}"
mv "${temporary_dir}/awkgram.tab.h" "${header}"

printf '%s\n' "${generated_dir}"

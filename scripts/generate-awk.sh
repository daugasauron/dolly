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
  rm -rf -- "${temporary_dir}"
}
trap cleanup EXIT
(
  cd "${temporary_dir}"
  # Relative output names plus --no-lines keep mktemp paths and checkout paths
  # out of the generated parser, making its HOST archive content-addressable.
  "${bison}" --no-lines -d -o awkgram.tab.c "${source_dir}/awkgram.y"
)
mv "${temporary_dir}/awkgram.tab.c" "${parser}"
mv "${temporary_dir}/awkgram.tab.h" "${header}"

printf '%s\n' "${generated_dir}"

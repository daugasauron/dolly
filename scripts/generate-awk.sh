#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$("${project_dir}/scripts/fetch-awk.sh")"
bison="$("${project_dir}/scripts/build-bison.sh")"
recipe_hash="$({
  sha256sum "${source_dir}/awkgram.y" "${bison}" "${BASH_SOURCE[0]}" \
    | cut -d' ' -f1
} | sha256sum | cut -d' ' -f1)"
generated_dir="${project_dir}/build/generated/awk-${recipe_hash:0:16}"
parser="${generated_dir}/awkgram.tab.c"
header="${generated_dir}/awkgram.tab.h"

if [[ -f "${parser}" && -f "${header}" ]]; then
  printf '%s\n' "${generated_dir}"
  exit 0
fi
if [[ -e "${generated_dir}" ]]; then
  echo "dolly: prepared Awk output is incomplete: ${generated_dir}" >&2
  exit 1
fi

mkdir -p "${project_dir}/build/generated"
temporary_dir="$(mktemp -d "${project_dir}/build/generated/.awk-parser.XXXXXX")"
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
mv -T -- "${temporary_dir}" "${generated_dir}"
trap - EXIT

printf '%s\n' "${generated_dir}"

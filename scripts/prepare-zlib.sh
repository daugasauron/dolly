#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-zlib.sh")"
recipe_hash="$({
  printf '%s\n' "zlib=${DOLLY_ZLIB_COMMIT}"
  sha256sum "${BASH_SOURCE[0]}" | awk '{print $1}'
} | sha256sum | awk '{print $1}')"
output_dir="${project_dir}/build/generated/zlib-source-${DOLLY_ZLIB_COMMIT}-${recipe_hash:0:16}"

if [[ -d "${output_dir}" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi
if [[ -e "${output_dir}" ]]; then
  echo "dolly: prepared zlib output is not a directory: ${output_dir}" >&2
  exit 1
fi

mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.zlib-source.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT

for path in \
  adler32.c crc32.c crc32.h deflate.c deflate.h gzclose.c gzlib.c gzread.c \
  gzwrite.c gzguts.h infback.c \
  inffast.c inffast.h inffixed.h inflate.c inflate.h inftrees.c inftrees.h \
  trees.c trees.h uncompr.c zconf.h zlib.h zutil.c zutil.h; do
  cp -- "${source_dir}/${path}" "${temporary}/${path}"
done
cp -- "${source_dir}/LICENSE" "${temporary}/LICENSE"
mv -T -- "${temporary}" "${output_dir}"
trap - EXIT
printf '%s\n' "${output_dir}"

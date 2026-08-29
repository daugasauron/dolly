#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$("${project_dir}/scripts/fetch-zlib.sh")"
output_dir="${project_dir}/build/generated/zlib-source"

rm -rf -- "${output_dir}"
mkdir -p "${output_dir}"
for path in \
  adler32.c crc32.c crc32.h deflate.c deflate.h gzclose.c gzlib.c gzread.c \
  gzwrite.c gzguts.h infback.c \
  inffast.c inffast.h inffixed.h inflate.c inflate.h inftrees.c inftrees.h \
  trees.c trees.h uncompr.c zconf.h zlib.h zutil.c zutil.h; do
  cp -- "${source_dir}/${path}" "${output_dir}/${path}"
done
cp -- "${source_dir}/LICENSE" "${output_dir}/LICENSE"
printf '%s\n' "${output_dir}"

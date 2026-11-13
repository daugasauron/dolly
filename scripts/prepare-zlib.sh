#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source "${project_dir}/scripts/prepared-source.sh"
source_dir="$("${project_dir}/scripts/fetch-pinned-checkout.sh" zlib)"
prepared_source zlib "${DOLLY_ZLIB_COMMIT}" "" "${BASH_SOURCE[0]}"

for path in \
  adler32.c compress.c crc32.c crc32.h deflate.c deflate.h gzclose.c gzlib.c gzread.c \
  gzwrite.c gzguts.h infback.c \
  inffast.c inffast.h inffixed.h inflate.c inflate.h inftrees.c inftrees.h \
  trees.c trees.h uncompr.c zconf.h zlib.h zutil.c zutil.h; do
  cp -- "${source_dir}/${path}" "${temporary}/${path}"
done
cp -- "${source_dir}/LICENSE" "${temporary}/LICENSE"
publish_prepared_source

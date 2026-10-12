# Sourced by scripts/prepare-image-sources.sh.
# Release archives that Dolly's tar reads as published (package, file name).
while read -r tool tool_archive; do
  if has_image "${tool}"; then
    copy_static "$(bash scripts/fetch-pinned-archive.sh "${tool}")" "tools/${tool_archive}"
  fi
done <<'ARCHIVES'
sqlite sqlite-autoconf-3540000.tar.gz
xz xz-5.8.4.tar.gz
bzip2 bzip2-1.0.8.tar.gz
zip zip30.tar.gz
unzip unzip60.tar.gz
ARCHIVES
# xxd is one file of Vim's repository, with its manual page.
if has_image xxd; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh xxd)" tools/xxd.c
  copy_static "$(bash scripts/fetch-pinned-archive.sh xxd_man)" tools/xxd.1
fi
# Dolly's tar reads files and directories. These release archives also hold a
# pax header (every git archive has one) or links, so the files a build reads
# are staged from them, unchanged, with licence and manual at their paths.
if has_image sqlite; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh linenoise)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/linenoise.tar" \
    "${tool_dir}/linenoise.c" /tmp/linenoise/linenoise.c \
    "${tool_dir}/linenoise.h" /tmp/linenoise/linenoise.h \
    "${tool_dir}/LICENSE" /usr/share/licenses/linenoise/LICENSE
fi
if has_image jq; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh jq)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/jq.tar" \
    "${tool_dir}/src" /tmp/jq/src \
    "${tool_dir}/vendor/decNumber" /tmp/jq/vendor/decNumber \
    "${tool_dir}/vendor/oniguruma/src" /tmp/jq/vendor/oniguruma/src \
    "${tool_dir}/COPYING" /usr/share/licenses/jq/COPYING \
    "${tool_dir}/vendor/oniguruma/COPYING" /usr/share/licenses/oniguruma/COPYING \
    "${tool_dir}/jq.1.prebuilt" /usr/share/man/man1/jq.1
fi
if has_image zstd; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh zstd)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/zstd.tar" \
    "${tool_dir}/lib" /tmp/zstd/lib \
    "${tool_dir}/programs" /tmp/zstd/programs \
    "${tool_dir}/LICENSE" /usr/share/licenses/zstd/LICENSE \
    "${tool_dir}/programs/zstd.1" /usr/share/man/man1/zstd.1
fi
if has_image lz4; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh lz4)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/lz4.tar" \
    "${tool_dir}/lib" /tmp/lz4/lib \
    "${tool_dir}/programs" /tmp/lz4/programs \
    "${tool_dir}/LICENSE" /usr/share/licenses/lz4/LICENSE \
    "${tool_dir}/lib/LICENSE" /usr/share/licenses/lz4/lib-LICENSE \
    "${tool_dir}/programs/COPYING" /usr/share/licenses/lz4/programs-COPYING \
    "${tool_dir}/programs/lz4.1" /usr/share/man/man1/lz4.1
fi
if has_image tree; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh tree)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/tree.tar" \
    "${tool_dir}" /tmp/tree \
    "${tool_dir}/LICENSE" /usr/share/licenses/tree/LICENSE \
    "${tool_dir}/doc/tree.1" /usr/share/man/man1/tree.1
fi
if has_image bc; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh bc)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/bc.tar" \
    "${tool_dir}/src" /tmp/bc/src \
    "${tool_dir}/gen" /tmp/bc/gen \
    "${tool_dir}/include" /tmp/bc/include \
    "${tool_dir}/LICENSE.md" /usr/share/licenses/bc/LICENSE.md \
    "${tool_dir}/NOTICE.md" /usr/share/licenses/bc/NOTICE.md \
    "${tool_dir}/manuals/bc/N.1" /usr/share/man/man1/bc.1 \
    "${tool_dir}/manuals/dc/N.1" /usr/share/man/man1/dc.1
fi
if has_image base64; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh base64)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/base64.tar" \
    "${tool_dir}/bin" /tmp/base64/bin \
    "${tool_dir}/include" /tmp/base64/include \
    "${tool_dir}/lib" /tmp/base64/lib \
    "${tool_dir}/LICENSE" /usr/share/licenses/base64/LICENSE
fi
if has_image vi; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh neatvi)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/neatvi.tar" \
    "${tool_dir}" /tmp/neatvi \
    "${tool_dir}/README" /usr/share/doc/vi/README
fi

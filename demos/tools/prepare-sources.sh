# Sourced by scripts/prepare-image-sources.sh.
# Release archives that Dolly's tar reads as published, and Meson's wheel
# (package, source pin, file name).
while read -r tool tool_pin tool_archive; do
  if has_image "${tool}"; then
    copy_static "$(bash scripts/fetch-pinned-archive.sh "${tool_pin}")" "tools/${tool_archive}"
  fi
done <<'ARCHIVES'
sqlite sqlite sqlite-autoconf-3540000.tar.gz
xz xz xz-5.8.4.tar.gz
bzip2 bzip2 bzip2-1.0.8.tar.gz
zip zip zip30.tar.gz
unzip unzip unzip60.tar.gz
mandoc mandoc mandoc-1.14.6.tar.gz
pigz pigz pigz-2.8.tar.gz
yacc byacc byacc-20260126.tgz
flex reflex reflex-20260131.tgz
meson meson meson-1.12.1-py3-none-any.whl
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
if has_image dte; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh dte)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/dte.tar" \
    "${tool_dir}/src" /tmp/dte/src \
    "${tool_dir}/config" /tmp/dte/config \
    "${tool_dir}/mk/config2c.awk" /tmp/dte/mk/config2c.awk \
    "${tool_dir}/LICENSE" /usr/share/licenses/dte/LICENSE \
    "${tool_dir}/docs/dte.1" /usr/share/man/man1/dte.1
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
# wabt's source release, with the libraries it vendors, is an xz archive.
if has_image wabt; then
  tool_archive="$(bash scripts/fetch-pinned-archive.sh wabt)"
  tool_dir="${tool_archive%.tar.gz}-source"
  if [[ ! -d "${tool_dir}" ]]; then
    rm -rf -- "${tool_dir}.partial"
    mkdir -- "${tool_dir}.partial"
    tar -xJf "${tool_archive}" --strip-components=1 -C "${tool_dir}.partial"
    mv -T -- "${tool_dir}.partial" "${tool_dir}"
  fi
  tool_inputs=()
  for tool_file in wasm-rt-exceptions-impl.c wasm-rt-exceptions.h wasm-rt-impl-tableops.inc wasm-rt-impl.c \
      wasm-rt-impl.h wasm-rt-mem-impl-helper.inc wasm-rt-mem-impl.c wasm-rt.h; do
    tool_inputs+=("${tool_dir}/wasm2c/${tool_file}" "/tmp/wabt/wasm2c/${tool_file}")
  done
  for tool_file in wat2wasm wasm2wat wasm-objdump wasm-strip wasm-validate; do
    tool_inputs+=("${tool_dir}/man/${tool_file}.1" "/usr/share/man/man1/${tool_file}.1")
  done
  node scripts/build-source-tar.mjs "${static_dir}/tools/wabt.tar" \
    "${tool_dir}/CMakeLists.txt" /tmp/wabt/CMakeLists.txt \
    "${tool_dir}/src" /tmp/wabt/src \
    "${tool_dir}/include" /tmp/wabt/include \
    "${tool_dir}/scripts/gen-wasm2c-templates.cmake" /tmp/wabt/scripts/gen-wasm2c-templates.cmake \
    "${tool_dir}/scripts/wabt-config.cmake.in" /tmp/wabt/scripts/wabt-config.cmake.in \
    "${tool_dir}/third_party/picosha2" /tmp/wabt/third_party/picosha2 \
    "${tool_inputs[@]}" \
    "${tool_dir}/LICENSE" /usr/share/licenses/wabt/LICENSE \
    "${tool_dir}/third_party/picosha2/LICENSE" /usr/share/licenses/wabt/picosha2-LICENSE
fi
# Binaryen's GitHub archive holds a pax header: the files wasm-opt is built
# from are staged as a plain tar.
if has_image binaryen; then
  tool_archive="$(bash scripts/fetch-pinned-archive.sh binaryen)"
  tool_dir="${tool_archive%.tar.gz}-source"
  if [[ ! -d "${tool_dir}" ]]; then
    rm -rf -- "${tool_dir}.partial"
    mkdir -- "${tool_dir}.partial"
    tar -xzf "${tool_archive}" --strip-components=1 -C "${tool_dir}.partial"
    mv -T -- "${tool_dir}.partial" "${tool_dir}"
  fi
  tool_inputs=()
  for tool_file in CMakeLists.txt config.h.in scripts/binaryen-lit.in src test/lit/CMakeLists.txt \
      test/lit/lit.site.cfg.py.in third_party/CMakeLists.txt third_party/FP16 third_party/llvm-project; do
    tool_inputs+=("${tool_dir}/${tool_file}" "/tmp/binaryen/${tool_file}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/tools/binaryen.tar" "${tool_inputs[@]}" \
    "${tool_dir}/LICENSE" /usr/share/licenses/binaryen/LICENSE \
    "${tool_dir}/third_party/FP16/LICENSE" /usr/share/licenses/binaryen/FP16-LICENSE
fi
# toybox's archive holds links, and its headers are generated by its scripts.
if has_image toybox; then
  tool_dir="$(bash demos/tools/prepare-toybox.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/toybox.tar" \
    "${tool_dir}/main.c" /tmp/toybox/main.c \
    "${tool_dir}/toys.h" /tmp/toybox/toys.h \
    "${tool_dir}/lib" /tmp/toybox/lib \
    "${tool_dir}/toys/posix/grep.c" /tmp/toybox/toys/posix/grep.c \
    "${tool_dir}/toys/posix/sed.c" /tmp/toybox/toys/posix/sed.c \
    "${tool_dir}/generated/config.h" /tmp/toybox/generated/config.h \
    "${tool_dir}/generated/flags.h" /tmp/toybox/generated/flags.h \
    "${tool_dir}/generated/globals.h" /tmp/toybox/generated/globals.h \
    "${tool_dir}/generated/help.h" /tmp/toybox/generated/help.h \
    "${tool_dir}/generated/newtoys.h" /tmp/toybox/generated/newtoys.h \
    "${tool_dir}/generated/tags.h" /tmp/toybox/generated/tags.h \
    "${tool_dir}/LICENSE" /usr/share/licenses/toybox/LICENSE
fi
if has_image vi; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh neatvi)"
  node scripts/build-source-tar.mjs "${static_dir}/tools/neatvi.tar" \
    "${tool_dir}" /tmp/neatvi \
    "${tool_dir}/README" /usr/share/doc/vi/README
fi

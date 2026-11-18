# Sourced by scripts/prepare-image-sources.sh.
# Release archives that Dolly's tar reads as published, and Meson's and SCons' wheels
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
pigz pigz pigz-2.8.tar.gz
lz4 lz4 lz4-1.10.0.tar.gz
binaryen binaryen binaryen-version_133.tar.gz
tree tree unix-tree-2.3.2.tar.gz
dte dte dte-1.11.1.tar.gz
base64 base64 base64-0.5.2.tar.gz
sqlite linenoise linenoise-2.0.tar.gz
yacc byacc byacc-20260126.tgz
flex reflex reflex-20260131.tgz
meson meson meson-1.12.1-py3-none-any.whl
scons scons scons-4.10.1-py3-none-any.whl
ARCHIVES
# SCons' manual page, out of its source archive.
if has_image scons; then
  tar -xzOf "$(bash scripts/fetch-pinned-archive.sh scons_man)" scons-4.10.1/scons.1 > build/generated/scons.1
  copy_static build/generated/scons.1 tools/scons.1
fi
# xxd is one file of Vim's repository, with its manual page.
if has_image xxd; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh xxd)" tools/xxd.c
  copy_static "$(bash scripts/fetch-pinned-archive.sh xxd_man)" tools/xxd.1
fi
# The files a build reads, staged from pinned checkouts, unchanged, with licence
# and manual at their paths.
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
# Libraries that other demos build against, from their release archives, with their licences.
if has_image libpng; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh libpng)"
  node scripts/build-source-tar.mjs "${static_dir}/libpng/source.tar.gz" "${tool_dir}" /tmp/libpng \
    "${tool_dir}/LICENSE" /usr/share/licenses/libpng/LICENSE
fi
if has_image freetype; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh freetype)"
  node scripts/build-source-tar.mjs "${static_dir}/freetype/source.tar.gz" "${tool_dir}" /tmp/freetype \
    "${tool_dir}/LICENSE.TXT" /usr/share/licenses/freetype/LICENSE.TXT \
    "${tool_dir}/docs/FTL.TXT" /usr/share/licenses/freetype/FTL.TXT
fi
for library in brotli:LICENSE libjpeg-turbo:LICENSE.md:README.ijg libtiff:LICENSE.md expat:COPYING fmt:LICENSE \
    gperf:COPYING eigen:COPYING.README:COPYING.MPL2:COPYING.BSD:COPYING.APACHE:COPYING.MINPACK imath:LICENSE.md \
    libdeflate:COPYING openjph:LICENSE robin-map:LICENSE pugixml:LICENSE.md yaml-cpp:LICENSE pystring:LICENSE \
    minizip-ng:LICENSE opencolorio:LICENSE:THIRD-PARTY.md openimageio:LICENSE.md:THIRD-PARTY.md \
    onetbb:LICENSE.txt:third-party-programs.txt glslang:LICENSE.txt; do
  library_name="${library%%:*}"
  if has_image "${library_name}"; then
    tool_dir="$(bash scripts/fetch-pinned-source.sh "${library_name//-/_}")"
    library_licences=()
    IFS=: read -ra library_files <<< "${library#*:}"
    for tool_file in "${library_files[@]}"; do
      library_licences+=("${tool_dir}/${tool_file}" "/usr/share/licenses/${library_name}/${tool_file}")
    done
    node scripts/build-source-tar.mjs "${static_dir}/${library_name}/source.tar.gz" "${tool_dir}" "/tmp/${library_name}" \
      "${library_licences[@]}"
  fi
done
# OpenEXR's tests hold a symbolic link, which Dolly's tar refuses: its archive without them.
if has_image openexr; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh openexr)"
  tool_inputs=()
  for tool_file in "${tool_dir}"/* "${tool_dir}"/src/*; do
    [[ "${tool_file}" == "${tool_dir}/src" || "${tool_file}" == "${tool_dir}/src/test" ]] && continue
    tool_inputs+=("${tool_file}" "/tmp/openexr/${tool_file#"${tool_dir}/"}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/openexr/source.tar.gz" "${tool_inputs[@]}" \
    "${tool_dir}/LICENSE.md" /usr/share/licenses/openexr/LICENSE.md
fi
if has_image openimageio; then
  copy_static demos/tools/openimageio-dolly.patch openimageio/openimageio-dolly.patch
fi
if has_image pkgconf; then
  tool_dir="$(bash scripts/fetch-pinned-source.sh pkgconf)"
  node scripts/build-source-tar.mjs "${static_dir}/pkgconf/source.tar" \
    "${tool_dir}/libpkgconf" /tmp/pkgconf/libpkgconf \
    "${tool_dir}/cli" /tmp/pkgconf/cli \
    "${tool_dir}/COPYING" /usr/share/licenses/pkgconf/COPYING
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
# sbase's tar starts its compressor with posix_spawn instead of fork.
if has_image tar; then
  copy_static demos/tools/sbase-tar-spawn.patch tools/sbase-tar-spawn.patch
fi

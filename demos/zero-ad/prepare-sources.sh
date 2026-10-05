# Sourced by scripts/prepare-image-sources.sh.
if has_image zero-ad; then
  node demos/zero-ad/toolchain/prepare-distribution.mjs "${static_dir}/zero-ad"
fi
if has_image openal-build; then
  openal_dir="$(bash demos/zero-ad/prepare-openal.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/openal/source.tar" \
    "${openal_dir}" /tmp/openal/source \
    demos/zero-ad/test/fixtures/0ad-openal.cpp /tmp/openal/check.cpp \
    "${openal_dir}/COPYING" /usr/share/licenses/OpenAL/COPYING \
    "${openal_dir}/BSD-3Clause" /usr/share/licenses/OpenAL/BSD-3Clause \
    "${openal_dir}/LICENSE-pffft" /usr/share/licenses/OpenAL/LICENSE-pffft \
    "${openal_dir}/fmt-11.1.1/LICENSE" /usr/share/licenses/OpenAL/fmt
fi
if has_image zero-ad-deps || has_image zero-ad-engine; then
  zad_dir="$(bash demos/zero-ad/prepare-build-sources.sh)"
fi
if has_image zero-ad-deps; then
  node scripts/build-source-tar.mjs "${static_dir}/zero-ad-build/deps.tar.gz" \
    "${zad_dir}/pkgconf-2.5.1/libpkgconf" /tmp/zad/pkgconf/libpkgconf \
    "${zad_dir}/pkgconf-2.5.1/cli" /tmp/zad/pkgconf/cli \
    "${zad_dir}/pkgconf-2.5.1/COPYING" /usr/share/licenses/pkgconf/COPYING \
    "${zad_dir}/libpng-1.6.58/LICENSE" /usr/share/licenses/libpng/LICENSE \
    "${zad_dir}/freetype-VER-2-14-3/LICENSE.TXT" /usr/share/licenses/freetype/LICENSE.TXT \
    "${zad_dir}/freetype-VER-2-14-3/docs/FTL.TXT" /usr/share/licenses/freetype/FTL.TXT \
    "${zad_dir}/libogg-1.3.5/COPYING" /usr/share/licenses/libogg/COPYING \
    "${zad_dir}/libvorbis-1.3.7/COPYING" /usr/share/licenses/libvorbis/COPYING \
    "${zad_dir}/fmt-7.1.3/LICENSE.rst" /usr/share/licenses/fmt/LICENSE.rst \
    "${zad_dir}/libxml2-2.13.5/Copyright" /usr/share/licenses/libxml2/Copyright \
    "${zad_dir}/icu/LICENSE" /usr/share/licenses/icu/LICENSE \
    "${zad_dir}/libsodium-1.0.20/LICENSE" /usr/share/licenses/libsodium/LICENSE \
    "${zad_dir}/enet-1.3.18/LICENSE" /usr/share/licenses/enet/LICENSE \
    "${zad_dir}/libpng-1.6.58" /tmp/zad/png \
    "${zad_dir}/freetype-VER-2-14-3" /tmp/zad/freetype \
    "${zad_dir}/libogg-1.3.5" /tmp/zad/ogg \
    "${zad_dir}/libvorbis-1.3.7" /tmp/zad/vorbis \
    "${zad_dir}/fmt-7.1.3" /tmp/zad/fmt \
    "${zad_dir}/libxml2-2.13.5" /tmp/zad/xml2 \
    "${zad_dir}/icu/source/common" /tmp/zad/icu/common \
    "${zad_dir}/icu/source/i18n" /tmp/zad/icu/i18n \
    "${zad_dir}/icu/source/stubdata" /tmp/zad/icu/stubdata \
    "${zad_dir}/libsodium-1.0.20/src/libsodium" /tmp/zad/sodium/src/libsodium \
    "${zad_dir}/libsodium-1.0.20/builds/msvc/version.h" /tmp/zad/sodium/builds/msvc/version.h \
    demos/zero-ad/sodium.patch /tmp/zad/sodium.patch \
    "${zad_dir}/enet-1.3.18" /tmp/zad/enet \
    demos/zero-ad/enet-dolly.c /tmp/zad/enet-dolly.c \
    "${zad_dir}/boost" /tmp/zad/boost/boost \
    demos/zero-ad/test/fixtures/0ad-enet.c /tmp/zad/enet-check.c \
    demos/zero-ad/test/fixtures/0ad-openal.cpp /tmp/zad/openal-check.cpp
fi
if has_image zero-ad-engine; then
  zad_source="${zad_dir}/0ad-$(source config/source-pins.sh && echo "${DOLLY_0AD_VERSION}")"
  node scripts/build-source-tar.mjs "${static_dir}/zero-ad-build/engine.tar.gz" \
    "${zad_source}/build/premake" /tmp/0ad/build/premake \
    "${zad_source}/build/build_version" /tmp/0ad/build/build_version \
    "${zad_source}/source" /tmp/0ad/source \
    "${zad_source}/libraries/source/cxxtest-4.4" /tmp/0ad/libraries/source/cxxtest-4.4 \
    "${zad_dir}/premake-core-5.0.0-beta7" /tmp/premake-core-5.0.0-beta7 \
    "${zad_source}/LICENSE.md" /tmp/0ad/LICENSE.md \
    demos/zero-ad/engine.patch /tmp/0ad-patches/engine.patch \
    demos/zero-ad/premake-dolly.patch /tmp/0ad-patches/premake.patch \
    demos/zero-ad/test/fixtures/0ad-spidermonkey.cpp /tmp/0ad-patches/spidermonkey-check.cpp
  # Bootstrap exception: SpiderMonkey cross-compiled by toolchain/build-spidermonkey.sh.
  mozjs_source=".cache/0ad/0ad-$(source config/source-pins.sh && echo "${DOLLY_0AD_VERSION}")/libraries/source/spidermonkey/mozjs-128.13.0"
  mozjs_build="${mozjs_source}/obj-dolly"
  mozjs_inputs=()
  while IFS= read -r header; do
    target="$(readlink "${mozjs_build}/dist/${header}" || true)"
    # The container build links headers by their /src paths.
    if [[ "${target}" == /src/* ]]; then source_header="${project_dir}/${target#/src/}"; else source_header="${mozjs_build}/dist/${header}"; fi
    mozjs_inputs+=("$(realpath "${source_header}")" "/tmp/mozjs/${header}")
  done < <(cd "${mozjs_build}/dist" && find include \( -type f -o -type l \) | sort)
  # The notices of the Rust crates compiled into libjsrust.a.
  for crate in $(ls "${mozjs_build}/wasm64-emscripten-probe/release/deps" | sed -nE 's/^lib(.+)-[0-9a-f]{16}\.rlib$/\1/p' | sort -u); do
    for name in "${crate}" "${crate//_/-}"; do
      [[ -d "${mozjs_source}/third_party/rust/${name}" ]] || continue
      for notice in "${mozjs_source}/third_party/rust/${name}"/{LICENSE,COPYING,COPYRIGHT,UNLICENSE}*; do
        if [[ -f "${notice}" ]]; then
          mozjs_inputs+=("${notice}" "/usr/share/licenses/spidermonkey/crates/${name}/${notice##*/}")
        fi
      done
      break
    done
  done
  node scripts/build-source-tar.mjs "${static_dir}/zero-ad-build/mozjs-host.tar.gz" "${mozjs_inputs[@]}" \
    "${mozjs_build}/js/src/build/libjs_static.a" /tmp/mozjs/lib/libjs_static.a \
    "${mozjs_build}/wasm64-emscripten-probe/release/libjsrust.a" /tmp/mozjs/lib/libjsrust.a \
    "${mozjs_source}/LICENSE" /usr/share/licenses/spidermonkey/LICENSE \
    "${mozjs_source}/nsprpub/LICENSE" /usr/share/licenses/spidermonkey/MPL-2.0
  # Corresponding source of what is built outside Dolly: SpiderMonkey's pinned
  # tarball with 0 A.D.'s patches, and the scripts that cross-build it and
  # translate the game data's shaders.
  node scripts/build-source-tar.mjs "${static_dir}/zero-ad-build/bootstrap.tar" \
    "${zad_source}/libraries/source/spidermonkey" /tmp/zero-ad-bootstrap/spidermonkey \
    demos/zero-ad/toolchain /tmp/zero-ad-bootstrap/toolchain
fi

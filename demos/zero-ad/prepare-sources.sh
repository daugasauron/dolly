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
if has_image zero-ad-deps || has_image zero-ad-engine || has_image zero-ad-spidermonkey; then
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
fi
if has_image zero-ad-spidermonkey; then
  # SpiderMonkey's pinned tarball without the test suites a --disable-tests build
  # never reads (490 MB), 0 A.D.'s patches and Dolly's.
  spidermonkey="${zad_dir}/0ad-$(source config/source-pins.sh && echo "${DOLLY_0AD_VERSION}")/libraries/source/spidermonkey"
  mozjs_dir="${zad_dir}/mozjs-128.13.0"
  if [[ ! -d "${mozjs_dir}" ]]; then
    # Prune the test suites a --disable-tests build never reads (490 MB). Keep
    # js/src/tests/style, which check_spidermonkey_style.py reads at build time.
    tar -xf "${spidermonkey}/mozjs-128.13.0.tar.xz" -C "${zad_dir}" \
      --exclude='mozjs-128.13.0/js/src/tests/test262' --exclude='mozjs-128.13.0/js/src/tests/non262' \
      --exclude='mozjs-128.13.0/js/src/jit-test' --exclude='mozjs-128.13.0/testing/web-platform'
  fi
  node scripts/build-source-tar.mjs "${static_dir}/zero-ad-build/mozjs.tar.gz" \
    "${mozjs_dir}" /tmp/mozjs/mozjs-128.13.0 \
    "${spidermonkey}/patches" /tmp/mozjs/patches \
    demos/zero-ad/toolchain/spidermonkey.patch /tmp/mozjs/spidermonkey.patch
fi

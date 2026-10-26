# Sourced by scripts/prepare-image-sources.sh.
if has_image openal; then
  openal_dir="$(bash demos/zero-ad/prepare-openal.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/openal/source.tar" \
    "${openal_dir}" /tmp/openal/source \
    demos/zero-ad/test/fixtures/0ad-openal.cpp /tmp/openal/check.cpp \
    "${openal_dir}/COPYING" /usr/share/licenses/OpenAL/COPYING \
    "${openal_dir}/BSD-3Clause" /usr/share/licenses/OpenAL/BSD-3Clause \
    "${openal_dir}/LICENSE-pffft" /usr/share/licenses/OpenAL/LICENSE-pffft \
    "${openal_dir}/fmt-11.1.1/LICENSE" /usr/share/licenses/OpenAL/fmt
fi
if has_image zero-ad-deps || has_image zero-ad-engine || has_image spidermonkey ||
   has_image pkgconf || has_image libpng || has_image freetype || has_image zero-ad-data; then
  zad_dir="$(bash demos/zero-ad/prepare-build-sources.sh)"
fi
if has_image zero-ad-data; then
  data_archive="$(source config/source-pins.sh && bash scripts/fetch-verified-file.sh "${DOLLY_0AD_DATA_URL}" \
    "${DOLLY_0AD_DATA_SHA256}" ".cache/0ad/0ad-${DOLLY_0AD_VERSION}-unix-data.tar.xz")"
  # One SOURCE holds at most 1 GiB: the release archive travels in two halves.
  data_halves="${static_dir}/zero-ad-data/0ad-unix-data.tar.xz"
  if [[ ! -f "${data_halves}.1" || ! -f "${data_halves}.2" ||
        $(( $(stat -c %s "${data_halves}.1") + $(stat -c %s "${data_halves}.2") )) != "$(stat -c %s "${data_archive}")" ]]; then
    mkdir -p "${static_dir}/zero-ad-data"
    rm -f "${data_halves}.1" "${data_halves}.2"
    split -n 2 -d -a 1 --numeric-suffixes=1 "${data_archive}" "${data_halves}."
  fi
  # Beside Dolly's scripts and ICU's data, the engine's translations and the
  # licences, which the source release holds and the data release does not.
  data_source="${zad_dir}/0ad-$(source config/source-pins.sh && echo "${DOLLY_0AD_VERSION}")"
  node scripts/build-source-tar.mjs "${static_dir}/zero-ad-data/tools.tar" \
    demos/zero-ad/toolchain/package-data.py /tmp/0ad-tools/package-data.py \
    demos/zero-ad/toolchain/shaders.py /tmp/0ad-tools/shaders.py \
    demos/zero-ad/toolchain/border-sampler.wgsl /tmp/0ad-tools/border-sampler.wgsl \
    demos/zero-ad/toolchain/data.patch /tmp/0ad-tools/data.patch \
    "${zad_dir}/icu/source/data/in/icudt68l.dat" /tmp/0ad-tools/icudt68l.dat \
    "${data_source}/binaries/data/l10n" /tmp/0ad-source/l10n \
    "${data_source}/LICENSE.md" /tmp/0ad-source/LICENSE.md \
    "${data_source}/license_gpl-2.0.txt" /tmp/0ad-source/license_gpl-2.0.txt \
    "${data_source}/license_lgpl-2.1.txt" /tmp/0ad-source/license_lgpl-2.1.txt \
    "${data_source}/license_mit.txt" /tmp/0ad-source/license_mit.txt
fi
if has_image pkgconf; then
  node scripts/build-source-tar.mjs "${static_dir}/pkgconf/source.tar" \
    "${zad_dir}/pkgconf-2.5.1/libpkgconf" /tmp/pkgconf/libpkgconf \
    "${zad_dir}/pkgconf-2.5.1/cli" /tmp/pkgconf/cli \
    "${zad_dir}/pkgconf-2.5.1/COPYING" /usr/share/licenses/pkgconf/COPYING
fi
if has_image libpng; then
  node scripts/build-source-tar.mjs "${static_dir}/libpng/source.tar.gz" \
    "${zad_dir}/libpng-1.6.58" /tmp/libpng \
    "${zad_dir}/libpng-1.6.58/LICENSE" /usr/share/licenses/libpng/LICENSE
fi
if has_image freetype; then
  node scripts/build-source-tar.mjs "${static_dir}/freetype/source.tar.gz" \
    "${zad_dir}/freetype-VER-2-14-3" /tmp/freetype \
    "${zad_dir}/freetype-VER-2-14-3/LICENSE.TXT" /usr/share/licenses/freetype/LICENSE.TXT \
    "${zad_dir}/freetype-VER-2-14-3/docs/FTL.TXT" /usr/share/licenses/freetype/FTL.TXT
fi
if has_image zero-ad-deps; then
  node scripts/build-source-tar.mjs "${static_dir}/zero-ad-build/deps.tar.gz" \
    "${zad_dir}/fmt-7.1.3/LICENSE.rst" /usr/share/licenses/fmt/LICENSE.rst \
    "${zad_dir}/libxml2-2.13.5/Copyright" /usr/share/licenses/libxml2/Copyright \
    "${zad_dir}/icu/LICENSE" /usr/share/licenses/icu/LICENSE \
    "${zad_dir}/libsodium-1.0.20/LICENSE" /usr/share/licenses/libsodium/LICENSE \
    "${zad_dir}/enet-1.3.18/LICENSE" /usr/share/licenses/enet/LICENSE \
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
if has_image spidermonkey; then
  # SpiderMonkey's pinned tarball without the test suites a --disable-tests build
  # never reads (490 MB), 0 A.D.'s patches and Dolly's.
  spidermonkey="${zad_dir}/0ad-$(source config/source-pins.sh && echo "${DOLLY_0AD_VERSION}")/libraries/source/spidermonkey"
  # Staged again (7 s) only when this script (its exclude list), Dolly's patch
  # or the archive writer changed; the rest of its inputs key zad_dir. Prune
  # the test suites a --disable-tests build never reads (490 MB); keep
  # js/src/tests/style, which check_spidermonkey_style.py reads.
  mozjs_dir="${zad_dir}/mozjs-128.13.0"
  mozjs_source="${zad_dir}/spidermonkey-source.tar.gz"
  mozjs_key="$(sha256sum demos/zero-ad/prepare-sources.sh demos/zero-ad/toolchain/spidermonkey.patch scripts/build-source-tar.mjs | sha256sum)"
  if [[ ! -f "${mozjs_source}" || "$(cat "${mozjs_source}.inputs" 2> /dev/null)" != "${mozjs_key}" ]]; then
    rm -rf "${mozjs_dir}" "${mozjs_source}.inputs"
    tar -xf "${spidermonkey}/mozjs-128.13.0.tar.xz" -C "${zad_dir}" \
      --exclude='mozjs-128.13.0/js/src/tests/test262' --exclude='mozjs-128.13.0/js/src/tests/non262' \
      --exclude='mozjs-128.13.0/js/src/jit-test' --exclude='mozjs-128.13.0/testing/web-platform'
    node scripts/build-source-tar.mjs "${mozjs_source}" \
      "${mozjs_dir}" /tmp/mozjs/mozjs-128.13.0 \
      "${spidermonkey}/patches" /tmp/mozjs/patches \
      demos/zero-ad/toolchain/spidermonkey.patch /tmp/mozjs/spidermonkey.patch
    printf '%s\n' "${mozjs_key}" > "${mozjs_source}.inputs"
  fi
  copy_static "${mozjs_source}" spidermonkey/source.tar.gz
fi

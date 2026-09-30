# Sourced by scripts/prepare-image-sources.sh.
if has_module zero-ad; then
  node demos/zero-ad/toolchain/prepare-distribution.mjs "${static_dir}/zero-ad"
fi
if has_module openal; then
  openal_dir="$(bash demos/zero-ad/prepare-openal.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/openal/source.tar" \
    "${openal_dir}" /tmp/openal/source \
    demos/zero-ad/test/fixtures/0ad-openal.cpp /tmp/openal/check.cpp \
    "${openal_dir}/COPYING" /usr/share/licenses/OpenAL/COPYING \
    "${openal_dir}/BSD-3Clause" /usr/share/licenses/OpenAL/BSD-3Clause \
    "${openal_dir}/LICENSE-pffft" /usr/share/licenses/OpenAL/LICENSE-pffft \
    "${openal_dir}/fmt-11.1.1/LICENSE" /usr/share/licenses/OpenAL/fmt
fi

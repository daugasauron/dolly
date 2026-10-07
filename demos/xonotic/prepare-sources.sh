# Sourced by scripts/prepare-image-sources.sh.
if has_image xonotic-build; then
  xonotic_dir="$(bash demos/xonotic/prepare-xonotic.sh)"
  jpeg_archive="$(bash scripts/fetch-pinned-archive.sh jpeg)"
  jpeg_dir="build/generated/jpeg-$(source config/source-pins.sh && echo "${DOLLY_JPEG_VERSION}")"
  if [[ ! -d "${jpeg_dir}" ]]; then mkdir -p build/generated && tar -xzf "${jpeg_archive}" -C build/generated; fi
  node scripts/build-source-tar.mjs "${static_dir}/xonotic/source.tar.gz" \
    "${jpeg_dir}" /usr/src/xonotic/jpeg \
    "${jpeg_dir}/README" /usr/share/licenses/libjpeg/README \
    "${xonotic_dir}/darkplaces" /usr/src/xonotic/darkplaces \
    "${xonotic_dir}/d0_blind_id" /usr/src/xonotic/d0_blind_id \
    "${xonotic_dir}/gmqcc" /usr/src/xonotic/gmqcc \
    "${xonotic_dir}/qcsrc" /usr/src/xonotic/qcsrc \
    "${xonotic_dir}/COPYING" /usr/share/licenses/xonotic/COPYING \
    "${xonotic_dir}/GPL-2" /usr/share/licenses/xonotic/GPL-2 \
    "${xonotic_dir}/GPL-3" /usr/share/licenses/xonotic/GPL-3 \
    "${xonotic_dir}/gmqcc/LICENSE" /usr/share/licenses/gmqcc/LICENSE \
    demos/xonotic/Makefile /usr/src/dolly/xonotic/Makefile \
    demos/xonotic/simd-unit.c /usr/src/dolly/xonotic/simd-unit.c
fi
if has_image xonotic; then
  xonotic_data="$(bash demos/xonotic/prepare-xonotic-data.sh)"
  for archive in font-unifont-20230620.pk3 font-xolonium-20230620.pk3 xonotic-20230620-data.pk3 xonotic-20230620-maps.pk3; do
    copy_static "${xonotic_data}/${archive}" "xonotic/data/${archive}"
  done
fi

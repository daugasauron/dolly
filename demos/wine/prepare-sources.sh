# Sourced by scripts/prepare-image-sources.sh.
if has_image wine-build; then
  wine_dir="$(bash demos/wine/prepare-wine.sh)"
  mspaint_dir="$(bash demos/wine/prepare-mspaint.sh)"
  netsurf_dir="$(bash demos/wine/prepare-netsurf.sh)"
  jpeg_archive="$(bash scripts/fetch-pinned-archive.sh jpeg)"
  jpeg_dir="build/generated/jpeg-$(source config/source-pins.sh && echo "${DOLLY_JPEG_VERSION}")"
  if [[ ! -d "${jpeg_dir}" ]]; then mkdir -p build/generated && tar -xzf "${jpeg_archive}" -C build/generated; fi
  netsurf_licences=("${netsurf_dir}/libutf8proc/LICENSE.md" /usr/share/licenses/netsurf/libutf8proc-LICENSE.md)
  for licence in "${netsurf_dir}"/lib*/COPYING; do
    netsurf_licences+=("${licence}" "/usr/share/licenses/netsurf/$(basename "$(dirname "${licence}")")-COPYING")
  done
  gimp_dir="$(bash demos/wine/prepare-gimp.sh)"
  gimp_licences=("${gimp_dir}/gimp/COPYING" /usr/share/licenses/gimp/COPYING "${gimp_dir}/gimp/LICENSE" /usr/share/licenses/gimp/LICENSE
    "${gimp_dir}/pango/pango/opentype/COPYING" /usr/share/licenses/gimp/pango-opentype-COPYING)
  for library in glib atk pango gtk libart_lgpl fontconfig expat; do
    gimp_licences+=("${gimp_dir}/${library}/COPYING" "/usr/share/licenses/gimp/${library}-COPYING")
  done
  # NetSurf's site: addresses are files of the version it was built for, as amy's index is.
  node -p '`#define DOLLY_VERSION "${require("./package.json").version}"`' > "${staging}/netsurf-version.h"
  wine_port_inputs=()
  for entry in Makefile module.mk config.h shared-names.txt winebuild-dolly.c icall.c port dlls programs; do
    wine_port_inputs+=("demos/wine/${entry}" "/usr/src/dolly/wine/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/wine/source.tar.gz" \
    "${wine_dir}" /usr/src/wine \
    "${wine_dir}/COPYING.LIB" /usr/share/licenses/wine/COPYING.LIB \
    "${wine_dir}/LICENSE" /usr/share/licenses/wine/LICENSE \
    "${wine_dir}/AUTHORS" /usr/share/licenses/wine/AUTHORS \
    demos/wine/wine-dolly.patch /usr/src/dolly/wine/wine-dolly.patch \
    "${mspaint_dir}" /usr/src/dolly/wine/programs/mspaint \
    "${mspaint_dir}/COPYING.LIB" /usr/share/licenses/reactos-paint/COPYING.LIB \
    "${netsurf_dir}" /usr/src/dolly/wine/programs/netsurf \
    "${staging}/netsurf-version.h" /usr/src/dolly/wine/programs/netsurf/version.h \
    "${netsurf_dir}/netsurf/COPYING" /usr/share/licenses/netsurf/COPYING \
    "${netsurf_licences[@]}" \
    "${jpeg_dir}" /usr/src/dolly/wine/programs/netsurf/jpeg \
    "${jpeg_dir}/README" /usr/share/licenses/libjpeg/README \
    "${gimp_dir}" /usr/src/dolly/wine/programs/gimp \
    "${gimp_licences[@]}" \
    "${wine_port_inputs[@]}"
  tinycc_dir="$(bash demos/wine/prepare-tinycc.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/wine/tinycc.tar.gz" \
    "${tinycc_dir}/tcc" /usr/share/wine/x86/tcc \
    "${tinycc_dir}/COPYING" /usr/share/licenses/tinycc/COPYING \
    "${tinycc_dir}/tcc-source.tar.bz2" /usr/src/tinycc/tcc-source.tar.bz2
fi

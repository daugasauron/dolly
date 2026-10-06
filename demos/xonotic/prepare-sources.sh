# Sourced by scripts/prepare-image-sources.sh.
if has_image xonotic-build; then
  xonotic_dir="$(bash demos/xonotic/prepare-xonotic.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/xonotic/source.tar.gz" \
    "${xonotic_dir}/darkplaces" /usr/src/xonotic/darkplaces \
    "${xonotic_dir}/d0_blind_id" /usr/src/xonotic/d0_blind_id \
    "${xonotic_dir}/gmqcc" /usr/src/xonotic/gmqcc \
    "${xonotic_dir}/qcsrc" /usr/src/xonotic/qcsrc \
    "${xonotic_dir}/COPYING" /usr/share/licenses/xonotic/COPYING \
    "${xonotic_dir}/GPL-2" /usr/share/licenses/xonotic/GPL-2 \
    "${xonotic_dir}/GPL-3" /usr/share/licenses/xonotic/GPL-3 \
    "${xonotic_dir}/gmqcc/LICENSE" /usr/share/licenses/gmqcc/LICENSE \
    demos/xonotic/Makefile /usr/src/dolly/xonotic/Makefile \
    demos/xonotic/sockets.c /usr/src/dolly/xonotic/sockets.c
fi

# Sourced by scripts/prepare-image-sources.sh.
if has_image wine-build; then
  wine_dir="$(bash demos/wine/prepare-wine.sh)"
  mspaint_dir="$(bash demos/wine/prepare-mspaint.sh)"
  wine_port_inputs=()
  for entry in Makefile module.mk config.h shared-names.txt winebuild-dolly.c port dlls programs; do
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
    "${wine_port_inputs[@]}"
fi

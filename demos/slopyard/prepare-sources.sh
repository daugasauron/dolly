# Sourced by scripts/prepare-image-sources.sh.
if has_image lua5.5; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh lua55)" slopyard/lua-5.5.1.tar.gz
fi
if has_image slopyard-build; then
  node demos/slopyard/prepare-slopyard.mjs "${static_dir}/slopyard/source.tar"
fi
if has_image raylib; then
  raylib_dir="$(scripts/fetch-pinned-checkout.sh raylib)"
  node scripts/build-source-tar.mjs "${static_dir}/gamedev/raylib.tar" \
    "${raylib_dir}/src" /usr/src/raylib/src \
    "${raylib_dir}/LICENSE" /usr/share/licenses/raylib/LICENSE \
    "${raylib_dir}/README.md" /usr/src/raylib/README.md
fi
if has_image box3d || has_image gamedev-sdk; then
  box3d_dir="$(scripts/fetch-pinned-checkout.sh box3d)"
  node scripts/build-source-tar.mjs "${static_dir}/gamedev/box3d.tar" \
    "${box3d_dir}/src" /usr/src/box3d/src \
    "${box3d_dir}/include" /usr/src/box3d/include \
    "${box3d_dir}/LICENSE" /usr/share/licenses/box3d/LICENSE \
    "${box3d_dir}/README.md" /usr/src/box3d/README.md
fi

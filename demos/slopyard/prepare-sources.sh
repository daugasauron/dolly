# Sourced by scripts/prepare-image-sources.sh.
if has_module lua55; then
  lua55_archive="$(scripts/fetch-pinned-archive.sh lua55)"
  copy_static "${lua55_archive}" slopyard/lua-5.5.1.tar.gz
fi
if has_module slopyard; then
  node demos/slopyard/prepare-slopyard.mjs "${static_dir}/slopyard/source.tar"
fi
if has_module gamedev-sdk; then
  raylib_dir="$(scripts/fetch-pinned-checkout.sh raylib)"
  box3d_dir="$(scripts/fetch-pinned-checkout.sh box3d)"
  node scripts/build-source-tar.mjs "${static_dir}/gamedev/raylib.tar" \
    "${raylib_dir}/src" /usr/src/raylib/src \
    "${raylib_dir}/LICENSE" /usr/share/licenses/raylib/LICENSE \
    "${raylib_dir}/README.md" /usr/src/raylib/README.md
  node scripts/build-source-tar.mjs "${static_dir}/gamedev/box3d.tar" \
    "${box3d_dir}/src" /usr/src/box3d/src \
    "${box3d_dir}/include" /usr/src/box3d/include \
    "${box3d_dir}/LICENSE" /usr/share/licenses/box3d/LICENSE \
    "${box3d_dir}/README.md" /usr/src/box3d/README.md
fi

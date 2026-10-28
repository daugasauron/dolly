# Sourced by scripts/prepare-image-sources.sh.
if has_image lean-stage0; then
  # The release's sources unchanged, without its tests and documentation (its
  # archive starts with a pax header, which Dolly's tar does not read), and
  # Dolly's part of the build.
  lean_dir="$(bash scripts/fetch-pinned-source.sh lean)"
  node scripts/build-source-tar.mjs "${static_dir}/lean/lean.tar.gz" \
    "${lean_dir}/stage0" /tmp/lean/stage0 "${lean_dir}/src" /tmp/lean/src "${lean_dir}/LICENSE" /tmp/lean/LICENSE
  node scripts/build-source-tar.mjs "${static_dir}/lean/port.tar" \
    demos/lean/lean-dolly.mk /tmp/lean/dolly/lean-dolly.mk \
    demos/lean/lean-dolly.patch /tmp/lean/dolly/lean-dolly.patch \
    demos/lean/lean-symbols.c /tmp/lean/dolly/lean-symbols.c \
    demos/lean/lean-stack.c /tmp/lean/dolly/lean-stack.c
fi

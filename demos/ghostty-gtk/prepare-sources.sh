# Sourced by scripts/prepare-image-sources.sh.
if has_image mesa-build; then
  # Mesa patched, with its parsers made on the host (prepare-mesa.sh), and the
  # Python modules its build runs, as published.
  node scripts/build-source-tar.mjs "${static_dir}/ghostty-gtk/mesa.tar.gz" "$(bash demos/ghostty-gtk/prepare-mesa.sh)" /tmp/mesa/mesa
  copy_static "$(bash scripts/fetch-pinned-archive.sh mako)" ghostty-gtk/mako-1.4.3-py3-none-any.whl
  copy_static "$(bash scripts/fetch-pinned-archive.sh packaging)" ghostty-gtk/packaging-26.3-py3-none-any.whl
  copy_static "$(bash scripts/fetch-pinned-archive.sh markupsafe)" ghostty-gtk/markupsafe-3.0.3.tar.gz
  copy_static "$(bash scripts/fetch-pinned-archive.sh pyyaml)" ghostty-gtk/pyyaml-6.0.3.tar.gz
  copy_static demos/ghostty-gtk/epoxy-dolly.patch ghostty-gtk/epoxy-dolly.patch
fi
if has_image ghostty-gtk; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh libxml2)" ghostty-gtk/libxml2-2.13.5.tar.xz
  copy_static "$(bash scripts/fetch-pinned-archive.sh libadwaita)" ghostty-gtk/libadwaita-1.10.0.tar.xz
  copy_static "$(bash scripts/fetch-pinned-archive.sh blueprint_compiler)" ghostty-gtk/blueprint-compiler-0.18.0.tar.gz
  copy_static demos/ghostty-gtk/blueprint-compiler-dolly.patch ghostty-gtk/blueprint-compiler-dolly.patch
  node scripts/build-source-tar.mjs "${static_dir}/ghostty-gtk/typelibs.tar" \
    "$(bash demos/ghostty-gtk/prepare-typelibs.sh)" /usr/lib/girepository-1.0
  # Ghostty patched, with the packages its build fetches (prepare-ghostty.sh).
  node scripts/build-source-tar.mjs "${static_dir}/ghostty-gtk/ghostty.tar.gz" \
    "$(bash demos/ghostty-gtk/prepare-ghostty.sh)" /tmp/ghostty
fi

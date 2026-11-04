# Sourced by scripts/prepare-image-sources.sh.
if has_image mesa-build; then
  # Mesa patched, with its parsers made on the host (prepare-mesa.sh), and the
  # Python modules its build runs, as published.
  node scripts/build-source-tar.mjs "${static_dir}/ghostty-gtk/mesa.tar.gz" "$(bash demos/ghostty-gtk/prepare-mesa.sh)" /tmp/mesa/mesa
  copy_static "$(bash scripts/fetch-pinned-archive.sh mako)" ghostty-gtk/mako-1.4.3-py3-none-any.whl
  copy_static "$(bash scripts/fetch-pinned-archive.sh packaging)" ghostty-gtk/packaging-26.3-py3-none-any.whl
  copy_static "$(bash scripts/fetch-pinned-archive.sh markupsafe)" ghostty-gtk/markupsafe-3.0.3.tar.gz
  copy_static "$(bash scripts/fetch-pinned-archive.sh pyyaml)" ghostty-gtk/pyyaml-6.0.3.tar.gz
fi
if has_image ghostty-gtk; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh libadwaita)" ghostty-gtk/libadwaita-1.10.0.tar.xz
  # Ghostty patched, with the packages its build fetches (prepare-ghostty.sh).
  node scripts/build-source-tar.mjs "${static_dir}/ghostty-gtk/ghostty.tar.gz" \
    "$(bash demos/ghostty-gtk/prepare-ghostty.sh)" /tmp/ghostty
fi

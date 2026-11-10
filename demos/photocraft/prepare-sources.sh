# Sourced by scripts/prepare-image-sources.sh.
if has_image photocraft; then
  python3 demos/photocraft/prepare-photocraft-sources.py
  for part in build/photocraft-source-parts/*.part build/photocraft-source-parts/great-wave.jpg; do
    copy_static "${part}" "photocraft/$(basename "${part}")"
  done
fi

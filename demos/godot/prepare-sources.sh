# Sourced by scripts/prepare-image-sources.sh.
# Godot's release, unchanged, with Dolly's platform (platform/) as its platform/dolly.
if has_image godot || has_image godot-editor; then
  godot_dir="build/generated/godot-$(source config/source-pins.sh && echo "${DOLLY_GODOT_VERSION}")-stable"
  if [[ ! -d "${godot_dir}" ]]; then mkdir -p build/generated && tar -xf "$(bash scripts/fetch-pinned-archive.sh godot)" -C build/generated; fi
  node scripts/build-source-tar.mjs "${static_dir}/godot/source.tar.gz" \
    "${godot_dir}" /usr/src/godot \
    demos/godot/platform /usr/src/godot/platform/dolly
fi
# The demo projects' release publishes each project as a zip.
if has_image dodge-the-creeps; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh godot_dodge)" godot/2d_dodge_the_creeps.zip
fi

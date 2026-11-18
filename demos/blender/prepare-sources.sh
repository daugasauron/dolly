# Sourced by scripts/prepare-image-sources.sh.
if has_image blender; then
  blender_dir="$(bash demos/blender/prepare-build-sources.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/blender/blender.tar.gz" \
    demos/blender/blender-dolly.patch /tmp/blender/blender-dolly.patch \
    "${blender_dir}/blender-5.3.0" /tmp/blender/source
fi

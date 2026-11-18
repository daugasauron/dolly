# Sourced by scripts/prepare-image-sources.sh.
if has_image blender; then
  blender_dir="$(bash demos/blender/prepare-build-sources.sh)"
  # Dolly's files in Blender's tree: the GHOST system and the GPU module's WebGPU backend.
  ghost=/tmp/blender/source/intern/ghost/intern
  node scripts/build-source-tar.mjs "${static_dir}/blender/blender.tar.gz" \
    demos/blender/blender-dolly.patch /tmp/blender/blender-dolly.patch \
    "${blender_dir}/blender-5.3.0" /tmp/blender/source \
    demos/blender/ghost/GHOST_ContextWebGPU.hh "${ghost}/GHOST_ContextWebGPU.hh" \
    demos/blender/ghost/GHOST_SystemDolly.cc "${ghost}/GHOST_SystemDolly.cc" \
    demos/blender/ghost/GHOST_SystemDolly.hh "${ghost}/GHOST_SystemDolly.hh" \
    demos/blender/ghost/GHOST_WindowDolly.cc "${ghost}/GHOST_WindowDolly.cc" \
    demos/blender/ghost/GHOST_WindowDolly.hh "${ghost}/GHOST_WindowDolly.hh" \
    demos/blender/webgpu /tmp/blender/source/source/blender/gpu/webgpu
fi

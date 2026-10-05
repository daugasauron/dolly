# Sourced by scripts/prepare-image-sources.sh.
if has_image sdl2; then
  sdl2_dir="$(bash demos/sdl2/prepare-sdl2.sh)"
  sdl2_inputs=()
  for entry in src include cmake CMakeLists.txt SDL2Config.cmake.in SDL2.spec.in \
    sdl2.pc.in sdl2-config.in sdl2.m4 cmake_uninstall.cmake.in LICENSE.txt; do
    sdl2_inputs+=("${sdl2_dir}/${entry}" "/tmp/sdl2/source/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/sdl2/source.tar" \
    "${sdl2_inputs[@]}" \
    "${sdl2_dir}/LICENSE.txt" /usr/share/licenses/SDL2/LICENSE.txt
fi

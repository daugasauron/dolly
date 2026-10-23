# Sourced by scripts/prepare-image-sources.sh.
# imgui-x11 builds both again where X's libraries are.
if has_image sdl2 || has_image imgui-x11; then
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
if has_image imgui || has_image imgui-x11; then
  imgui_archive="$(bash scripts/fetch-pinned-archive.sh imgui)"
  imgui_dir="build/generated/imgui-$(source config/source-pins.sh && echo "${DOLLY_IMGUI_VERSION}")"
  if [[ ! -d "${imgui_dir}" ]]; then mkdir -p build/generated && tar -xzf "${imgui_archive}" -C build/generated; fi
  imgui_inputs=()
  for entry in imgui.cpp imgui_draw.cpp imgui_tables.cpp imgui_widgets.cpp imgui_demo.cpp imgui.h imgui_internal.h \
    imconfig.h imstb_rectpack.h imstb_textedit.h imstb_truetype.h backends/imgui_impl_sdl2.cpp backends/imgui_impl_sdl2.h \
    backends/imgui_impl_sdlrenderer2.cpp backends/imgui_impl_sdlrenderer2.h examples/example_sdl2_sdlrenderer2/main.cpp; do
    imgui_inputs+=("${imgui_dir}/${entry}" "/tmp/imgui/source/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/imgui/source.tar" \
    "${imgui_inputs[@]}" \
    "${imgui_dir}/LICENSE.txt" /usr/share/licenses/imgui/LICENSE.txt
fi
# SDL_ttf and SDL_image: what their CMake projects read to build on the
# installed SDL2, without the vendored libraries.
if has_image sdl2-ttf; then
  ttf_dir="build/generated/SDL2_ttf-$(source config/source-pins.sh && echo "${DOLLY_SDL2_TTF_VERSION}")"
  if [[ ! -d "${ttf_dir}" ]]; then mkdir -p build/generated && tar -xzf "$(bash scripts/fetch-pinned-archive.sh sdl2_ttf)" -C build/generated; fi
  ttf_inputs=()
  for entry in CMakeLists.txt cmake SDL_ttf.c SDL_ttf.h SDL2_ttf.pc.in SDL2_ttfConfig.cmake.in LICENSE.txt; do
    ttf_inputs+=("${ttf_dir}/${entry}" "/tmp/sdl2-ttf/source/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/sdl2-ttf/source.tar" "${ttf_inputs[@]}"
fi
if has_image sdl2-image; then
  image_dir="build/generated/SDL2_image-$(source config/source-pins.sh && echo "${DOLLY_SDL2_IMAGE_VERSION}")"
  if [[ ! -d "${image_dir}" ]]; then mkdir -p build/generated && tar -xzf "$(bash scripts/fetch-pinned-archive.sh sdl2_image)" -C build/generated; fi
  image_inputs=()
  for entry in CMakeLists.txt cmake include src SDL2_image.pc.in SDL2_imageConfig.cmake.in LICENSE.txt; do
    image_inputs+=("${image_dir}/${entry}" "/tmp/sdl2-image/source/${entry}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/sdl2-image/source.tar" "${image_inputs[@]}"
fi

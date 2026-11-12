# Sourced by scripts/prepare-image-sources.sh.
# Godot's release, unchanged, with Dolly's platform (platform/) as its platform/dolly.
if has_image godot || has_image godot-editor; then
  godot_dir="build/generated/godot-$(source config/source-pins.sh && echo "${DOLLY_GODOT_VERSION}")-stable"
  if [[ ! -d "${godot_dir}" ]]; then mkdir -p build/generated && tar -xf "$(bash scripts/fetch-pinned-archive.sh godot)" -C build/generated; fi
  node scripts/build-source-tar.mjs "${static_dir}/godot/source.tar.gz" \
    "${godot_dir}" /usr/src/godot \
    demos/godot/platform /usr/src/godot/platform/dolly \
    demos/godot/godot-dolly.patch /usr/src/godot/platform/dolly/godot-dolly.patch
fi
# The demo projects' release publishes each project as a zip.
if has_image dodge-the-creeps; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh godot_dodge)" godot/2d_dodge_the_creeps.zip
fi
if has_image truck-town; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh godot_truck)" godot/3d_truck_town.zip
fi
# Lantern Drift's project, as its package's build imports and exports it.
if has_image airtime-godot; then
  node scripts/build-source-tar.mjs "${static_dir}/godot/airtime.tar" demos/godot/airtime /usr/src/airtime
fi
if has_image lantern-drift; then
  node scripts/build-source-tar.mjs "${static_dir}/godot/lantern-drift.tar" demos/godot/lantern-drift /usr/src/lantern-drift
fi
# The part of Dawn's tree Tint's CMake build reads, with SPIRV-Tools, SPIRV-Headers and Abseil
# where Dawn's checkout keeps them, and Dolly's translator over them (spirv-wgsl).
if has_image spirv-wgsl; then
  extracted() {  # NAME: the pinned archive, extracted once into build/generated
    local archive dir
    archive="$(bash scripts/fetch-pinned-archive.sh "$1")"
    dir="build/generated/$(basename "${archive}" .tar.gz)"
    if [[ ! -d "${dir}" ]]; then mkdir -p "${dir}" && tar -xzf "${archive}" -C "${dir}" --strip-components=1; fi
    echo "${dir}"
  }
  dawn_dir="$(extracted dawn)"
  args=()
  for path in CMakeLists.txt LICENSE include src/cmake src/utils src/tint third_party/CMakeLists.txt \
      third_party/CopyWindowsSDKDLL.cmake third_party/protobuf.cmake; do
    args+=("${dawn_dir}/${path}" "/usr/src/dawn/${path}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/godot/spirv-wgsl.tar.gz" "${args[@]}" \
    "$(extracted spirv_tools)" /usr/src/dawn/third_party/spirv-tools/src \
    "$(extracted spirv_headers)" /usr/src/dawn/third_party/spirv-headers/src \
    "$(extracted abseil)" /usr/src/dawn/third_party/abseil-cpp \
    demos/godot/spirv-wgsl /usr/src/spirv-wgsl
fi

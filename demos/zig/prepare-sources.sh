# Sourced by scripts/prepare-image-sources.sh.
if has_image zig-llvm-build; then
  zig_llvm_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
  zig_llvm_wamr="$("${project_dir}/scripts/fetch-pinned-checkout.sh" wamr)"
  # Upstream's configuration of zig2 for an LLVM build, at this version, as its CMake writes it.
  sed "s/@RESOLVED_ZIG_VERSION@/$(source config/source-pins.sh && echo "${DOLLY_ZIG_VERSION}")/" "${zig_llvm_dir}/stage1/config.zig.in" > "${staging}/zig-llvm-config.zig"
  node scripts/build-source-tar.mjs "${static_dir}/zig-llvm/zig.tar" \
    "${zig_llvm_dir}/src" /tmp/zig/src \
    "${zig_llvm_dir}/lib" /usr/lib/zig \
    "${zig_llvm_dir}/stage1/zig1.wasm" /tmp/zig/stage1/zig1.wasm \
    "${staging}/zig-llvm-config.zig" /tmp/zig/config.zig \
    "${zig_llvm_dir}/stage1/wasi.c" /tmp/zig/stage1/wasi.c \
    "${zig_llvm_dir}/stage1/panic.h" /tmp/zig/stage1/panic.h \
    "${zig_llvm_dir}/LICENSE" /usr/share/licenses/zig/LICENSE
  node scripts/build-source-tar.mjs "${static_dir}/zig-llvm/wamr.tar" \
    "${zig_llvm_wamr}/core" /tmp/wamr/core \
    src/zig/zig1.c /tmp/wamr/zig1.c \
    src/zig/wamr-platform.c /tmp/wamr/wamr-platform.c \
    src/zig/platform_internal.h /tmp/wamr/platform_internal.h
fi

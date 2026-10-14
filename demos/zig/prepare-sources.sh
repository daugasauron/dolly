# Sourced by scripts/prepare-image-sources.sh.
if has_image zig-llvm; then
  zig_llvm_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
  zig_llvm_wamr="$("${project_dir}/scripts/fetch-pinned-checkout.sh" wamr)"
  node scripts/build-source-tar.mjs "${static_dir}/zig-llvm/zig.tar.gz" \
    "${zig_llvm_dir}/src" /tmp/zig/src \
    "${zig_llvm_dir}/lib" /usr/lib/zig \
    "${zig_llvm_dir}/stage1/zig1.wasm" /tmp/zig/stage1/zig1.wasm \
    "${zig_llvm_dir}/stage1/config.zig.in" /tmp/zig/stage1/config.zig.in \
    "${zig_llvm_dir}/LICENSE" /usr/share/licenses/zig/LICENSE
  node scripts/build-source-tar.mjs "${static_dir}/zig-llvm/wamr.tar" \
    "${zig_llvm_wamr}/core" /tmp/wamr/core \
    src/zig/zig1.c /tmp/wamr/zig1.c \
    src/zig/wamr-platform.c /tmp/wamr/wamr-platform.c \
    src/zig/platform_internal.h /tmp/wamr/platform_internal.h
fi

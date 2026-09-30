# Sourced by scripts/prepare-image-sources.sh.
if has_module zig-stage1; then
  zig_bootstrap_dir="$(bash scripts/prepare-zig-native.sh)"
  zig_bootstrap_inputs=()
  while IFS= read -r entry; do
    [[ -z "${entry}" || "${entry}" == \#* ]] && continue
    zig_bootstrap_inputs+=("${zig_bootstrap_dir}/lib/${entry}" "/usr/src/zig/lib/${entry}")
  done < config/zig-sdk-files.txt
  node scripts/build-source-tar.mjs "${static_dir}/zig-self-host/zig-bootstrap.tar" \
    "${zig_bootstrap_dir}/stage1" /usr/src/zig/stage1 \
    "${zig_bootstrap_dir}/src" /usr/src/zig/src \
    "${zig_bootstrap_inputs[@]}" \
    "${zig_bootstrap_dir}/LICENSE" /usr/share/licenses/zig/LICENSE \
    demos/zig-self-host/zig2-config.zig /usr/src/dolly/zig/config.zig
fi
if has_module zig2-host-c; then
  zig2_host_c_dir="$(bash demos/zig-self-host/host-zig2-c.sh)"
  copy_static "${zig2_host_c_dir}/zig2.c" zig-self-host/zig2.c
  copy_static "${zig2_host_c_dir}/compiler_rt.c" zig-self-host/compiler_rt.c
fi
if has_module zig-ghostty-cbe; then
  zig_ghostty_dir="$(bash scripts/prepare-ghostty-source.sh "$(bash scripts/fetch-pinned-checkout.sh ghostty)")"
  zig_uucode_dir="$(bash scripts/fetch-uucode.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/zig-self-host/ghostty.tar" \
    "${zig_ghostty_dir}/src" /usr/src/ghostty/src \
    src/ghostty/generated /usr/src/ghostty/generated \
    "${zig_ghostty_dir}/include/ghostty" /usr/include/ghostty \
    "${zig_uucode_dir}/src" /usr/src/uucode/src \
    src/ghostty/display.c /usr/src/dolly/ghostty/display.c \
    "$(bash scripts/fetch-stb.sh)" /tmp/ghostty/stb_truetype.h
fi

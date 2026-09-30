#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
cd "${port_dir}/rust"
exec "${port_dir}/toolchain/bin/cargo" rustc -j 4 \
  -p rustc-main --bin rustc-main --features llvm --message-format=json-render-diagnostics \
  "${rust_target_args[@]}" -- -Zno-link --emit=obj -Ccodegen-units=1

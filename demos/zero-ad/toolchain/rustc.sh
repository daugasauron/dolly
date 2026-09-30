#!/usr/bin/env bash
set -euo pipefail
export RUSTC_BOOTSTRAP=1
args=()
for arg in "$@"; do
  case "$arg" in
    --target=wasm64-emscripten-probe) args+=(--target=/src/demos/rust/toolchain/wasm64-emscripten-probe.json) ;;
    wasm64-emscripten-probe) args+=(/src/demos/rust/toolchain/wasm64-emscripten-probe.json) ;;
    *) args+=("$arg") ;;
  esac
done
exec /src/.cache/0ad/toolchain/bin/rustc -Zunstable-options "${args[@]}"

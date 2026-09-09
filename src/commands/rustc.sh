#!/bin/slop
sdk=$(cd "$(dirname "$0")/.." && pwd)
has_target=0
target_value=0
for argument in "$@"; do
  shift
  if test "$target_value" = 1; then
    test "$argument" != wasm64-emscripten-probe || argument="$sdk/wasm64-emscripten-probe.json"
    target_value=0
  else
    case "$argument" in
      --target) has_target=1; target_value=1 ;;
      --target=wasm64-emscripten-probe) has_target=1; argument="--target=$sdk/wasm64-emscripten-probe.json" ;;
      --target=*) has_target=1 ;;
    esac
  fi
  set -- "$@" "$argument"
done
test "$has_target" = 1 || set -- --target "$sdk/wasm64-emscripten-probe.json" "$@"
RUSTC_BOOTSTRAP=1 "$sdk/bin/rustc-real" \
  --sysroot "$sdk" \
  -Z unstable-options -C link-self-contained=no \
  -C linker="$sdk/bin/dolly-rust-link" \
  -C link-arg="$sdk/lib/libdolly-rust.a" "$@"

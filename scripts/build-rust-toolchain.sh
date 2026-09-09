#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
source config/source-pins.sh
port=build/rustc-port
mkdir -p "$port"
sysroot="$(sed -n 's|^DOLLY_PROCESS_SYSROOT_DIR:[^=]*=/src/||p' build/runtime/CMakeCache.txt)"
if [[ -z "$sysroot" || ! -f "$sysroot/SHA256SUMS" ]]; then
  echo 'dolly: build the C runtime before the Rust compiler seed' >&2
  exit 1
fi
(cd "$sysroot" && sha256sum --check --status SHA256SUMS)
input_key="$({
  printf '%s\n' 'dolly-rust-seed-1' "$DOLLY_EMSDK_IMAGE"
  sha256sum toolchain/rust/* scripts/build-rust-toolchain.sh include/dolly/process.h include/dolly/runtime.h
  sha256sum "$sysroot"/* | cut -d' ' -f1
} | sha256sum | cut -d' ' -f1)"
if [[ -f "$port/seed.inputs" && "$(cat "$port/seed.inputs")" == "$input_key" &&
      -f "$port/seed.sha256" ]] && (cd "$port" && sha256sum --check --status seed.sha256); then
  echo 'dolly: verified cached Rust compiler seed'
  exit 0
fi
prepare_key="$(sha256sum toolchain/rust/prepare.sh toolchain/rust/*.patch toolchain/rust/bootstrap-sources.json | sha256sum | cut -d' ' -f1)"
if [[ ! -f "$port/prepare.inputs" || "$(cat "$port/prepare.inputs")" != "$prepare_key" ]]; then
  rm -rf "$port/rust" "$port/toolchain" "$port/libc" "$port/libc-186" "$port/jobserver"
  bash toolchain/rust/prepare.sh > "$port/prepare.log" 2>&1
fi
cp toolchain/rust/wasm64-emscripten-probe.json "$port/wasm64-emscripten-probe.json"
bash toolchain/rust/build-llvm.sh > "$port/llvm-build.log" 2>&1
bash toolchain/rust/build.sh > "$port/compiler-build.jsonl" 2> "$port/compiler-build.log"
bash toolchain/rust/build-sdk.sh > "$port/sdk-build.jsonl" 2> "$port/sdk-build.log"
python3 toolchain/rust/package.py "$port/compiler-build.jsonl" "$port/sdk-build.jsonl"
rm -rf "$port/process-sysroot"
cp -a "$sysroot" "$port/process-sysroot"
bash toolchain/rust/link.sh > "$port/link.log" 2>&1
(cd "$port" && sha256sum rust-sdk.tar.gz > seed.sha256)
printf '%s\n' "$input_key" > "$port/seed.inputs"
echo 'dolly: built and validated the complete Rust compiler seed'

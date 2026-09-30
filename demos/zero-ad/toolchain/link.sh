#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/../../.."
source config/source-pins.sh
if (( $# < 2 )); then
  echo 'usage: demos/zero-ad/toolchain/link.sh OUTPUT OBJECT_OR_ARCHIVE...' >&2
  exit 64
fi
output="$1"
shift
sysroot="${DOLLY_PROCESS_SYSROOT:-.cache/process-sysroot}"
(cd "$sysroot" && sha256sum --check --status SHA256SUMS)
mkdir -p build/0ad "$(dirname -- "$output")"
container=(podman run --rm --pull=never --network=none --userns=keep-id
  --memory=4g --memory-swap=4g -v "$PWD:/src"
  -v "$PWD/.cache/emscripten:/emsdk/upstream/emscripten/cache"
  -w /src "$DOLLY_EMSDK_IMAGE")
"${container[@]}" /emsdk/upstream/bin/wasm-ld \
  -o "$output" -mwasm64 -Bstatic --threads=1 \
  --import-memory --shared-memory --no-export-dynamic \
  --export=__trap --export=__stack_pointer --export=__dolly_dso_allocate \
  --export-table --growable-table -z stack-size=8388608 \
  --max-memory=8589934592 --initial-memory=33554432 --no-stack-first \
  --table-base=1 --global-base=1024 --extra-features=extended-const --strip-debug \
  "$@" --whole-archive "$sysroot/libdolly-process.a" --no-whole-archive \
  "$sysroot/crt1.o" -L"$sysroot" \
  -lstandalonewasm-ww-memgrow -lstubs -lc-ww -ldlmalloc-ww \
  -lclang_rt.builtins-wasmsjlj-ww -lc++-ww-wasmexcept -lc++abi-ww-wasmexcept \
  -lunwind-ww-wasmexcept \
  -mllvm -combiner-global-alias-analysis=false -mllvm -wasm-enable-sjlj \
  -mllvm -wasm-use-legacy-eh=0 -mllvm -disable-lsr -mllvm -wasm-enable-eh
"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-process-0.wat \
  --enable-memory64 --enable-threads --disable-compact-imports \
  -o build/0ad/dolly-process-0.wasm
node scripts/dolly-abi.mjs bind-process-layout build/0ad/dolly-process-0.wasm include/dolly/process.h
node scripts/dolly-abi.mjs stamp-process build/0ad/dolly-process-0.wasm "$output"
node scripts/dolly-abi.mjs validate-process build/0ad/dolly-process-0.wasm "$output"

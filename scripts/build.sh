#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
image="${DOLLY_EMSDK_IMAGE}"

node "${project_dir}/scripts/lint-dollyfiles.mjs"

if command -v podman >/dev/null 2>&1; then
  container=(podman run --rm --userns=keep-id -v "${project_dir}:/src" -w /src "${image}")
elif command -v docker >/dev/null 2>&1; then
  container=(docker run --rm -u "$(id -u):$(id -g)" -v "${project_dir}:/src" -w /src "${image}")
else
  echo "dolly: podman or docker is required to run the pinned Emscripten toolchain" >&2
  exit 1
fi

mkdir -p \
  "${project_dir}/build" \
  "${project_dir}/build/generated" \
  "${project_dir}/dist" \
  "${project_dir}/.cache/emscripten"

toolchain_key="$("${project_dir}/scripts/toolchain-cache-key.sh")"
toolchain_stamp="${project_dir}/.cache/llvm-wasm/.dolly-toolchain-key"
installed_toolchain_key="$(cat "${toolchain_stamp}" 2>/dev/null || true)"
if [[ ! -f "${project_dir}/.cache/llvm-wasm/lib/libclangFrontend.a" ||
      ! -f "${project_dir}/.cache/llvm-wasm/lib/liblldWasm.a" ||
      "${installed_toolchain_key}" != "${toolchain_key}" ]]; then
  echo "dolly: run ./scripts/build-toolchain.sh before building" >&2
  if [[ -n "${installed_toolchain_key}" ]]; then
    echo "dolly: cached wasm64 Clang/LLD provider is stale" >&2
  fi
  exit 1
fi

zig_dir="$("${project_dir}/scripts/prepare-zig-native.sh")"
zig_container_dir="/src/${zig_dir#"${project_dir}/"}"
mapfile -t font_paths < <(bash "${project_dir}/scripts/fetch-iosevka.sh")
web_font="${font_paths[0]}"

if [[ "${container[0]}" == "podman" ]]; then
  container=(podman run --rm --userns=keep-id \
    -v "${project_dir}:/src" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w /src "${image}")
else
  container=(docker run --rm -u "$(id -u):$(id -g)" \
    -v "${project_dir}:/src" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w /src "${image}")
fi

rm -f \
  "${project_dir}/dist/dolly.data" \
  "${project_dir}/dist/dolly.mjs" \
  "${project_dir}/dist/dolly.wasm" \
  "${project_dir}/dist/dolly-kernel-plugin-0.wasm" \
  "${project_dir}/dist/dolly-0.wasm" \
  "${project_dir}/dist/dolly-process-0.wasm" \
  "${project_dir}/dist/dolly-process-gate-0.wasm" \
  "${project_dir}/dist/dolly-supervisor-0.wasm" \
  "${project_dir}/dist/dolly-process-abi.mjs" \
  "${project_dir}/dist/dolly-http-0.wasm" \
  "${project_dir}/dist/dolly-display-0.wasm" \
  "${project_dir}/dist/dolly-download-0.wasm" \
  "${project_dir}/dist/dolly-terminal-0.wasm" \
  "${project_dir}/dist/dolly-snapshot-0.wasm" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/ghostty-web.js" \
  "${project_dir}/dist/process-check.wasm" \
  "${project_dir}/dist/process-fs-check.wasm" \
  "${project_dir}/dist/process-pipe-check.wasm" \
  "${project_dir}/dist/slop-process.wasm"
rm -f \
  "${project_dir}/dist/program-inspector.wasm" \
  "${project_dir}/dist/program-reader.wasm" \
  "${project_dir}/dist/program-writer.wasm"

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-kernel-plugin-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-kernel-plugin-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-browser-0.wat \
  --enable-memory64 --enable-threads --disable-compact-imports \
  -o build/dolly-browser-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-process-0.wat \
  --enable-memory64 \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-process-0.wasm
node scripts/dolly-abi.mjs bind-process-layout \
  build/dolly-process-0.wasm \
  include/dolly/process.h

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-process-dso-0.wat \
  --enable-memory64 --enable-reference-types --enable-threads --disable-compact-imports \
  -o dist/dolly-process-dso-0.wasm

for fixture in process-minimal process-no-dso process-wrong-call process-wrong-start process-wrong-memory; do
  "${container[@]}" /emsdk/upstream/bin/wasm-as "test/fixtures/${fixture}.wat" \
    --enable-memory64 --enable-threads --disable-compact-imports \
    -o "build/${fixture}.wasm"
  node scripts/dolly-abi.mjs stamp-process build/dolly-process-0.wasm "build/${fixture}.wasm"
  if [[ "${fixture}" != process-wrong-* ]]; then
    node scripts/dolly-abi.mjs validate-process build/dolly-process-0.wasm "build/${fixture}.wasm"
  fi
done

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-process-gate-0.wat \
  --enable-memory64 \
  --enable-multimemory \
  --enable-bulk-memory \
  --enable-bulk-memory-opt \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-process-gate-0.wasm

(
  trap 'rm -f build/browser-errno.i' EXIT
  "${container[@]}" /emsdk/upstream/emscripten/emcc -m64 -E -P \
    scripts/browser-errno.c > build/browser-errno.i
  node scripts/generate-browser-errno.mjs build/browser-errno.i dist/dolly-errno.mjs
)

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-supervisor-0.wat \
  --enable-memory64 \
  --disable-compact-imports \
  -o build/dolly-supervisor-0.wasm

process_compile_flags=(
  -m64 -O1 -matomics -mbulk-memory -fwasm-exceptions
  -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=0
  -I/src/include
)
process_libc_internal_flags=(
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/arch/emscripten
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/arch/generic
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/src/internal
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/src/include
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/include
  -I/emsdk/upstream/emscripten/system/lib/libc
  -I/emsdk/upstream/emscripten/system/lib/pthread
)
process_link_flags=(
  -nostartfiles build/process-crt1.o
  -sSTANDALONE_WASM=1
  -sIMPORTED_MEMORY=1
  -sSHARED_MEMORY=1
  -sSUPPORT_LONGJMP=wasm
  -sWASM_LEGACY_EXCEPTIONS=0
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=16777216
  -sMAXIMUM_MEMORY=8589934592
  -sSTACK_SIZE=8388608
  -Wl,--export=__dolly_dso_allocate,--export=__stack_pointer,--export-table,--growable-table
)

"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/crt1.c \
  -o build/process-crt1.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/libc-adapter.c \
  -o build/process-libc-adapter.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/runtime-adapter.c \
  -o build/process-runtime-adapter.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/mmap.c \
  -o build/process-mmap.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/time.c \
  -o build/process-time.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/poll.c \
  -o build/process-poll.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" -c src/process/signal.c \
  -o build/process-signal.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" "${process_libc_internal_flags[@]}" -c \
  /emsdk/upstream/emscripten/system/lib/pthread/pthread_self_stub.c \
  -o build/process-pthread-self.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" "${process_libc_internal_flags[@]}" -c \
  /emsdk/upstream/emscripten/system/lib/libc/musl/src/thread/default_attr.c \
  -o build/process-default-attr.o
"${container[@]}" /emsdk/upstream/emscripten/emcc \
  "${process_compile_flags[@]}" "${process_libc_internal_flags[@]}" -c \
  src/process/pthread-stubs.c \
  -o build/process-pthread-stub.o
for source in pthread_mutexattr_init pthread_mutexattr_settype pthread_mutexattr_destroy; do
  "${container[@]}" /emsdk/upstream/emscripten/emcc \
    "${process_compile_flags[@]}" "${process_libc_internal_flags[@]}" -c \
    "/emsdk/upstream/emscripten/system/lib/libc/musl/src/thread/${source}.c" \
    -o "build/process-${source}.o"
done
(
  process_archive_staging="$(mktemp -d build/.process-archive.XXXXXX)"
  trap 'rm -rf -- "${process_archive_staging}"' EXIT
  "${container[@]}" /emsdk/upstream/emscripten/emar rcsD "${process_archive_staging}/libdolly-process.a" \
  build/process-libc-adapter.o \
  build/process-runtime-adapter.o \
  build/process-mmap.o \
  build/process-time.o \
  build/process-poll.o \
  build/process-signal.o \
  build/process-pthread-self.o \
  build/process-default-attr.o \
  build/process-pthread-stub.o \
  build/process-pthread_mutexattr_init.o \
  build/process-pthread_mutexattr_settype.o \
  build/process-pthread_mutexattr_destroy.o
  if ! cmp -s "${process_archive_staging}/libdolly-process.a" build/libdolly-process.a; then
    mv -- "${process_archive_staging}/libdolly-process.a" build/libdolly-process.a
  fi
)

build_process() {
  local output="$1"
  local staged="${output}.wasm"
  shift
  "${container[@]}" /emsdk/upstream/emscripten/emcc \
    "${process_compile_flags[@]}" "${process_link_flags[@]}" "$@" \
    -Wl,--whole-archive build/libdolly-process.a -Wl,--no-whole-archive \
    -o "${staged}"
  mv -- "${staged}" "${output}"
}

build_process_cxx() {
  local output="$1"
  local staged="${output}.wasm"
  shift
  "${container[@]}" /emsdk/upstream/emscripten/em++ \
    "${process_compile_flags[@]}" "${process_link_flags[@]}" "$@" \
    -Wl,--whole-archive build/libdolly-process.a -Wl,--no-whole-archive \
    -o "${staged}"
  mv -- "${staged}" "${output}"
}

rm -rf -- "${project_dir}/build/process-bin"
mkdir -p "${project_dir}/build/process-bin" "${project_dir}/build/process-probes"

build_process build/process-probes/process-check src/process/check.c
build_process_cxx build/process-probes/process-cpp-check src/process/cpp-check.cpp
build_process build/process-bin/bootstrap src/process/bootstrap.c

# Building the C++ process probe materializes the exact wasm64/native-EH libc++
# profile. Publish only that closed runtime set for the compiler running inside
# Dolly; no Emscripten driver or JavaScript library enters the process sysroot.
process_sysroot_container_dir="$("${container[@]}" ./scripts/prepare-process-sysroot.sh)"

node scripts/dolly-abi.mjs stamp-process \
  build/dolly-process-0.wasm \
  build/process-bin/bootstrap build/process-probes/process-check build/process-probes/process-cpp-check
node scripts/dolly-abi.mjs validate-process \
  build/dolly-process-0.wasm \
  build/process-bin/bootstrap build/process-probes/process-check build/process-probes/process-cpp-check
node scripts/dolly-abi.mjs emit-digest-module \
  build/dolly-process-0.wasm \
  dist/dolly-process-abi.mjs \
  DOLLY_PROCESS_ABI_DIGEST

node test/build-dso-fixtures.mjs "${container[@]}" /emsdk/upstream/bin/wasm-as
node scripts/dolly-abi.mjs stamp-process build/dolly-process-0.wasm \
  build/process-dso-host.wasm build/process-dso-bad-host.wasm
node scripts/dolly-abi.mjs validate-process-dso \
  build/dolly-process-0.wasm dist/dolly-process-dso-0.wasm build/dso-types.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-display-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-display-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-http-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-http-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-download-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-download-0.wasm

"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-snapshot-0.wat \
  --enable-memory64 \
  --enable-reference-types \
  --enable-threads \
  --disable-compact-imports \
  -o build/dolly-snapshot-0.wasm

native_zig_object="$("${project_dir}/scripts/build-native-zig.sh")"

node scripts/dolly-abi.mjs emit-emscripten-exports \
  build/dolly-kernel-plugin-0.wasm \
  build/dolly-display-0.wasm \
  build/dolly-http-0.wasm \
  build/dolly-snapshot-0.wasm \
  build/dolly-supervisor-0.wasm \
  build/runtime-exports.json
node scripts/dolly-abi.mjs emit-digest-header \
  build/dolly-kernel-plugin-0.wasm \
  build/generated/dolly-kernel-plugin-abi-digest.h \
  DOLLY_KERNEL_PLUGIN_ABI_DIGEST
node scripts/dolly-abi.mjs emit-digest-module \
  build/dolly-kernel-plugin-0.wasm \
  dist/dolly-kernel-plugin-abi.mjs \
  DOLLY_KERNEL_PLUGIN_ABI_DIGEST
node scripts/dolly-abi.mjs emit-digest-header \
  build/dolly-process-0.wasm \
  build/generated/dolly-process-abi-digest.h \
  DOLLY_PROCESS_ABI_DIGEST
"${container[@]}" /emsdk/upstream/emscripten/embuilder \
  --wasm64 --pic build libclang_rt.builtins
./scripts/prepare-compiler-rt.sh

"${container[@]}" /emsdk/upstream/emscripten/emcmake cmake \
  -S toolchain \
  -B build/runtime \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLVM_DIR=/src/.cache/llvm-wasm/lib/cmake/llvm \
  -DClang_DIR=/src/.cache/llvm-wasm/lib/cmake/clang \
  -DLLD_DIR=/src/.cache/llvm-wasm/lib/cmake/lld \
  -DDOLLY_ZIG_DIR="${zig_container_dir}" \
  -DDOLLY_ZIG_OBJECT="/src/${native_zig_object#"${project_dir}/"}" \
  -DDOLLY_PROCESS_SYSROOT_DIR="${process_sysroot_container_dir}"
"${container[@]}" cmake --build build/runtime --target dolly-process-compiler dolly-process-zig --parallel
node scripts/dolly-abi.mjs stamp-process \
  build/dolly-process-0.wasm \
  build/process-tools/compiler.wasm build/process-tools/zig.wasm
node scripts/dolly-abi.mjs validate-process \
  build/dolly-process-0.wasm \
  build/process-tools/compiler.wasm build/process-tools/zig.wasm
cp build/process-tools/compiler.wasm build/process-bin/compiler
bash "${project_dir}/scripts/prepare-image-sources.sh"
node scripts/generate-routes.mjs
"${container[@]}" cmake --build build/runtime --target dolly --parallel

node scripts/dolly-abi.mjs stamp \
  build/dolly-kernel-plugin-0.wasm \
  dist/dolly.wasm
node scripts/dolly-abi.mjs validate-runtime \
  build/dolly-kernel-plugin-0.wasm \
  dist/dolly.wasm
node scripts/dolly-abi.mjs validate-browser build/dolly-browser-0.wasm dist/dolly.wasm

cp build/dolly-browser-0.wasm dist/dolly-browser-0.wasm
cp build/dolly-kernel-plugin-0.wasm dist/dolly-kernel-plugin-0.wasm
cp build/dolly-process-0.wasm dist/dolly-process-0.wasm
cp build/dolly-process-gate-0.wasm dist/dolly-process-gate-0.wasm
cp build/dolly-supervisor-0.wasm dist/dolly-supervisor-0.wasm
cp build/dolly-display-0.wasm dist/dolly-display-0.wasm
cp build/dolly-download-0.wasm dist/dolly-download-0.wasm
cp build/dolly-http-0.wasm dist/dolly-http-0.wasm
cp build/dolly-snapshot-0.wasm dist/dolly-snapshot-0.wasm
cp "${web_font}" dist/IosevkaTerm-SemiBold.woff2
node scripts/write-build-id.mjs dist/dolly.wasm dist/dolly.data dist/dolly-build-id.mjs
node scripts/prune-stale-snapshots.mjs

#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
image="${DOLLY_EMSDK_IMAGE}"

container_mounts=(-v "${project_dir}:/src" -v "${project_dir}:${project_dir}")
for cached in "${project_dir}"/.cache/*; do
  if [[ -L "${cached}" && -d "${cached}" ]]; then
    resolved="$(readlink -f -- "${cached}")"
    case "${resolved}" in
      "${project_dir}"/*) ;;
      *) container_mounts+=(-v "${resolved}:${resolved}:ro") ;;
    esac
  fi
done

if command -v podman >/dev/null 2>&1; then
  container=(podman run --rm --userns=keep-id "${container_mounts[@]}" -w /src "${image}")
elif command -v docker >/dev/null 2>&1; then
  container=(docker run --rm -u "$(id -u):$(id -g)" "${container_mounts[@]}" -w /src "${image}")
else
  echo "dolly: podman or docker is required to run the pinned Emscripten toolchain" >&2
  exit 1
fi

# Replaces a file only when its bytes change, so unchanged inputs rebuild nothing.
replace_if_changed() {
  if cmp -s -- "$1" "$2"; then rm -f -- "$1"; else mv -- "$1" "$2"; fi
}

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
    "${container_mounts[@]}" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w /src "${image}")
else
  container=(docker run --rm -u "$(id -u):$(id -g)" \
    "${container_mounts[@]}" \
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache" \
    -w /src "${image}")
fi

rm -f \
  "${project_dir}/dist/dolly.data" \
  "${project_dir}/dist/dolly.mjs" \
  "${project_dir}/dist/dolly-seed.mjs" \
  "${project_dir}/dist/dolly.wasm" \
  "${project_dir}"/dist/dolly-*-0.wasm \
  "${project_dir}/dist/dolly-process-abi.mjs" \
  "${project_dir}/dist/dolly-build-id.mjs" \
  "${project_dir}/dist/dolly-image-build-id.mjs" \
  "${project_dir}/dist/IosevkaTerm-SemiBold.woff2" \
  "${project_dir}/dist/ghostty-web.js" \
  "${project_dir}/dist/process-check.wasm" \
  "${project_dir}/dist/process-fs-check.wasm" \
  "${project_dir}/dist/process-pipe-check.wasm" \
  "${project_dir}/dist/slop-process.wasm"

# Every WAT contract: the core ones in abi/ and those host module manifests name.
mapfile -t contracts < <(printf '%s\n' abi/dolly-kernel-plugin-0.wat abi/dolly-host-0.wat \
  abi/dolly-browser-0.wat; node scripts/host-modules.mjs contracts; node scripts/host-modules.mjs process)
"${container[@]}" bash -c 'for contract; do
  /emsdk/upstream/bin/wasm-as "${contract}" --enable-memory64 --enable-reference-types \
    --enable-threads --enable-multimemory --enable-bulk-memory --enable-bulk-memory-opt \
    --disable-compact-imports -o "build/$(basename "${contract}" .wat).wasm" || exit
done' contracts "${contracts[@]}"
node scripts/generate-abi-constants.mjs
mapfile -t headers < <(node scripts/host-modules.mjs headers)
# -p keeps source mtimes so unchanged headers rebuild nothing.
rm -rf build/include && mkdir -p build/include/dolly && cp -p -- "${headers[@]}" build/include/dolly/
node scripts/dolly-abi.mjs bind-process-layout build/dolly-threads-0.wasm \
  host/threads/dolly-threads-0.wat host/threads/threads.h
node scripts/dolly-abi.mjs emit-digest-header build/dolly-threads-0.wasm \
  build/generated/dolly-threads-abi-digest.h DOLLY_THREADS_ABI_DIGEST
node scripts/dolly-abi.mjs emit-digest-module build/dolly-threads-0.wasm \
  dist/dolly-threads-abi.mjs DOLLY_THREADS_ABI_DIGEST
node scripts/dolly-abi.mjs bind-process-layout \
  build/dolly-process-0.wasm \
  include/dolly/process.h

for fixture in process-minimal process-no-dso process-wrong-call process-wrong-start process-wrong-memory; do
  "${container[@]}" /emsdk/upstream/bin/wasm-as "test/fixtures/${fixture}.wat" \
    --enable-memory64 --enable-threads --disable-compact-imports \
    -o "build/${fixture}.wasm"
  node scripts/dolly-abi.mjs stamp-process build/dolly-process-0.wasm "build/${fixture}.wasm"
  if [[ "${fixture}" != process-wrong-* ]]; then
    node scripts/dolly-abi.mjs validate-process build/dolly-process-0.wasm "build/${fixture}.wasm"
  fi
done

(
  trap 'rm -f build/browser-errno.i' EXIT
  "${container[@]}" /emsdk/upstream/emscripten/emcc -m64 -E -P \
    scripts/browser-errno.c > build/browser-errno.i
  node scripts/generate-browser-errno.mjs build/browser-errno.i dist/dolly-errno.mjs
)

process_compile_flags=(
  -m64 -O1 -matomics -mbulk-memory -fwasm-exceptions
  -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=0
  -I/src/build/include
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

(
  startup_staging="$(mktemp -d build/.process-startup.XXXXXX)"
  trap 'rm -rf -- "${startup_staging}"' EXIT
  "${container[@]}" /emsdk/upstream/emscripten/emcc \
    "${process_compile_flags[@]}" -c src/process/crt1.c \
    -o "${startup_staging}/crt1.o"
  replace_if_changed "${startup_staging}/crt1.o" build/process-crt1.o
)
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
  replace_if_changed "${process_archive_staging}/libdolly-process.a" build/libdolly-process.a
)

# Each host module's process client forms libdolly-NAME.a.
while read -r module source; do
  object="build/process-${module}-client.o"
  "${container[@]}" /emsdk/upstream/emscripten/emcc \
    "${process_compile_flags[@]}" -c "${source}" -o "${object}"
  # Updating a copy keeps members of earlier builds, as the released seed does
  # (tasks/20261001-051500-client-archives).
  cp -p -- "build/libdolly-${module}.a" "build/libdolly-${module}.a.new" 2>/dev/null ||
    rm -f -- "build/libdolly-${module}.a.new"
  "${container[@]}" /emsdk/upstream/emscripten/emar rcsD "build/libdolly-${module}.a.new" "${object}"
  replace_if_changed "build/libdolly-${module}.a.new" "build/libdolly-${module}.a"
done < <(node scripts/host-modules.mjs client)
mapfile -t client_links < <(node scripts/host-modules.mjs client | awk '{ print "-ldolly-" $1 }' | uniq)

build_process() {
  local output="$1"
  local staged="${output}.wasm"
  shift
  "${container[@]}" /emsdk/upstream/emscripten/emcc \
    "${process_compile_flags[@]}" "${process_link_flags[@]}" "$@" \
    -Wl,--whole-archive build/libdolly-process.a -Wl,--no-whole-archive \
    -Lbuild "${client_links[@]}" \
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
    -Lbuild "${client_links[@]}" \
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
"${container[@]}" bash scripts/build-process-threads.sh
mapfile -t client_libraries < <(node scripts/host-modules.mjs client | awk '{ print "libdolly-" $1 ".a" }' | uniq)
process_sysroot_container_dir="$("${container[@]}" ./scripts/prepare-process-sysroot.sh "${client_libraries[@]}")"

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
  build/dolly-process-0.wasm build/dolly-process-dso-0.wasm build/dso-types.wasm

native_zig_object="$("${project_dir}/scripts/build-native-zig.sh")"


node scripts/host-modules.mjs kernel-modules > build/generated/dolly-kernel-modules.h.new
replace_if_changed build/generated/dolly-kernel-modules.h.new build/generated/dolly-kernel-modules.h
kernel_contracts=()
while read -r contract; do kernel_contracts+=("build/$(basename "${contract}" .wat).wasm"); done \
  < <(node scripts/host-modules.mjs contracts)
node scripts/dolly-abi.mjs emit-emscripten-exports build/dolly-kernel-plugin-0.wasm \
  "${kernel_contracts[@]}" build/runtime-exports.json
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
  -DDOLLY_PROCESS_SYSROOT_DIR="${process_sysroot_container_dir}" \
  -DDOLLY_KERNEL_SOURCES="$(node scripts/host-modules.mjs kernel | sed 's#^#/src/#' | paste -sd ';')" \
  -DDOLLY_CLIENT_LIBRARIES="$(printf '/src/build/lib%s.a\n' "${client_links[@]#-l}" | paste -sd ';')"
"${container[@]}" cmake --build build/runtime --target dolly-process-compiler dolly-process-zig --parallel
node scripts/dolly-abi.mjs stamp-process \
  build/dolly-process-0.wasm \
  build/process-tools/compiler.wasm build/process-tools/zig.wasm
node scripts/dolly-abi.mjs validate-process \
  build/dolly-process-0.wasm \
  build/process-tools/compiler.wasm build/process-tools/zig.wasm
cp build/process-tools/compiler.wasm build/process-bin/compiler
"${container[@]}" cmake --build build/runtime --target dolly --parallel

node scripts/dolly-abi.mjs stamp \
  build/dolly-kernel-plugin-0.wasm \
  dist/dolly.wasm
node scripts/dolly-abi.mjs validate-runtime \
  build/dolly-kernel-plugin-0.wasm \
  dist/dolly.wasm
node scripts/dolly-abi.mjs validate-browser build/dolly-browser-0.wasm dist/dolly.wasm

for contract in "${contracts[@]}"; do
  cp "build/$(basename "${contract}" .wat).wasm" dist/
done
cp "${web_font}" dist/IosevkaTerm-SemiBold.woff2
node scripts/bundle-process-worker.mjs
node scripts/write-build-id.mjs dist/dolly.wasm dist/dolly.data dist/dolly-build-id.mjs

#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
cd "${project_dir}"
port_dir="${project_dir}/build/rustc-port"
# The top-level seed build copies this revision's completed process sysroot.
test -f "${port_dir}/process-sysroot/libdolly-process.a"
(cd "${port_dir}/process-sysroot" && sha256sum --check --status SHA256SUMS)
container=(podman run --rm --userns=keep-id -v "${project_dir}:${project_dir}" -w "$PWD" "${DOLLY_EMSDK_IMAGE}")
"${container[@]}" bash -c 'set -eu
  includes=/emsdk/upstream/emscripten/system/lib/libc/musl
  for name in pthread_attr_init pthread_attr_setstacksize pthread_attr_destroy; do
    emcc -m64 -O2 -fPIC -matomics -mbulk-memory \
      -I$includes/src/internal -I$includes/src/include \
      -I$includes/arch/emscripten -I$includes/arch/generic \
      -I/emsdk/upstream/emscripten/system/lib/pthread \
      -c $includes/src/thread/$name.c -o build/rustc-port/$name.o
  done
  emcc -m64 -O2 -fPIC -matomics -mbulk-memory -Iinclude \
    -c toolchain/rust/posix-spawn.c -o build/rustc-port/posix-spawn.o
  emcc -m64 -O2 -fPIC -matomics -mbulk-memory -Iinclude \
    -c toolchain/rust/dlopen.c -o build/rustc-port/dlopen.o
  for archive in build/rustc-port/package/rust-link/*.a; do
    /emsdk/upstream/bin/llvm-ar d "$archive" lib.rmeta lib.rmeta-link
  done'
sysroot="${port_dir}/process-sysroot"
exports=()
while IFS= read -r symbol; do
  [[ -z "$symbol" || "$symbol" == \#* ]] || exports+=("--export-if-defined=$symbol")
done < "${sysroot}/dynamic-provider.symbols"
"${container[@]}" /emsdk/upstream/bin/wasm-ld \
  -o "${port_dir}/rustc.wasm" -mwasm64 -Bstatic --threads=4 \
  --import-memory --shared-memory --no-export-dynamic "${exports[@]}" \
  --export=emscripten_futex_wait --export=emscripten_futex_wake \
  --export=posix_spawnp --export=fork --export=_exit --export=setgroups --export=chroot \
  --export=__trap --export=__stack_pointer --export=__dolly_dso_allocate \
  --export-table --growable-table -z stack-size=8388608 \
  --max-memory=8589934592 --initial-memory=33554432 --no-stack-first \
  --table-base=1 --global-base=1024 --extra-features=extended-const --strip-debug \
  --wrap=dlopen --wrap=dlsym --wrap=dlerror --wrap=dlclose \
  "${port_dir}/dlopen.o" "${port_dir}/posix-spawn.o" "${port_dir}"/pthread_attr_*.o \
  "${port_dir}/package/rust-link/rustc-main.o" \
  "${port_dir}/package/rust-link/allocator.o" \
  "${port_dir}"/package/rust-link/*.a \
  --whole-archive "${sysroot}/libdolly-process.a" --no-whole-archive \
  "${sysroot}/crt1.o" -L"${sysroot}" \
  -lstandalonewasm-ww-memgrow -lstubs -lc-ww -ldlmalloc-ww \
  -lclang_rt.builtins-wasmsjlj-ww -lc++-ww-wasmexcept -lc++abi-ww-wasmexcept \
  -lunwind-ww-wasmexcept \
  -mllvm -combiner-global-alias-analysis=false -mllvm -wasm-enable-sjlj \
  -mllvm -wasm-use-legacy-eh=0 -mllvm -disable-lsr -mllvm -wasm-enable-eh
"${container[@]}" /emsdk/upstream/bin/wasm-as abi/dolly-process-0.wat \
  --enable-memory64 --enable-threads --disable-compact-imports \
  -o "${port_dir}/dolly-process-0.wasm"
node scripts/dolly-abi.mjs bind-process-layout "${port_dir}/dolly-process-0.wasm" include/dolly/process.h
node scripts/dolly-abi.mjs stamp-process "${port_dir}/dolly-process-0.wasm" "${port_dir}/rustc.wasm"
node scripts/dolly-abi.mjs validate-process "${port_dir}/dolly-process-0.wasm" "${port_dir}/rustc.wasm"
"${container[@]}" /emsdk/upstream/bin/llvm-ar crs \
  "${port_dir}/package/rust-sdk/lib/libdolly-rust.a" \
  "${port_dir}/posix-spawn.o" "${port_dir}"/pthread_attr_*.o
cp "${port_dir}/rustc.wasm" "${port_dir}/package/rust-sdk/bin/rustc-real"
gzip -c "${port_dir}/rustc.wasm" > "${port_dir}/rustc.wasm.gz"
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
  -cf - -C "${port_dir}/package" rust-sdk | gzip -n > "${port_dir}/rust-sdk.tar.gz"

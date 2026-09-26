#!/usr/bin/env bash
set -euo pipefail

# Runs inside the pinned seed toolchain, like the serial libc adapter build.
target=build/process-threads
mkdir -p "$target"
embuilder --wasm64 build libc-mt libdlmalloc-mt libstandalonewasm-mt-memgrow \
  libclang_rt.builtins-wasmsjlj-mt libunwind-mt-wasmexcept \
  libc++-mt-wasmexcept libc++abi-mt-wasmexcept
flags=(-m64 -O1 -pthread -fwasm-exceptions -sSUPPORT_LONGJMP=wasm \
  -sWASM_LEGACY_EXCEPTIONS=0 -I/src/include)
internal=(-I/emsdk/upstream/emscripten/system/lib/libc/musl/arch/emscripten \
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/arch/generic \
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/src/internal \
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/src/include \
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/include \
  -I/emsdk/upstream/emscripten/system/lib/libc \
  -I/emsdk/upstream/emscripten/system/lib/pthread)
for source in libc-adapter runtime-adapter mmap time poll signal threads crt1; do
  emcc "${flags[@]}" "${internal[@]}" -c "src/process/$source.c" -o "$target/$source.o"
done
emcc "${flags[@]}" -c src/process/threads-start.S -o "$target/threads-start.o"
rm -f "$target/libdolly-process.a" "$target/libdolly-runtime.a"
emar rcsD "$target/libdolly-process.a" "$target"/{libc-adapter,mmap,time,poll,signal,threads,threads-start}.o
emar rcsD "$target/libdolly-runtime.a" "$target/runtime-adapter.o"
cp /emsdk/upstream/emscripten/cache/sysroot/lib/wasm64-emscripten/libc-mt.a "$target/libc-mt.a"
# Replace upstream browser thread lifecycle and signal owners, retaining musl's
# actual mutex/condition/semaphore/once/TSD/stdio algorithms unchanged.
emar d "$target/libc-mt.a" pthread_create.o pthread_join.o pthread_detach.o \
  pthread_cancel.o pthread_setcanceltype.o library_pthread.o emscripten_futex_wait.o \
  emscripten_futex_wake.o pthread_kill.o raise.o sigaction.o pthread_sigmask.o sigtimedwait.o sched_yield.o

#!/usr/bin/env bash
set -euo pipefail

# threads@0's part of the seed (module.json `seed`): the threaded libc that
# cc -pthread links, which the process sysroot holds as threads/. Runs inside
# the pinned seed toolchain, like the serial libc adapter build.
target=build/process-threads
part=build/process-sysroot-parts/threads
mkdir -p "$target"
# mimalloc's options.c prints when it was built (__DATE__, __TIME__): clang takes
# both from SOURCE_DATE_EPOCH, so the seed is the same bytes in every checkout;
# --force replaces an archive the cache built with the clock.
export SOURCE_DATE_EPOCH=0
embuilder --wasm64 build libc-mt libstandalonewasm-mt-memgrow libclang_rt.builtins-wasmsjlj-mt
# Its overrides also define Windows' _aligned_malloc, no C or POSIX name, which programs define
# themselves (Wine's msvcrt): this throwaway container's copy is built without it.
override=/emsdk/upstream/emscripten/system/lib/mimalloc/src/alloc-override.c
definition='void* _aligned_malloc(size_t size, size_t alignment)    { return mi_malloc_aligned(size,alignment); }'
grep -qxF "$definition" "$override"
grep -vxF "$definition" "$override" > /tmp/alloc-override.c
cp /tmp/alloc-override.c "$override"
embuilder --wasm64 --force build libmimalloc-mt
flags=(-m64 -O1 -pthread -fwasm-exceptions -sSUPPORT_LONGJMP=wasm \
  -sWASM_LEGACY_EXCEPTIONS=0 -I/src/build/include)
internal=(-I/emsdk/upstream/emscripten/system/lib/libc/musl/arch/emscripten \
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/arch/generic \
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/src/internal \
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/src/include \
  -I/emsdk/upstream/emscripten/system/lib/libc/musl/include \
  -I/emsdk/upstream/emscripten/system/lib/libc \
  -I/emsdk/upstream/emscripten/system/lib/pthread)
for source in libc-adapter runtime-adapter socket-refusals libc-stubs mmap time poll signal abort crt1; do
  emcc "${flags[@]}" "${internal[@]}" -c "process/$source.c" -o "$target/$source.o"
done
# libc's pthreads over threads@0 are the module's (host/threads/), and so is
# their client: only a threaded program links it.
emcc "${flags[@]}" "${internal[@]}" -c host/threads/pthreads.c -o "$target/threads.o"
emcc "${flags[@]}" -c host/threads/pthreads-start.S -o "$target/threads-start.o"
emcc "${flags[@]}" -Wall -Werror -c host/threads/client.c -o "$target/threads-client.o"
rm -f "$target/libdolly-process.a" "$target/libdolly-runtime.a"
emar rcsD "$target/libdolly-process.a" "$target"/{libc-adapter,mmap,time,poll,signal,abort,threads,threads-start,threads-client}.o
for source in time/getdate legacy/getpass; do
  emcc "${flags[@]}" -c "/emsdk/upstream/emscripten/system/lib/libc/musl/src/$source.c" -o "$target/${source#*/}.o"
done
emar rcsD "$target/libdolly-runtime.a" "$target/runtime-adapter.o" "$target/socket-refusals.o" \
  "$target/libc-stubs.o" "$target/getdate.o" "$target/getpass.o"
cp /emsdk/upstream/emscripten/cache/sysroot/lib/wasm64-emscripten/libc-mt.a "$target/libc-mt.a"
# Replace upstream browser thread lifecycle and signal owners, retaining musl's
# actual mutex/condition/semaphore/once/TSD/stdio algorithms unchanged.
emar d "$target/libc-mt.a" pthread_create.o pthread_join.o pthread_detach.o \
  pthread_cancel.o pthread_setcanceltype.o library_pthread.o emscripten_futex_wait.o \
  emscripten_futex_wake.o pthread_kill.o raise.o sigaction.o pthread_sigmask.o sigtimedwait.o sched_yield.o \
  setitimer.o getitimer.o dladdr.o
# A threaded program's allocator is mimalloc: a heap per thread, where dlmalloc locks one.
mkdir -p "$part"
cp "$target"/{libdolly-process.a,libdolly-runtime.a,libc-mt.a,crt1.o} "$part/"
for library in libstandalonewasm-mt-memgrow.a libmimalloc-mt.a libclang_rt.builtins-wasmsjlj-mt.a; do
  cp "/emsdk/upstream/emscripten/cache/sysroot/lib/wasm64-emscripten/$library" "$part/"
done

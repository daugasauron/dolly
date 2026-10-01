DOLLY 6
MODULE zig

# Zig from its source archive with only Dolly's cc, following upstream
# bootstrap.c with two substitutions. WAMR runs the zig1.wasm seed instead of
# wasm2c + cc, whose code overflows a browser Worker's native stack. zig2 keeps
# only the C backend (/tmp/zig/config.zig), the one that yields Dolly objects
# without LLVM: this zig emits C for cc and has no `zig build` or `zig cc`.
REQUIRES HEADER libc
REQUIRES TOOL   cc
REQUIRES TOOL   tar

SOURCE https://daugasauron.com/dist/static/default/zig.tar  09c1c2b13932a37fa3fded23146a7bbb2b0fb03db6e9e8a00f714a4649fea857 /tmp/zig.tar
SOURCE https://daugasauron.com/dist/static/default/wamr.tar d5d0e05cf074e3f4167bc0430342a39f69666d3e27ee09c748f2a2a22299dfea /tmp/wamr.tar
SLOP tar \
  -xf /tmp/zig.tar \
  -C /
SLOP tar \
  -xf /tmp/wamr.tar \
  -C /

# WAMR requires a BUILD_TARGET; zig1 binds only raw natives, so the target
# selects no native calling convention here.
SLOP CWD /tmp/wamr/core cc \
  -O2 \
  -std=gnu99 \
  -fno-strict-aliasing \
  -w \
  -D_PLATFORM_WASI_TYPES_H \
  -DBH_PLATFORM_DOLLY \
  -DBUILD_TARGET_X86_64 \
  -DBH_MALLOC=wasm_runtime_malloc \
  -DBH_FREE=wasm_runtime_free \
  -DWA_MALLOC=wasm_runtime_malloc \
  -DWA_FREE=wasm_runtime_free \
  -DWASM_ENABLE_INTERP=1 \
  -DWASM_ENABLE_FAST_INTERP=1 \
  -DWASM_ENABLE_LABELS_AS_VALUES=0 \
  -DWASM_CPU_SUPPORTS_UNALIGNED_ADDR_ACCESS=0 \
  -DWASM_ENABLE_BULK_MEMORY=1 \
  -DWASM_ENABLE_BULK_MEMORY_OPT=1 \
  -DWASM_ENABLE_SHRUNK_MEMORY=1 \
  -DWASM_DISABLE_HW_BOUND_CHECK=1 \
  -DWASM_DISABLE_STACK_HW_BOUND_CHECK=1 \
  -DWASM_DISABLE_WRITE_GS_BASE=1 \
  -DWASM_DISABLE_WAKEUP_BLOCKING_OP=1 \
  -DWASM_ENABLE_SHARED_MEMORY=0 \
  -DWASM_ENABLE_MULTI_MODULE=0 \
  -DWASM_ENABLE_MINI_LOADER=0 \
  -DWASM_ENABLE_REF_TYPES=0 \
  -DWASM_ENABLE_SIMD=0 \
  -DWASM_ENABLE_EXTENDED_CONST_EXPR=0 \
  -DWASM_ENABLE_MEMORY64=0 \
  -I /tmp/wamr \
  -I /tmp/zig/stage1 \
  -I shared/platform/include \
  -I shared/utils \
  -I shared/mem-alloc \
  -I iwasm/include \
  -I iwasm/common \
  -I iwasm/interpreter \
  /tmp/wamr/zig1.c \
  /tmp/wamr/wamr-platform.c \
  shared/mem-alloc/mem_alloc.c \
  shared/mem-alloc/ems/ems_alloc.c \
  shared/mem-alloc/ems/ems_gc.c \
  shared/mem-alloc/ems/ems_hmu.c \
  shared/mem-alloc/ems/ems_kfc.c \
  shared/utils/bh_assert.c \
  shared/utils/bh_bitmap.c \
  shared/utils/bh_common.c \
  shared/utils/bh_hashmap.c \
  shared/utils/bh_leb128.c \
  shared/utils/bh_list.c \
  shared/utils/bh_log.c \
  shared/utils/bh_queue.c \
  shared/utils/bh_vector.c \
  shared/utils/runtime_timer.c \
  iwasm/common/wasm_application.c \
  iwasm/common/wasm_blocking_op.c \
  iwasm/common/wasm_c_api.c \
  iwasm/common/wasm_exec_env.c \
  iwasm/common/wasm_loader_common.c \
  iwasm/common/wasm_memory.c \
  iwasm/common/wasm_native.c \
  iwasm/common/wasm_runtime_common.c \
  iwasm/common/wasm_shared_memory.c \
  iwasm/common/arch/invokeNative_general.c \
  iwasm/interpreter/wasm_interp_fast.c \
  iwasm/interpreter/wasm_loader.c \
  iwasm/interpreter/wasm_runtime.c \
  -o /tmp/zig/zig1

# zig1's WASI adapter reaches only its working directory and lib argument.
SLOP CWD / /tmp/zig/zig1 \
  /tmp/zig/stage1/zig1.wasm \
  /usr/lib/zig \
  build-exe \
  -target wasm64-emscripten \
  -mcpu=generic+atomics \
  -fsingle-threaded \
  -OReleaseSmall \
  -ofmt=c \
  -lc \
  --name zig2 \
  -femit-bin=tmp/zig/zig2.c \
  --dep build_options \
  --dep aro \
  -Mroot=tmp/zig/src/main.zig \
  -Mbuild_options=tmp/zig/config.zig \
  -Maro=usr/lib/zig/compiler/aro/aro.zig
SLOP CWD / /tmp/zig/zig1 \
  /tmp/zig/stage1/zig1.wasm \
  /usr/lib/zig \
  build-obj \
  -target wasm64-emscripten \
  -mcpu=generic+atomics \
  -fsingle-threaded \
  -OReleaseSmall \
  -ofmt=c \
  --name compiler_rt \
  -femit-bin=tmp/zig/compiler_rt.c \
  -Mroot=usr/lib/zig/compiler_rt.zig

# zig.h passes usize (unsigned long) as uint64_t * (unsigned long long *) and,
# not recognizing Clang's wasm memory builtins, names an undefined
# zig_unimplemented().
SLOP CWD /tmp/zig cc \
  -c \
  -O2 \
  -std=c99 \
  -fno-strict-aliasing \
  -Wno-incompatible-pointer-types \
  '-Dzig_unimplemented()=(__builtin_trap(),0)' \
  -I /usr/lib/zig \
  -o zig2.o \
  zig2.c
SLOP CWD /tmp/zig cc \
  -c \
  -O2 \
  -std=c99 \
  -fno-strict-aliasing \
  -Wno-incompatible-pointer-types \
  -I /usr/lib/zig \
  -o compiler_rt.o \
  compiler_rt.c
SLOP CWD /tmp/zig cc \
  -o /usr/bin/zig \
  zig2.o \
  compiler_rt.o

EXPORTS TOOL   zig
EXPORTS FOLDER zig-lib     /usr/lib/zig
EXPORTS ENV    ZIG_LIB_DIR /usr/lib/zig
FILE /usr/share/licenses/zig/LICENSE

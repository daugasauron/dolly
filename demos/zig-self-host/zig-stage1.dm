DOLLY 4
MODULE zig-stage1

# zig1 is the zig1.wasm seed in the Zig source archive. Upstream bootstrap.c
# translates it with wasm2c and compiles the C; in a browser Worker that code
# overflows the native stack (README). Dolly's cc builds the WAMR interpreter
# instead, which keeps wasm frames on its heap, and zig1 runs the seed with it.
REQUIRES TOOL cc
REQUIRES TOOL date
REQUIRES TOOL ls
REQUIRES TOOL mkdir
REQUIRES TOOL tar

SOURCE HOST /static/zig-self-host/zig-bootstrap.tar /tmp/zig-bootstrap.tar 97f63239c811d006427fb66964b220957cb2ea072cb166969befd1157e4e836b
SOURCE HOST /static/zig-self-host/wamr.tar          /tmp/wamr.tar          fe8657631d46b32685aa4b3730cebd35cdc8d8902fafa5fefe8aac73098bc3cc
SLOP tar -xf /tmp/zig-bootstrap.tar -C /
SLOP tar -xf /tmp/wamr.tar -C /

FILE /tmp/wamr/build.slop
    set -ex
    mark() { echo "zig-timing $1 $(date +%s)"; }
    core=/tmp/wamr/core
    sources="/tmp/wamr/zig1-wamr.c /tmp/wamr/platform.c $core/shared/mem-alloc/mem_alloc.c"
    for name in ems_alloc ems_gc ems_hmu ems_kfc; do
      sources="$sources $core/shared/mem-alloc/ems/$name.c"
    done
    for name in bh_assert bh_bitmap bh_common bh_hashmap bh_leb128 bh_list bh_log bh_queue \
        bh_vector runtime_timer; do
      sources="$sources $core/shared/utils/$name.c"
    done
    for name in wasm_application wasm_blocking_op wasm_c_api wasm_exec_env wasm_loader_common \
        wasm_memory wasm_native wasm_runtime_common wasm_shared_memory arch/invokeNative_general; do
      sources="$sources $core/iwasm/common/$name.c"
    done
    for name in wasm_interp_fast wasm_loader wasm_runtime; do
      sources="$sources $core/iwasm/interpreter/$name.c"
    done
    mkdir -p /usr/libexec/zig
    mark zig1-cc
    cc -O2 -std=gnu99 -fno-strict-aliasing -w \
      -D_PLATFORM_WASI_TYPES_H -DBH_PLATFORM_DOLLY -DBUILD_TARGET_X86_64 \
      -DBH_MALLOC=wasm_runtime_malloc -DBH_FREE=wasm_runtime_free \
      -DWA_MALLOC=wasm_runtime_malloc -DWA_FREE=wasm_runtime_free \
      -DWASM_ENABLE_INTERP=1 -DWASM_ENABLE_FAST_INTERP=1 -DWASM_ENABLE_LABELS_AS_VALUES=0 \
      -DWASM_CPU_SUPPORTS_UNALIGNED_ADDR_ACCESS=0 -DWASM_ENABLE_BULK_MEMORY=1 \
      -DWASM_ENABLE_BULK_MEMORY_OPT=1 -DWASM_ENABLE_SHRUNK_MEMORY=1 \
      -DWASM_DISABLE_HW_BOUND_CHECK=1 -DWASM_DISABLE_STACK_HW_BOUND_CHECK=1 \
      -DWASM_DISABLE_WRITE_GS_BASE=1 -DWASM_DISABLE_WAKEUP_BLOCKING_OP=1 \
      -DWASM_ENABLE_SHARED_MEMORY=0 -DWASM_ENABLE_MULTI_MODULE=0 -DWASM_ENABLE_MINI_LOADER=0 \
      -DWASM_ENABLE_REF_TYPES=0 -DWASM_ENABLE_SIMD=0 -DWASM_ENABLE_EXTENDED_CONST_EXPR=0 \
      -DWASM_ENABLE_MEMORY64=0 \
      -I/tmp/wamr -I$core/shared/platform/include -I$core/shared/utils \
      -I$core/shared/mem-alloc -I$core/iwasm/include -I$core/iwasm/common \
      -I$core/iwasm/interpreter -I/usr/src/zig/stage1 \
      $sources -o /usr/libexec/zig/zig1
    mark done
    ls -l /usr/libexec/zig/zig1
SLOP slop /tmp/wamr/build.slop

FILE /usr/libexec/zig/zig1
FOLDER /usr/src/zig
FOLDER /usr/src/dolly/zig
FILE /usr/share/licenses/zig/LICENSE
FILE /usr/share/licenses/wamr/LICENSE

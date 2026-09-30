DOLLY 4
MODULE zig2-cc

# Upstream bootstrap.c step 6 with Dolly's cc: compile zig2 from /tmp/zig/*.c.
# zig.h passes usize (unsigned long) where it declares uint64_t (unsigned long
# long) and names an undefined zig_unimplemented() for wasm memory builtins.
REQUIRES TOOL cc
REQUIRES TOOL date
REQUIRES TOOL ls

FILE /tmp/zig/zig2-cc.slop
    set -ex
    mark() { echo "zig-timing $1 $(date +%s)"; }
    cd /tmp/zig
    flags='-O2 -std=c99 -fno-strict-aliasing -Wno-incompatible-pointer-types -I/usr/src/zig/lib'
    mark zig2-cc
    cc -c $flags '-Dzig_unimplemented()=(__builtin_trap(),0)' -o zig2.o zig2.c
    mark compiler-rt-cc
    cc -c $flags -o compiler_rt.o compiler_rt.c
    mark zig2-link
    cc -o /usr/bin/zig zig2.o compiler_rt.o
    mark done
    ls -l zig2.c compiler_rt.c zig2.o /usr/bin/zig
SLOP slop /tmp/zig/zig2-cc.slop

FILE /usr/bin/zig
EXPORTS ENV ZIG_LIB_DIR /usr/src/zig/lib

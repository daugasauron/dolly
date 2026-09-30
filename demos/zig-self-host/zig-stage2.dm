DOLLY 4
MODULE zig-stage2

# Upstream bootstrap.c steps 4-5 in Dolly: zig1 emits the compiler (with
# /usr/src/dolly/zig/config.zig) and compiler_rt as C for wasm64-emscripten.
# Fails today: zig1 overflows the browser Worker's native stack (README).
REQUIRES TOOL date
REQUIRES TOOL ln
REQUIRES TOOL mkdir

FILE /tmp/zig/stage2.slop
    set -ex
    mark() { echo "zig-timing $1 $(date +%s)"; }
    # zig1's WASI shim only reaches the working directory and its lib argument.
    mkdir -p /tmp/zig
    cd /tmp/zig
    ln -s /usr/src/zig/lib lib
    ln -s /usr/src/zig/src src
    ln -s /usr/src/dolly/zig/config.zig config.zig
    target='-target wasm64-emscripten -mcpu=generic+atomics -fsingle-threaded -OReleaseSmall -ofmt=c'
    mark zig2-c
    /usr/libexec/zig/zig1 /usr/src/zig/lib build-exe $target -lc --name zig2 -femit-bin=zig2.c \
      --dep build_options --dep aro -Mroot=src/main.zig -Mbuild_options=config.zig \
      -Maro=lib/compiler/aro/aro.zig
    mark compiler-rt-c
    /usr/libexec/zig/zig1 /usr/src/zig/lib build-obj $target --name compiler_rt \
      -femit-bin=compiler_rt.c -Mroot=lib/compiler_rt.zig
    mark done
SLOP slop /tmp/zig/stage2.slop

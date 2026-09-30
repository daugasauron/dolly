DOLLY 4
MODULE zig-stage1

# Upstream bootstrap.c steps 1-3 with Dolly's cc: build wasm2c, translate the
# zig1.wasm seed shipped in the Zig source archive to C, compile it to zig1.
REQUIRES TOOL cc
REQUIRES TOOL date
REQUIRES TOOL ls
REQUIRES TOOL mkdir
REQUIRES TOOL tar

SOURCE HOST /static/zig-self-host/zig-bootstrap.tar /tmp/zig-bootstrap.tar 97f63239c811d006427fb66964b220957cb2ea072cb166969befd1157e4e836b
SLOP tar -xf /tmp/zig-bootstrap.tar -C /

FILE /tmp/zig/stage1.slop
    set -ex
    mark() { echo "zig-timing $1 $(date +%s)"; }
    mkdir -p /usr/libexec/zig
    cd /usr/src/zig
    mark wasm2c-cc
    cc -O2 -std=c99 -o /tmp/zig/wasm2c stage1/wasm2c.c
    mark wasm2c-run
    /tmp/zig/wasm2c stage1/zig1.wasm /tmp/zig/zig1.c
    mark zig1-cc
    cc -c -Os -std=c99 -fno-strict-aliasing -o /tmp/zig/zig1.o /tmp/zig/zig1.c
    mark zig1-link
    cc -Os -std=c99 -fno-strict-aliasing -o /usr/libexec/zig/zig1 /tmp/zig/zig1.o stage1/wasi.c -lm
    mark done
    ls -l /tmp/zig/zig1.c /tmp/zig/zig1.o /usr/libexec/zig/zig1
SLOP slop /tmp/zig/stage1.slop

FILE /usr/libexec/zig/zig1
FOLDER /usr/src/zig
FOLDER /usr/src/dolly/zig
FILE /usr/share/licenses/zig/LICENSE

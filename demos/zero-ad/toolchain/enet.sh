#!/usr/bin/env bash
set -euo pipefail
cd /src
source_dir=.cache/0ad/enet-1.3.18
objects=.cache/0ad/enet-dolly
mkdir -p "$objects" .cache/0ad/sysroot/lib/static
for file in callbacks compress host list packet peer protocol; do
  emcc -m64 -O1 -matomics -mbulk-memory -I"$source_dir/include" -c "$source_dir/$file.c" -o "$objects/$file.o"
done
emcc -m64 -O1 -matomics -mbulk-memory -Iinclude -I"$source_dir/include" -c demos/zero-ad/toolchain/enet-dolly.c -o "$objects/dolly.o"
# Replacing the archive excludes the native unix/win32 socket backends.
rm -f .cache/0ad/sysroot/lib/static/libenet.a
emar crs .cache/0ad/sysroot/lib/static/libenet.a "$objects/"*.o
cp -R "$source_dir/include/enet" .cache/0ad/sysroot/include/
emcc -m64 -O1 -matomics -mbulk-memory -I"$source_dir/include" -c demos/zero-ad/test/fixtures/0ad-enet.c -o .cache/0ad/enet-check.o

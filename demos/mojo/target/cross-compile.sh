#!/bin/sh
# Compiles test/fixtures/*.mojo, and upstream's own two GPU hellos with our
# package's name for `max`'s, to wasm64 objects for Dolly in
# build/mojo-target/objects/, with the native compiler that README.md builds
# in build/mojo-target/modular from the pinned source and patches/.
set -eu
tree=$(cd "$(dirname "$0")/../../.." && pwd)
modular=$tree/build/mojo-target/modular
mkdir -p "$tree/build/mojo-target/objects"
for upstream in hello_writing gpu_hello; do
  sed 's/^from max\.gpu\.host import/from gpu.host import/' \
    "$modular/Mojo/docs/site/code/tools/notebooks/$upstream.mojo" > "$tree/build/mojo-target/objects/upstream_$upstream.mojo"
done
for program in "$tree"/demos/mojo/target/test/fixtures/*.mojo "$tree"/build/mojo-target/objects/upstream_*.mojo; do
  MODULAR_MOJO_MAX_IMPORT_PATH=$modular/Mojo/stdlib MODULAR_TELEMETRY_ENABLED=false MODULAR_CRASH_REPORTING_ENABLED=false \
    "$modular/bazel-bin/Mojo/tools/mojo/mojo" build --target-triple wasm64-unknown-dolly \
    --emit object -I "$tree/demos/mojo/target" "$program" -o "$tree/build/mojo-target/objects/$(basename "$program" .mojo).o"
done

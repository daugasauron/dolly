DOLLY 3
MODULE zig

REQUIRES TOOL rm
REQUIRES TOOL tar

# The wasm64-emscripten SDK follows config/zig-sdk-files.txt. Dolly supplies libc
# and C++ separately; this is not Zig's distribution for every target OS.
# Like Clang in the bootstrap seed, this compiler is built by the outer
# toolchain and validated against dolly-process-0. It runs entirely in Wasm.
SOURCE HOST /static/default/zig.wasm /usr/bin/zig e97ee4ea18040b54351b91e0008bd31c10fd698d506a5e0cdcbadec685b62e8b
SOURCE HOST /static/default/zig-lib.tar    /tmp/zig-lib.tar 205fcde54b306ab68dcbbbbe45d1c1b314147b6dd9b3dcaf48a56eb8e70497e2
SLOP tar \
  -xf /tmp/zig-lib.tar \
  -C /

EXPORTS TOOL   zig
EXPORTS FOLDER zig-lib     /usr/lib/zig
EXPORTS ENV    ZIG_LIB_DIR /usr/lib/zig
FILE /usr/share/licenses/zig/LICENSE

SLOP rm \
  -f \
  /tmp/zig-lib.tar

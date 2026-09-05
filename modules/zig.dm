DOLLY 2
MODULE zig

REQUIRES TOOL cc
REQUIRES TOOL rm
REQUIRES TOOL tar

# The wasm64-emscripten SDK follows config/zig-sdk-files.txt. Dolly supplies libc
# and C++ separately; this is not Zig's distribution for every target OS.
SOURCE HOST /static/default/commands/zig.c /tmp/zig.c       07ebca822aeeee47ef33f81418ca83875659aa0b4449a79553bbcd3411b441e4
SOURCE HOST /static/default/zig-lib.tar    /tmp/zig-lib.tar 205fcde54b306ab68dcbbbbe45d1c1b314147b6dd9b3dcaf48a56eb8e70497e2
SLOP cc \
  /tmp/zig.c \
  -o /usr/bin/zig
SLOP tar \
  -xf /tmp/zig-lib.tar \
  -C /

EXPORTS TOOL   zig
EXPORTS FOLDER zig-lib     /usr/lib/zig
EXPORTS ENV    ZIG_LIB_DIR /usr/lib/zig
FILE /usr/share/licenses/zig/LICENSE

SLOP rm \
  -f \
  /tmp/zig.c \
  /tmp/zig-lib.tar

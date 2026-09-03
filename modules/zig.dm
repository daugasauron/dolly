DOLLY 2
MODULE zig

REQUIRES TOOL rm
REQUIRES TOOL tar

# The compiler and its library tree are independently pinned inputs. Ghostty is
# the first real consumer and exercises Zig's complete object/link path.
SOURCE HOST /static/default/zig.wasm    /usr/bin/zig     b8ae906c2069fc7abed6d49bbe5904c1eb97726fc252f4e9eee3cd602a4b15b1
SOURCE HOST /static/default/zig-lib.tar /tmp/zig-lib.tar 82e33abf1bead6f2e1dc92ed2e4d80a4dafc4fe8ca33440f29f69c5db436c445
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

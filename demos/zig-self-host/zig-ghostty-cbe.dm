DOLLY 4
MODULE zig-ghostty-cbe

# ghostty.dm's build with the no-LLVM zig: emit Ghostty VT as C, compile it
# with Dolly's cc, then link the display plugin exactly as ghostty.dm does.
REQUIRES HEADER libc
REQUIRES HEADER display
REQUIRES TOOL ar
REQUIRES TOOL cc
REQUIRES TOOL date
REQUIRES TOOL ls
REQUIRES TOOL tar
REQUIRES TOOL zig

SOURCE HOST /static/zig-self-host/ghostty.tar /tmp/ghostty.tar 1e3ef30d92c3e5569ff5c1efb440168e08bafdabb87a573a1538c51a71c79155
SLOP tar -xf /tmp/ghostty.tar -C /

# With -ofmt=c, compiler_rt leaves these to the C library; the LLVM path gets
# them from compiler_rt. A kernel plugin has no C library to import them from.
FILE /tmp/ghostty/string.c
    #include <stddef.h>
    size_t strlen(const char *text) {
      size_t length = 0;
      while (text[length]) length++;
      return length;
    }
    int memcmp(const void *left, const void *right, size_t size) {
      const unsigned char *a = left, *b = right;
      for (size_t index = 0; index < size; index++)
        if (a[index] != b[index]) return a[index] - b[index];
      return 0;
    }
    int bcmp(const void *left, const void *right, size_t size) {
      return memcmp(left, right, size);
    }

FILE /tmp/ghostty/build.slop
    set -ex
    mark() { echo "zig-timing $1 $(date +%s)"; }
    cd /tmp/ghostty
    mark ghostty-c
    zig build-obj -ofmt=c -OReleaseSmall -target wasm64-emscripten -mcpu=generic+atomics \
      -fsingle-threaded -lc --name ghostty-vt \
      --dep build_options --dep terminal_options --dep unicode_tables --dep symbols_tables --dep uucode \
      -Mroot=/usr/src/ghostty/src/lib_vt.zig \
      -Mbuild_options=/usr/src/ghostty/generated/build-options.zig \
      -Mterminal_options=/usr/src/ghostty/generated/terminal-options.zig \
      -Municode_tables=/usr/src/ghostty/generated/unicode-props.zig \
      -Msymbols_tables=/usr/src/ghostty/generated/unicode-symbols.zig \
      -ODebug --dep types.zig --dep config.zig --dep tables -Muucode=/usr/src/uucode/src/root.zig \
      -ODebug -Mtypes.zig=/usr/src/uucode/src/types.zig \
      -ODebug --dep types.zig --dep storage.zig -Mconfig.zig=/usr/src/uucode/src/config.zig \
      -ODebug --dep config.zig --dep storage.zig --dep build_config \
      -Mtables=/usr/src/ghostty/generated/uucode-tables.zig \
      -ODebug --dep config.zig -Mstorage.zig=/usr/src/uucode/src/storage.zig \
      --dep config.zig --dep storage.zig -Mbuild_config=/usr/src/ghostty/src/build/uucode_config.zig \
      -femit-bin=ghostty-vt.c
    mark compiler-rt-c
    zig build-obj -ofmt=c -OReleaseSmall -target wasm64-emscripten -mcpu=generic+atomics \
      -fsingle-threaded --name compiler_rt -Mroot=/usr/src/zig/lib/compiler_rt.zig \
      -femit-bin=compiler_rt.c
    mark ghostty-cc
    # Like -fcompiler-rt on the LLVM path, compiler_rt supplies the math and
    # integer helpers; @returnAddress would otherwise import an Emscripten helper.
    flags='-O2 -std=c99 -fno-strict-aliasing -Wno-incompatible-pointer-types -I/usr/src/zig/lib'
    cc -c $flags '-D__builtin_return_address(level)=0' -o ghostty-vt.o ghostty-vt.c
    cc -c $flags -o compiler_rt.o compiler_rt.c
    cc -c -O2 -fno-builtin -o string.o string.c
    ar rcs /usr/lib/libghostty-vt.a ghostty-vt.o compiler_rt.o string.o
    mark display-link
    cc -shared --dolly-kernel-plugin -O2 -std=c17 -I /tmp/ghostty -I /usr/include \
      /usr/src/dolly/ghostty/display.c -lghostty-vt -o /usr/lib/libdisplay.so
    mark done
    ls -l ghostty-vt.c ghostty-vt.o compiler_rt.o /usr/lib/libghostty-vt.a /usr/lib/libdisplay.so
SLOP slop /tmp/ghostty/build.slop

EXPORTS LIB    ghostty-vt /usr/lib/libghostty-vt.a
EXPORTS LIB    display    /usr/lib/libdisplay.so
EXPORTS HEADER ghostty-vt /usr/include/ghostty

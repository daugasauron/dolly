DOLLY 6
MODULE ghostty

REQUIRES HEADER libc
REQUIRES HEADER display
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar
REQUIRES TOOL   zig

SOURCE https://daugasauron.com/dist/static/default/ghostty.tar              945865657d183d1b97124e383af4c455da577f42215d58cdd29ee4a942136664 /tmp/ghostty.tar
SOURCE https://daugasauron.com/dist/static/default/uucode.tar               27d4103c73b68b20c21adaee05c4cd2c01fc418e083f5961148e1f872951453e /tmp/uucode.tar
SOURCE https://daugasauron.com/dist/static/default/ghostty/display.c        73377d9065c698acf228d396f72c049315f051b4976fbdbcf7f68db8ed85cfed /usr/src/dolly/ghostty/display.c
SOURCE https://daugasauron.com/dist/static/default/stb_truetype.h           ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab /tmp/ghostty/stb_truetype.h
SOURCE https://daugasauron.com/dist/static/default/IosevkaTerm-SemiBold.ttf 754545a4f6250efdd3d2cc916bb344c59f0c59830405307dfd44d183f919a654 /usr/share/fonts/IosevkaTerm-SemiBold.ttf
SLOP tar \
  -xf /tmp/ghostty.tar \
  -C /
SLOP tar \
  -xf /tmp/uucode.tar \
  -C /

# With -ofmt=c, compiler_rt leaves these to the C library, which the LLVM
# path's compiler_rt supplies. A kernel plugin has no C library to import them from.
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

# Zig emits Ghostty VT and compiler_rt as C; cc compiles them. zig.h passes
# usize as uint64_t *, and @returnAddress would import an Emscripten helper.
FILE /tmp/ghostty/Makefile
    .RECIPEPREFIX := >
    ZIGFLAGS := -OReleaseSmall -target wasm64-emscripten -mcpu=generic+atomics -fsingle-threaded -ofmt=c
    CFLAGS := -O2 -std=c99 -fno-strict-aliasing -Wno-incompatible-pointer-types -I /usr/lib/zig
    all: /usr/lib/libghostty-vt.a /usr/lib/libdisplay.so
    /tmp/ghostty/ghostty-vt.c:
    >zig build-obj \
    >  $(ZIGFLAGS) \
    >  -lc \
    >  --name ghostty-vt \
    >  --dep build_options \
    >  --dep terminal_options \
    >  --dep unicode_tables \
    >  --dep symbols_tables \
    >  --dep uucode \
    >  -Mroot=/usr/src/ghostty/src/lib_vt.zig \
    >  -Mbuild_options=/usr/src/ghostty/generated/build-options.zig \
    >  -Mterminal_options=/usr/src/ghostty/generated/terminal-options.zig \
    >  -Municode_tables=/usr/src/ghostty/generated/unicode-props.zig \
    >  -Msymbols_tables=/usr/src/ghostty/generated/unicode-symbols.zig \
    >  -ODebug \
    >  --dep types.zig \
    >  --dep config.zig \
    >  --dep tables \
    >  -Muucode=/usr/src/uucode/src/root.zig \
    >  -ODebug \
    >  -Mtypes.zig=/usr/src/uucode/src/types.zig \
    >  -ODebug \
    >  --dep types.zig \
    >  --dep storage.zig \
    >  -Mconfig.zig=/usr/src/uucode/src/config.zig \
    >  -ODebug \
    >  --dep config.zig \
    >  --dep storage.zig \
    >  --dep build_config \
    >  -Mtables=/usr/src/ghostty/generated/uucode-tables.zig \
    >  -ODebug \
    >  --dep config.zig \
    >  -Mstorage.zig=/usr/src/uucode/src/storage.zig \
    >  --dep config.zig \
    >  --dep storage.zig \
    >  -Mbuild_config=/usr/src/ghostty/src/build/uucode_config.zig \
    >  -femit-bin=$@
    /tmp/ghostty/compiler_rt.c:
    >zig build-obj $(ZIGFLAGS) --name compiler_rt -Mroot=/usr/lib/zig/compiler_rt.zig -femit-bin=$@
    /tmp/ghostty/ghostty-vt.o: /tmp/ghostty/ghostty-vt.c
    >cc -c $(CFLAGS) '-D__builtin_return_address(level)=0' -o $@ $<
    /tmp/ghostty/compiler_rt.o: /tmp/ghostty/compiler_rt.c
    >cc -c $(CFLAGS) -o $@ $<
    /tmp/ghostty/string.o: /tmp/ghostty/string.c
    >cc -c -O2 -fno-builtin -o $@ $<
    /usr/lib/libghostty-vt.a: /tmp/ghostty/ghostty-vt.o /tmp/ghostty/compiler_rt.o /tmp/ghostty/string.o
    >ar rcs $@ $^
    /usr/lib/libdisplay.so: /usr/src/dolly/ghostty/display.c /usr/lib/libghostty-vt.a
    >cc \
    >  -shared \
    >  --dolly-kernel-plugin \
    >  -O2 \
    >  -std=c17 \
    >  -I /tmp/ghostty \
    >  -I /usr/include \
    >  $< \
    >  -lghostty-vt \
    >  -o $@
SLOP CWD /usr/src/ghostty make \
  -f /tmp/ghostty/Makefile

FILE /usr/share/fonts/IosevkaTerm-SemiBold.ttf
FILE /usr/share/licenses/ghostty/LICENSE
FILE /usr/share/licenses/uucode/LICENSE.md

EXPORTS LIB    ghostty-vt /usr/lib/libghostty-vt.a
EXPORTS LIB    display    /usr/lib/libdisplay.so
EXPORTS HEADER ghostty-vt /usr/include/ghostty

SLOP rm \
  -rf \
  /tmp/ghostty \
  /tmp/ghostty.tar \
  /tmp/uucode.tar \
  /usr/src/dolly/ghostty \
  /usr/src/ghostty \
  /usr/src/uucode

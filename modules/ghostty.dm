DOLLY 2
MODULE ghostty

REQUIRES HEADER libc
REQUIRES HEADER display
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar
REQUIRES TOOL   zig

SOURCE HOST /static/default/ghostty.tar              /tmp/ghostty.tar                          62927872d21cfe1bb2c76a5f90499a4139e0da16168db1afdb2d4b429d995eb3
SOURCE HOST /static/default/uucode.tar               /tmp/uucode.tar                           27d4103c73b68b20c21adaee05c4cd2c01fc418e083f5961148e1f872951453e
SOURCE HOST /static/default/ghostty/display.c        /usr/src/dolly/ghostty/display.c          bb65ed45cfc299774e7fdd696b598772369d93135b1cda60cd534514f4bb92f2
SOURCE HOST /static/default/stb_truetype.h           /tmp/ghostty/stb_truetype.h               ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab
SOURCE HOST /static/default/IosevkaTerm-SemiBold.ttf /usr/share/fonts/IosevkaTerm-SemiBold.ttf 754545a4f6250efdd3d2cc916bb344c59f0c59830405307dfd44d183f919a654
SLOP tar \
  -xf /tmp/ghostty.tar \
  -C /
SLOP tar \
  -xf /tmp/uucode.tar \
  -C /

FILE /tmp/ghostty/Makefile
    .RECIPEPREFIX := >
    all: /usr/lib/libghostty-vt.a /usr/lib/libdisplay.so
    /tmp/ghostty-vt.o:
    >zig build-obj \
    >  -OReleaseSmall \
    >  -target wasm64-emscripten \
    >  -mcpu=generic+atomics \
    >  -fPIC \
    >  -fsingle-threaded \
    >  -fcompiler-rt \
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
    /usr/lib/libghostty-vt.a: /tmp/ghostty-vt.o
    >ar rcs $@ $^
    /usr/lib/libdisplay.so: /usr/src/dolly/ghostty/display.c /usr/lib/libghostty-vt.a
    >cc \
    >  -shared \
    >  --dolly-kernel-plugin \
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
EXPORTS ENV    DISPLAY    /usr/lib/libdisplay.so

SLOP rm \
  -rf \
  /tmp/ghostty \
  /tmp/ghostty-vt.o \
  /tmp/ghostty.tar \
  /tmp/uucode.tar \
  /usr/src/dolly/ghostty \
  /usr/src/ghostty \
  /usr/src/uucode

DOLLY 5
MODULE slopyard

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES TOOL make
REQUIRES TOOL ar
REQUIRES LIB raylib
REQUIRES LIB box3d
REQUIRES LIB dolly-raylib
REQUIRES LIB dolly-js
REQUIRES LIB lua55
REQUIRES HEADER lua55
REQUIRES HEADER gpu
REQUIRES HOST gpu@0
REQUIRES HOST display@0
REQUIRES HOST threads@0
REQUIRES HEADER quickjs
REQUIRES HEADER quickjs-runner

SOURCE https://daugasauron.com/static/slopyard/source.tar cef655c6c274c7306b41cdfb928912f4b9e064836cc1d1334e8abaadee33dfd7 /tmp/slopyard.tar
SLOP tar -xf /tmp/slopyard.tar -C / && rm /tmp/slopyard.tar
SLOP make -f /usr/src/dolly/slopyard/box3d.mk
SLOP cc -std=c17 -O2 -pthread -U__SIZEOF_INT128__ -I/usr/include/lua5.5 /usr/src/dolly/slopyard/main.c /usr/src/dolly/slopyard/data.c /usr/src/dolly/slopyard/pi.c /usr/src/dolly/slopyard/character.c /usr/src/dolly/slopyard/render.c /usr/src/dolly/slopyard/world.c /usr/src/dolly/slopyard/terrain.c /usr/src/dolly/slopyard/magnet.c -ldolly-gpu -llua5.5 -ldolly-js -ldolly-raylib -lraylib -lslopyard-box3d -lm -o /usr/bin/slopyard
SLOP /usr/bin/slopyard --check
SLOP rm -rf /tmp/slopyard-box3d
EXPORTS TOOL slopyard
EXPORTS LIB slopyard-box3d /usr/lib/libslopyard-box3d.a
EXPORTS FOLDER slopyard-source /usr/src/dolly/slopyard

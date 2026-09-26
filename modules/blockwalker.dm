DOLLY 4
MODULE blockwalker

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

SOURCE HOST /static/blockwalker/source.tar /tmp/blockwalker.tar 89dfa57411039c42d129783ba94fc13b9770b971d20931f81b0403ba33b5f0bb
SLOP tar -xf /tmp/blockwalker.tar -C / && rm /tmp/blockwalker.tar
SLOP make -f /usr/src/dolly/blockwalker/box3d.mk
SLOP cc -std=c17 -O2 -pthread -U__SIZEOF_INT128__ -I/usr/include/lua5.5 /usr/src/dolly/blockwalker/main.c /usr/src/dolly/blockwalker/data.c /usr/src/dolly/blockwalker/pi.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/render.c /usr/src/dolly/blockwalker/world.c /usr/src/dolly/blockwalker/terrain.c /usr/src/dolly/blockwalker/magnet.c -ldolly-gpu -llua5.5 -ldolly-js -ldolly-raylib -lraylib -lblockwalker-box3d -lm -o /usr/bin/blockwalker
SLOP /usr/bin/blockwalker --check
SLOP rm -rf /tmp/blockwalker-box3d
EXPORTS TOOL blockwalker
EXPORTS LIB blockwalker-box3d /usr/lib/libblockwalker-box3d.a
EXPORTS FOLDER blockwalker-source /usr/src/dolly/blockwalker

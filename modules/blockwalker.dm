DOLLY 3
MODULE blockwalker

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES TOOL make
REQUIRES TOOL ar
REQUIRES LIB raylib
REQUIRES LIB box3d
REQUIRES LIB dolly-raylib
REQUIRES LIB dolly-js
REQUIRES HEADER quickjs
REQUIRES HEADER quickjs-runner

SOURCE HOST /static/blockwalker/source.tar /tmp/blockwalker.tar 27d9c483faf2063c1eaa57156bd5957f7fba86bc18f6072b01e31b7af6e831be
SLOP tar -xf /tmp/blockwalker.tar -C / && rm /tmp/blockwalker.tar
SLOP make -f /usr/src/dolly/blockwalker/box3d.mk
SLOP cc -std=c17 -O2 -U__SIZEOF_INT128__ /usr/src/dolly/blockwalker/main.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/render.c /usr/src/dolly/blockwalker/world.c /usr/src/dolly/blockwalker/terrain.c /usr/src/dolly/blockwalker/magnet.c /usr/src/dolly/blockwalker/gpu-client.c -ldolly-js -ldolly-raylib -lraylib -lblockwalker-box3d -lm -o /usr/bin/blockwalker
SLOP /usr/bin/blockwalker --check
SLOP rm -rf /tmp/blockwalker-box3d
EXPORTS TOOL blockwalker
EXPORTS LIB blockwalker-box3d /usr/lib/libblockwalker-box3d.a
EXPORTS FOLDER blockwalker-source /usr/src/dolly/blockwalker
EXPORTS HEADER dolly-gpu /usr/include/dolly/gpu.h
EXPORTS HEADER dolly-gpu-abi /usr/include/dolly/gpu-abi.h

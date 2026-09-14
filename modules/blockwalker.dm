DOLLY 3
MODULE blockwalker

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES LIB raylib
REQUIRES LIB box3d
REQUIRES LIB dolly-raylib
REQUIRES LIB dolly-js
REQUIRES HEADER quickjs
REQUIRES HEADER quickjs-runner

SOURCE HOST /static/blockwalker/source.tar /tmp/blockwalker.tar 6631a7eaf7cd71a2ffe146b6c91288ff8b34ea9be6d9f7ffbb434dd69cd935b9
SLOP tar -xf /tmp/blockwalker.tar -C / && rm /tmp/blockwalker.tar
SLOP cc -std=c17 -O2 -DBOX3D_DISABLE_SIMD -U__SIZEOF_INT128__ /usr/src/dolly/blockwalker/main.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/render.c /usr/src/dolly/blockwalker/world.c /usr/src/dolly/blockwalker/terrain.c /usr/src/dolly/blockwalker/magnet.c /usr/src/dolly/blockwalker/gpu-client.c -ldolly-js -ldolly-raylib -lraylib -lbox3d -lm -o /usr/bin/blockwalker
SLOP /usr/bin/blockwalker --check
EXPORTS TOOL blockwalker
EXPORTS FOLDER blockwalker-source /usr/src/dolly/blockwalker
EXPORTS HEADER dolly-gpu /usr/include/dolly/gpu.h
EXPORTS HEADER dolly-gpu-abi /usr/include/dolly/gpu-abi.h

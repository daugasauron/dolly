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

SOURCE HOST /static/blockwalker/source.tar /tmp/blockwalker.tar e4646360cb1952b56b5d5b26c2dd3a3811d942bb698f5ba9085131fbe686773a
SLOP tar -xf /tmp/blockwalker.tar -C / && rm /tmp/blockwalker.tar
SLOP cc -std=c17 -O2 -DBOX3D_DISABLE_SIMD -U__SIZEOF_INT128__ /usr/src/dolly/blockwalker/main.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/render.c /usr/src/dolly/blockwalker/world.c /usr/src/dolly/blockwalker/gpu-client.c -ldolly-js -ldolly-raylib -lraylib -lbox3d -lm -o /usr/bin/blockwalker
SLOP /usr/bin/blockwalker --check
EXPORTS TOOL blockwalker
EXPORTS FOLDER blockwalker-source /usr/src/dolly/blockwalker

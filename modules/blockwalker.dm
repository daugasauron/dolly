DOLLY 3
MODULE blockwalker

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES LIB raylib
REQUIRES LIB box3d
REQUIRES LIB dolly-raylib

SOURCE HOST /static/blockwalker/source.tar /tmp/blockwalker.tar 1bb86c6247889af31091bc804e6a6461aad202aedd44c6ca6247fa15aeb835c5
SLOP tar -xf /tmp/blockwalker.tar -C / && rm /tmp/blockwalker.tar
SLOP cc -std=c17 -O2 -DBOX3D_DISABLE_SIMD -U__SIZEOF_INT128__ /usr/src/dolly/blockwalker/main.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/render.c /usr/src/dolly/blockwalker/gpu-client.c -ldolly-raylib -lraylib -lbox3d -lm -o /usr/bin/blockwalker
SLOP /usr/bin/blockwalker --check
EXPORTS TOOL blockwalker
EXPORTS FOLDER blockwalker-source /usr/src/dolly/blockwalker

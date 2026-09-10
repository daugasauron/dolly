DOLLY 3
MODULE classicube-agent

REQUIRES HEADER cpp
REQUIRES HEADER quickjs-runner
REQUIRES HEADER sdl2
REQUIRES LIB dolly-js
REQUIRES LIB SDL2
REQUIRES LIB z
REQUIRES HEADER zlib
REQUIRES TOOL cc
REQUIRES TOOL c++
REQUIRES TOOL pi
REQUIRES TOOL classicube
REQUIRES TOOL tar
REQUIRES TOOL rm

SOURCE HOST /static/classicube/agent.tar /tmp/classicube-agent/source.tar 105ffaa7c79427e294b7561a25f8b5193e31a96a06d7e5b4e24b2ba505d4e38b
SOURCE HOST /static/default/stb_truetype.h /tmp/classicube-agent/stb_truetype.h ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab
SLOP tar -xf /tmp/classicube-agent/source.tar -C /
SLOP c++ -O1 -std=c++11 -I/usr/include/SDL2 -I/tmp/classicube-agent \
  /usr/src/dolly/classicube/agent/viewer.cpp -o /usr/bin/classicube-viewer -lSDL2 -lm
SLOP cc -O2 /usr/src/dolly/classicube/agent/pack.c -o /usr/bin/classicube-pack -lz
SLOP cc -std=gnu11 -I/usr/include/dolly -DEMSCRIPTEN=1 -D_GNU_SOURCE \
  -DQUICKJS_NG_BUILD -DNDEBUG -funsigned-char -fdolly-runtime-interrupt-handler \
  /usr/src/dolly/classicube/agent/launch.c -ldolly-js -o /usr/bin/classicube-agent

EXPORTS TOOL classicube-agent
EXPORTS TOOL classicube-viewer
EXPORTS TOOL classicube-pack
EXPORTS FOLDER classicube-agent-source /usr/src/dolly/classicube/agent
EXPORTS FOLDER game-input-source /usr/src/dolly/rts
FILE /usr/src/dolly/classicube/agent/COPYING
SLOP rm -rf /tmp/classicube-agent

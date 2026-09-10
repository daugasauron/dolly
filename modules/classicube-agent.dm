DOLLY 3
MODULE classicube-agent

REQUIRES HEADER cpp
REQUIRES HEADER quickjs-runner
REQUIRES HEADER sdl2
REQUIRES LIB dolly-js
REQUIRES LIB SDL2
REQUIRES TOOL cc
REQUIRES TOOL c++
REQUIRES TOOL pi
REQUIRES TOOL classicube
REQUIRES TOOL tar
REQUIRES TOOL rm

SOURCE HOST /static/classicube/agent.tar /tmp/classicube-agent/source.tar fcefab40c3ee0964786fbe3aadc0c673d2c299c8264e3adaed3ba17e5fb96776
SOURCE HOST /static/default/stb_truetype.h /tmp/classicube-agent/stb_truetype.h ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab
SLOP tar -xf /tmp/classicube-agent/source.tar -C /
SLOP c++ -O1 -std=c++11 -I/usr/include/SDL2 -I/tmp/classicube-agent \
  /usr/src/dolly/classicube/agent/viewer.cpp -o /usr/bin/classicube-viewer -lSDL2 -lm
SLOP cc -std=gnu11 -I/usr/include/dolly -DEMSCRIPTEN=1 -D_GNU_SOURCE \
  -DQUICKJS_NG_BUILD -DNDEBUG -funsigned-char -fdolly-runtime-interrupt-handler \
  /usr/src/dolly/classicube/agent/launch.c -ldolly-js -o /usr/bin/classicube-agent

EXPORTS TOOL classicube-agent
EXPORTS TOOL classicube-viewer
EXPORTS FOLDER classicube-agent-source /usr/src/dolly/classicube/agent
EXPORTS FOLDER game-input-source /usr/src/dolly/rts
FILE /usr/src/dolly/classicube/agent/COPYING
SLOP rm -rf /tmp/classicube-agent

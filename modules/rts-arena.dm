DOLLY 3
MODULE rts-arena

REQUIRES HEADER cpp
REQUIRES HEADER quickjs-runner
REQUIRES HEADER sdl2
REQUIRES LIB dolly-js
REQUIRES LIB SDL2
REQUIRES TOOL cc
REQUIRES TOOL c++
REQUIRES TOOL pi
REQUIRES TOOL seven-kingdoms
REQUIRES TOOL rm
REQUIRES TOOL printf
REQUIRES TOOL slop
REQUIRES TOOL foreground
REQUIRES TOOL test
REQUIRES TOOL tar

SOURCE HOST /static/rts/arena.tar /tmp/rts-arena/source.tar df4795409009538cce732a3249bf7b50a548fa76971d620b520be29e47f582a3
SOURCE HOST /static/default/stb_truetype.h /tmp/rts-arena/stb_truetype.h ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab
SLOP tar -xf /tmp/rts-arena/source.tar -C /
SLOP c++ -O1 -std=c++11 -I/usr/include/SDL2 -I/tmp/rts-arena \
  /usr/src/dolly/rts/spectator/viewer.cpp -o /usr/bin/rts-viewer -lSDL2 -lm
SLOP cc -std=gnu11 -I/usr/include/dolly -DEMSCRIPTEN=1 -D_GNU_SOURCE \
  -DQUICKJS_NG_BUILD -DNDEBUG -funsigned-char -fdolly-runtime-interrupt-handler \
  /usr/src/dolly/rts/spectator/launch.c -ldolly-js -o /usr/bin/rts-arena

EXPORTS TOOL rts-viewer
EXPORTS TOOL rts-arena
FOLDER /usr/src/dolly/rts
FILE /etc/dolly/init.slop
    if test -f "$HOME/.dollyrc"; then
      /bin/slop -e "$HOME/.dollyrc"
    fi
    /bin/foreground -i /bin/slop
FILE /home/dolly/.dollyrc
    printf '\033[33mDOLLY / RTS ARENA\033[0m\n'
    printf 'Two Pi agents play Seven Kingdoms from separate player screenshots.\n'
    printf 'First run pi and use /login for OpenRouter, then exit Pi.\n'
    printf 'Start: rts-arena MODEL_1 MODEL_2 [seconds, default 600]\n'
    printf 'Both models must accept images. Real API calls cost money.\n'
    printf 'Escape stops the match. Histories: /workspace/rts-matches\n'
    printf 'Try the game yourself: seven-kingdoms -noaudio -win\n\n'
SLOP rm -rf /tmp/rts-arena

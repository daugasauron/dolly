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
REQUIRES TOOL gzip
REQUIRES TOOL upload
REQUIRES TOOL mkdir

SOURCE HOST /static/rts/arena.tar /tmp/rts-arena/source.tar efbae2b542ac6a5e1d47ad607908dc7fe4639de4f5ef5b692e3206db660b82f0
SOURCE HOST /static/default/stb_truetype.h /tmp/rts-arena/stb_truetype.h ecd30b05e0dd4fea3a13c26810dd9e1992dc379049482c393d5a19e6b5090aab
SLOP tar -xf /tmp/rts-arena/source.tar -C /
SLOP mkdir -p /usr/share/dolly/rts
SLOP gzip -dc /tmp/rts-arena/demo.tar.gz | tar -xf - -C /usr/share/dolly/rts
FOLDER /usr/share/dolly/rts
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
    /bin/foreground -i /usr/bin/rts-arena
    /bin/foreground -i /bin/slop
FILE /home/dolly/.dollyrc
    printf 'Shell commands: rts-arena (launcher), seven-kingdoms -noaudio -win (play yourself).\n\n'
SLOP rm -rf /tmp/rts-arena

DOLLY 2
MODULE awk

REQUIRES HEADER libc
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/awk.tar /tmp/awk.tar d45ffb29145610a28424f4cab15c26d1ebc34840262342ee6b23cfbd4cae936b
SLOP tar \
  -xf /tmp/awk.tar \
  -C /

FILE /tmp/awk/Makefile
    .RECIPEPREFIX := >
    SOURCES := /usr/src/awk/awkgram.tab.c /usr/src/awk/b.c /usr/src/awk/main.c /usr/src/awk/parse.c /usr/src/awk/proctab.c /usr/src/awk/tran.c /usr/src/awk/lib.c /usr/src/awk/run.c /usr/src/awk/lex.c
    all: /bin/awk
    /usr/libexec/dolly/awk-maketab: /usr/src/awk/maketab.c
    >cc -std=gnu99 -I /usr/src/awk -DNDEBUG $< -o $@
    /usr/src/awk/proctab.c: /usr/libexec/dolly/awk-maketab /usr/src/awk/awkgram.tab.h
    >/usr/libexec/dolly/awk-maketab /usr/src/awk/awkgram.tab.h > $@
    /bin/awk: $(SOURCES)
    >cc -std=gnu99 -fno-builtin -I /usr/src/awk -D_DEFAULT_SOURCE -DNDEBUG $^ -o $@
SLOP CWD /usr/src/awk make \
  -f /tmp/awk/Makefile

EXPORTS TOOL awk
FILE /usr/share/licenses/awk/LICENSE

SLOP awk \
  --version

SLOP rm \
  -rf \
  /tmp/awk \
  /tmp/awk.tar \
  /usr/libexec/dolly/awk-maketab \
  /usr/src/awk

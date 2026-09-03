DOLLY 2
MODULE make

# The module owns Make's build-time command vocabulary. `cp` is required here,
# rather than by consumers which merely invoke Make, because real Make recipes
# rely on it. The Dollyfile checker documents this build contract; it is not a
# runtime sandbox for Make or Slop.
REQUIRES HEADER libc
REQUIRES TOOL   cc
REQUIRES TOOL   cp
REQUIRES TOOL   mkdir
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/make-4.4.1.tar                     /tmp/make-4.4.1.tar                       ab75d4663bea03a167059954d9b1abf580bbbacb2dd3ac9b1dd6455d2b2ef8a0
SOURCE HOST /static/default/runtimes/make-amalgamation-dolly.c /tmp/make-4.4.1/make-amalgamation-dolly.c c37c85dd20c843b9bface7e12bd190f8d943b18c0b2b5e0341cfdc2cba11b4fd

SLOP tar \
  -xf /tmp/make-4.4.1.tar \
  -C /
SLOP mkdir \
  -p \
  /usr/bin
SLOP cc \
  -c \
  -O1 \
  -std=gnu11 \
  -DDOLLY \
  -DHAVE_CONFIG_H \
  -I /usr/src/make \
  -I /usr/src/make/src \
  -I /usr/src/make/lib \
  '-DLIBDIR="/usr/lib"' \
  '-DLOCALEDIR="/usr/share/locale"' \
  -DDOLLY_MAKE_PART=1 \
  /tmp/make-4.4.1/make-amalgamation-dolly.c \
  -o /tmp/make-4.4.1/part-1.o
SLOP cc \
  -c \
  -O1 \
  -std=gnu11 \
  -DDOLLY \
  -DHAVE_CONFIG_H \
  -I /usr/src/make \
  -I /usr/src/make/src \
  -I /usr/src/make/lib \
  '-DLIBDIR="/usr/lib"' \
  '-DLOCALEDIR="/usr/share/locale"' \
  -DDOLLY_MAKE_PART=2 \
  /tmp/make-4.4.1/make-amalgamation-dolly.c \
  -o /tmp/make-4.4.1/part-2.o
SLOP cc \
  -c \
  -O1 \
  -std=gnu11 \
  -DDOLLY \
  -DHAVE_CONFIG_H \
  -I /usr/src/make \
  -I /usr/src/make/src \
  -I /usr/src/make/lib \
  '-DLIBDIR="/usr/lib"' \
  '-DLOCALEDIR="/usr/share/locale"' \
  -DDOLLY_MAKE_PART=3 \
  /tmp/make-4.4.1/make-amalgamation-dolly.c \
  -o /tmp/make-4.4.1/part-3.o
SLOP cc \
  -c \
  -O1 \
  -std=gnu11 \
  -DDOLLY \
  -DHAVE_CONFIG_H \
  -I /usr/src/make \
  -I /usr/src/make/src \
  -I /usr/src/make/lib \
  '-DLIBDIR="/usr/lib"' \
  '-DLOCALEDIR="/usr/share/locale"' \
  -DDOLLY_MAKE_PART=4 \
  /tmp/make-4.4.1/make-amalgamation-dolly.c \
  -o /tmp/make-4.4.1/part-4.o
SLOP cc \
  -c \
  -O1 \
  -std=gnu11 \
  -DDOLLY \
  -DHAVE_CONFIG_H \
  -I /usr/src/make \
  -I /usr/src/make/src \
  -I /usr/src/make/lib \
  '-DLIBDIR="/usr/lib"' \
  '-DLOCALEDIR="/usr/share/locale"' \
  -DDOLLY_MAKE_PART=5 \
  /tmp/make-4.4.1/make-amalgamation-dolly.c \
  -o /tmp/make-4.4.1/part-5.o
SLOP cc \
  -c \
  -O1 \
  -std=gnu11 \
  -DDOLLY \
  -DHAVE_CONFIG_H \
  -I /usr/src/make \
  -I /usr/src/make/src \
  -I /usr/src/make/lib \
  '-DLIBDIR="/usr/lib"' \
  '-DLOCALEDIR="/usr/share/locale"' \
  -DDOLLY_MAKE_PART=6 \
  /tmp/make-4.4.1/make-amalgamation-dolly.c \
  -o /tmp/make-4.4.1/part-6.o
SLOP cc \
  -c \
  -O1 \
  -std=gnu11 \
  -DDOLLY \
  -DHAVE_CONFIG_H \
  -I /usr/src/make \
  -I /usr/src/make/src \
  -I /usr/src/make/lib \
  '-DLIBDIR="/usr/lib"' \
  '-DLOCALEDIR="/usr/share/locale"' \
  -DDOLLY_MAKE_PART=7 \
  /tmp/make-4.4.1/make-amalgamation-dolly.c \
  -o /tmp/make-4.4.1/part-7.o
SLOP cc \
  /tmp/make-4.4.1/part-1.o \
  /tmp/make-4.4.1/part-2.o \
  /tmp/make-4.4.1/part-3.o \
  /tmp/make-4.4.1/part-4.o \
  /tmp/make-4.4.1/part-5.o \
  /tmp/make-4.4.1/part-6.o \
  /tmp/make-4.4.1/part-7.o \
  -o /usr/bin/make

EXPORTS TOOL make

SLOP make \
  --version

FILE /usr/share/licenses/make/COPYING

SLOP rm \
  -rf \
  /tmp/make-4.4.1 \
  /tmp/make-4.4.1.tar \
  /usr/src/make

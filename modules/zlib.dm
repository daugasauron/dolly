DOLLY 2
MODULE zlib

REQUIRES HEADER libc
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/zlib.tar /tmp/zlib.tar 40b7d2e43d4020d6d58ff480ccfab6fed01797276111f77281c45dec886c6dff
SLOP tar \
  -xf /tmp/zlib.tar \
  -C /

FILE /tmp/zlib/Makefile
    .RECIPEPREFIX := >
    CC := cc
    AR := ar
    NAMES := adler32 crc32 deflate gzclose gzlib gzread gzwrite infback inffast inflate inftrees trees uncompr zutil
    OBJECTS := $(addprefix /tmp/zlib/,$(addsuffix .o,$(NAMES)))
    all: /usr/lib/libz.a
    /tmp/zlib/%.o: /usr/src/zlib/%.c
    >$(CC) -std=c17 -I /usr/src/zlib -DZ_HAVE_UNISTD_H -c $< -o $@
    /usr/lib/libz.a: $(OBJECTS)
    >$(AR) rcs $@ $^
SLOP CWD /usr/src/zlib make \
  -f /tmp/zlib/Makefile

EXPORTS LIB    z     /usr/lib/libz.a
EXPORTS HEADER zlib  /usr/include/zlib.h
EXPORTS HEADER zconf /usr/include/zconf.h
FILE /usr/share/licenses/zlib/LICENSE

SLOP rm \
  -rf \
  /tmp/zlib \
  /tmp/zlib.tar \
  /usr/src/zlib

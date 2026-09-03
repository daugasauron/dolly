DOLLY 2
MODULE sbase-tools-7

REQUIRES HEADER libc
REQUIRES FOLDER sbase-source
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm

FILE /tmp/sbase-tools-7/Makefile
    .RECIPEPREFIX := >
    SBASE_CPPFLAGS := -I /usr/src/sbase -D_DEFAULT_SOURCE -D_XOPEN_SOURCE=700
    SBASE_TR_UTF := /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/fputrune.c /usr/src/sbase/libutf/isalnumrune.c /usr/src/sbase/libutf/isalpharune.c /usr/src/sbase/libutf/isblankrune.c /usr/src/sbase/libutf/iscntrlrune.c /usr/src/sbase/libutf/isdigitrune.c /usr/src/sbase/libutf/isgraphrune.c /usr/src/sbase/libutf/isprintrune.c /usr/src/sbase/libutf/ispunctrune.c /usr/src/sbase/libutf/isspacerune.c /usr/src/sbase/libutf/istitlerune.c /usr/src/sbase/libutf/isxdigitrune.c /usr/src/sbase/libutf/lowerrune.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/upperrune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/utftorunestr.c
    
    all: /bin/readlink /bin/rmdir /bin/seq
    
    /bin/readlink: /usr/src/sbase/readlink.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
    >$(CC) $(SBASE_CPPFLAGS) $^ -o $@
    
    /bin/rmdir: /usr/src/sbase/rmdir.c /usr/src/sbase/libutil/eprintf.c
    >$(CC) $(SBASE_CPPFLAGS) $^ -o $@
    
    /bin/seq: /usr/src/sbase/seq.c /usr/src/sbase/libutil/estrtod.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
    >$(CC) $(SBASE_CPPFLAGS) $^ -o $@

SLOP make \
  -f /tmp/sbase-tools-7/Makefile

EXPORTS TOOL readlink
EXPORTS TOOL rmdir
EXPORTS TOOL seq

SLOP rm \
  -rf \
  /tmp/sbase-tools-7


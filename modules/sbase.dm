DOLLY 2
MODULE sbase

REQUIRES HEADER libc
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/sbase.tar /tmp/sbase.tar a282c5fde4a339c91de04b7d70a860be49e631177acbf3244fe5e1bff7ce3338
SLOP tar \
  -xf /tmp/sbase.tar \
  -C /

FILE /tmp/sbase/Makefile
    .RECIPEPREFIX := >
    SBASE_CPPFLAGS := -I /usr/src/sbase -D_DEFAULT_SOURCE -D_XOPEN_SOURCE=700
    SBASE_TR_UTF := /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/fputrune.c /usr/src/sbase/libutf/isalnumrune.c /usr/src/sbase/libutf/isalpharune.c /usr/src/sbase/libutf/isblankrune.c /usr/src/sbase/libutf/iscntrlrune.c /usr/src/sbase/libutf/isdigitrune.c /usr/src/sbase/libutf/isgraphrune.c /usr/src/sbase/libutf/isprintrune.c /usr/src/sbase/libutf/ispunctrune.c /usr/src/sbase/libutf/isspacerune.c /usr/src/sbase/libutf/istitlerune.c /usr/src/sbase/libutf/isxdigitrune.c /usr/src/sbase/libutf/lowerrune.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/upperrune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/utftorunestr.c
    
    all: /bin/grep /bin/sed /bin/head
    
    /bin/grep: /usr/src/sbase/grep.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strcasestr.c
    >$(CC) $(SBASE_CPPFLAGS) $^ -o $@
    
    /bin/sed: /usr/src/sbase/sed.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strlcat.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/isdigitrune.c /usr/src/sbase/libutf/isspacerune.c
    >$(CC) $(SBASE_CPPFLAGS) $^ -o $@
    
    /bin/head: /usr/src/sbase/head.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strtonum.c
    >$(CC) $(SBASE_CPPFLAGS) $^ -o $@

SLOP make \
  -f /tmp/sbase/Makefile

EXPORTS TOOL   grep
EXPORTS TOOL   sed
EXPORTS TOOL   head
EXPORTS FOLDER sbase-source /usr/src/sbase

FILE /usr/share/licenses/sbase/LICENSE

SLOP rm \
  -rf \
  /tmp/sbase \
  /tmp/sbase.tar


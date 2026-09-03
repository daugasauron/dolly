DOLLY 2
MODULE sbase

REQUIRES HEADER libc
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/sbase.tar /tmp/sbase.tar 5368e7a9685fda25b2f30ff3beaaa4b216fb74d2252af315ba5ae2d076be1500
SLOP tar \
  -xf /tmp/sbase.tar \
  -C /

FILE /tmp/sbase/Makefile
    .RECIPEPREFIX := >
    CPPFLAGS := -O0 -I /usr/src/sbase -D_DEFAULT_SOURCE -D_XOPEN_SOURCE=700
    all: /bin/grep /bin/sed /bin/head /bin/wc /bin/printf
    /bin/grep: /usr/src/sbase/grep.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strcasestr.c
    >cc $(CPPFLAGS) $^ -o $@
    /bin/sed: /usr/src/sbase/sed.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strlcat.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/isdigitrune.c /usr/src/sbase/libutf/isspacerune.c
    >cc $(CPPFLAGS) $^ -o $@
    /bin/head: /usr/src/sbase/head.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strtonum.c
    >cc $(CPPFLAGS) $^ -o $@
    /bin/wc: /usr/src/sbase/wc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/isspacerune.c
    >cc $(CPPFLAGS) $^ -o $@
    /bin/printf: /usr/src/sbase/printf.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutil/estrtod.c /usr/src/sbase/libutil/unescape.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/utftorunestr.c /usr/src/sbase/libutf/fputrune.c
    >cc $(CPPFLAGS) $^ -o $@
SLOP CWD /usr/src/sbase make \
  -f /tmp/sbase/Makefile

EXPORTS TOOL printf

SLOP printf 'PRINTF-%s\n' OK

EXPORTS TOOL grep
EXPORTS TOOL sed
EXPORTS TOOL head
EXPORTS TOOL wc
FILE /usr/share/licenses/sbase/LICENSE

SLOP rm \
  -rf \
  /tmp/sbase \
  /tmp/sbase.tar \
  /usr/src/sbase

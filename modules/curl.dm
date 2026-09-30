DOLLY 4
MODULE curl

REQUIRES HEADER libc
REQUIRES HEADER http
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/curl-headers.tar /tmp/curl-headers.tar          346a0298fcbdafbad7d0c0259a2d7b8539ca46c39222797c01dcac213564bf30
SOURCE HOST /static/default/libcurl-fetch.c  /usr/src/dolly/libcurl-fetch.c 64fcfcbbadd48a57a7b1616bb9e55c6a673109c2de862c8cc8dcbcca999e5e3a
SOURCE HOST /static/default/commands/curl.c  /usr/src/dolly/commands/curl.c 75c202d3011209d717936320a52dd5bd57099d550acedf783f34d4220968789a
SLOP tar \
  -xf /tmp/curl-headers.tar \
  -C /

FILE /tmp/curl/Makefile
    .RECIPEPREFIX := >
    all: /usr/lib/libcurl.a /usr/bin/curl
    /tmp/libcurl-fetch.o: /usr/src/dolly/libcurl-fetch.c
    >cc \
    >  -std=c17 \
    >  -D_DEFAULT_SOURCE \
    >  -c $< \
    >  -o $@
    /usr/lib/libcurl.a: /tmp/libcurl-fetch.o
    >ar rcs $@ $^
    /usr/bin/curl: /usr/src/dolly/commands/curl.c /usr/lib/libcurl.a
    >cc \
    >  -O2 \
    >  $< \
    >  -lcurl \
    >  -o $@
SLOP CWD / make \
  -f /tmp/curl/Makefile

EXPORTS TOOL curl

SLOP curl \
  --version

EXPORTS LIB    curl /usr/lib/libcurl.a
EXPORTS HEADER curl /usr/include/curl
FILE /usr/share/licenses/curl/COPYING

SLOP rm \
  -rf \
  /tmp/curl \
  /tmp/curl-headers.tar \
  /tmp/libcurl-fetch.o \
  /usr/src/dolly/commands/curl.c \
  /usr/src/dolly/libcurl-fetch.c

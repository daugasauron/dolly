DOLLY 5
MODULE curl

REQUIRES HEADER libc
REQUIRES HEADER http
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE https://daugasauron.com/static/default/curl-headers.tar 346a0298fcbdafbad7d0c0259a2d7b8539ca46c39222797c01dcac213564bf30 /tmp/curl-headers.tar
SOURCE https://daugasauron.com/static/default/libcurl-fetch.c  e95e16c33b53ede305b18bbe5c6a0c7b2c377267155d90d6a1e8a527aa805107 /usr/src/dolly/libcurl-fetch.c
SOURCE https://daugasauron.com/static/default/commands/curl.c  75c202d3011209d717936320a52dd5bd57099d550acedf783f34d4220968789a /usr/src/dolly/commands/curl.c
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

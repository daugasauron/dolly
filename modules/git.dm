DOLLY 2
MODULE git

REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   mkdir
REQUIRES TOOL   rm
REQUIRES TOOL   tar
REQUIRES LIB    curl
REQUIRES LIB    z
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES HEADER curl
REQUIRES HEADER zlib

SOURCE HOST /static/default/git.tar /tmp/git.tar de16aff0eb6fa490618b66f0f6e5b16206e8cc212498070a5e605a1bb749d8ca
SLOP tar \
  -xf /tmp/git.tar \
  -C /

FILE /etc/gitconfig
    [maintenance]
        auto = false
FILE /home/dolly/.gitconfig
    [user]
        name = Dolly
        email = dolly@example.invalid
FILE /tmp/git/Makefile
    .RECIPEPREFIX := >
    SOURCES := $(file </usr/src/git/dolly-sources.txt)
    OBJECTS := $(addprefix /tmp/git/objects/,$(SOURCES:.c=.o))
    # Embedded Clang 6 can corrupt compiler-rt signatures and introduce libc
    # imports while optimizing Git's large translation units. Keep this
    # bootstrap build unoptimized until the in-Dolly compiler is replaced.
    CPPFLAGS := \
      -O0 \
      -std=gnu99 \
      -D_DEFAULT_SOURCE \
      -DDOLLY \
      -Uatexit \
      -DNO_GETTEXT \
      -DNO_ICONV \
      -DNO_EXPAT \
      -DNO_PTHREADS \
      -DNO_UNIX_SOCKETS \
      -DNO_OPENSSL \
      -DNO_PERL \
      -DNO_PYTHON \
      -DNO_IPV6 \
      -DNO_MMAP \
      -DNO_POLL \
      -DNO_REGEX \
      -DGAWK \
      -DNO_MBSUPPORT \
      -DNO_MEMMEM \
      -DNO_PREAD \
      -DNO_SETENV \
      -DNO_STRCASESTR \
      -DNO_STRLCPY \
      -DNO_STRTOUMAX \
      -Dprintf=iprintf \
      -Dfprintf=fiprintf \
      -DSHA1_BLK \
      -DSHA256_BLK \
      -DHAVE_ALLOCA_H \
      -DHAVE_STRINGS_H \
      -DHAVE_CLOCK_GETTIME \
      -DHAVE_GETRANDOM \
      '-DGIT_VERSION_H="version-def.h"' \
      '-DBINDIR="/usr/bin"' \
      '-DGIT_EXEC_PATH="/usr/libexec/dolly"' \
      '-DDEFAULT_GIT_TEMPLATE_DIR="/usr/share/git-core/templates"' \
      '-DFALLBACK_RUNTIME_PREFIX="/usr"' \
      '-DGIT_HOST_CPU="wasm64"' \
      '-DGIT_LOCALE_PATH="/usr/share/locale"' \
      '-DSHELL_PATH="/bin/slop"' \
      '-DPAGER_ENV="LESS=FRX LV=-c"' \
      '-DETC_GITCONFIG="/etc/gitconfig"' \
      '-DETC_GITATTRIBUTES="/etc/gitattributes"' \
      '-DGIT_HTML_PATH="/usr/share/doc/git/html"' \
      '-DGIT_MAN_PATH="/usr/share/man"' \
      '-DGIT_INFO_PATH="/usr/share/info"' \
      -I /usr/src/git/compat/regex \
      -I /usr/src/git/compat/poll \
      -I /usr/src/git \
      -include dolly/runtime.h
    all: /usr/bin/git /usr/libexec/dolly/git-remote-http /usr/libexec/dolly/git-remote-https
    /tmp/git/objects/%.o: /usr/src/git/%.c
    >mkdir -p $(dir $@)
    >cc \
    >  $(CPPFLAGS) \
    >  -c $< \
    >  -o $@
    /usr/lib/libgit.a: $(OBJECTS)
    >ar rcs $@ $^
    /usr/bin/git: /usr/src/git/common-main.c /usr/src/git/git.c /usr/lib/libgit.a
    >cc \
    >  $(CPPFLAGS) \
    >  /usr/src/git/common-main.c \
    >  /usr/src/git/git.c \
    >  -lgit \
    >  -lz \
    >  -o $@
    /usr/libexec/dolly:
    >mkdir -p $@
    /usr/libexec/dolly/git-remote-http: /usr/src/git/common-main.c /usr/src/git/remote-curl.c /usr/src/git/http.c /usr/src/git/http-walker.c /usr/lib/libgit.a | /usr/libexec/dolly
    >cc \
    >  $(CPPFLAGS) \
    >  /usr/src/git/common-main.c \
    >  /usr/src/git/remote-curl.c \
    >  /usr/src/git/http.c \
    >  /usr/src/git/http-walker.c \
    >  -lgit \
    >  -lcurl \
    >  -lz \
    >  -o $@
    /usr/libexec/dolly/git-remote-https: /usr/libexec/dolly/git-remote-http
    >cc \
    >  $(CPPFLAGS) \
    >  /usr/src/git/common-main.c \
    >  /usr/src/git/remote-curl.c \
    >  /usr/src/git/http.c \
    >  /usr/src/git/http-walker.c \
    >  -lgit \
    >  -lcurl \
    >  -lz \
    >  -o $@
SLOP CWD /usr/src/git make \
  -f /tmp/git/Makefile

EXPORTS TOOL git

SLOP git \
  --version

FILE /usr/libexec/dolly/git-remote-http
FILE /usr/libexec/dolly/git-remote-https
FOLDER /usr/share/git-core/templates
FILE /usr/share/licenses/git/COPYING

SLOP rm \
  -rf \
  /tmp/git \
  /tmp/git.tar \
  /usr/src/git

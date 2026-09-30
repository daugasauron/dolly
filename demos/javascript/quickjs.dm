DOLLY 4
MODULE quickjs

REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   cp
REQUIRES TOOL   ln
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES HEADER http
REQUIRES HEADER download

SOURCE HOST /static/default/quickjs.tar               /tmp/quickjs.tar                       d23b73610440a642dfb49de7910cbf34550d31b3a9ca375291f9c74444749d8a
SOURCE HOST /static/default/runtimes/quickjs-main.c   /usr/src/dolly/runtimes/quickjs-main.c bad6c005aeb0eff4b25288eb5c45e747ed249292ea8e2f283fc8366667abe1d3
SOURCE HOST /static/default/runtimes/quickjs-runner.h /usr/include/dolly/quickjs-runner.h    dff97c2bbc62d51460e232a9f58550eb6320bd81341bff9ebf136b31a0fc206b
SOURCE HOST /static/default/runtimes/dolly-node.js    /usr/lib/dolly/node.js                 40448087ab3ee29e64c04a99d247e16bb3e64a32f6dfe556aff71be5dc454bc2
SOURCE HOST /static/default/runtimes/janis.js         /usr/lib/janis/runtime.js              6e26da666975911f13f3ed7dd39a4deb7334542e1fbb27ac82d2762c58b0480e
SOURCE HOST /static/default/commands/janis.c          /usr/src/dolly/commands/janis.c        08c40227d11f06e851a6406fe5ed8f8d7e5f7cdd28a3dad2609c04650a7afe1b
SLOP tar \
  -xf /tmp/quickjs.tar \
  -C /

FILE /tmp/quickjs/Makefile
    .RECIPEPREFIX := >
    NAMES := dtoa libregexp libunicode quickjs
    OBJECTS := /tmp/quickjs/main.o $(addprefix /tmp/quickjs/,$(addsuffix .o,$(NAMES)))
    CPPFLAGS := \
      -O2 \
      -std=gnu11 \
      -I /usr/src/quickjs \
      -I /usr/include/dolly \
      -DEMSCRIPTEN=1 \
      -D_GNU_SOURCE \
      -DQUICKJS_NG_BUILD \
      -DNDEBUG \
      -funsigned-char \
      -fdolly-runtime-interrupt-handler
    all: /usr/bin/janis
    /tmp/quickjs/main.o: /usr/src/dolly/runtimes/quickjs-main.c
    >cc $(CPPFLAGS) -c $< -o $@
    /tmp/quickjs/%.o: /usr/src/quickjs/%.c
    >cc $(CPPFLAGS) -c $< -o $@
    /usr/lib/libdolly-js.a: $(OBJECTS)
    >ar rcs $@ $^
    /usr/bin/janis: /usr/src/dolly/commands/janis.c /usr/lib/libdolly-js.a
    >cc $(CPPFLAGS) $< -ldolly-js -o $@
SLOP CWD / make \
  -f /tmp/quickjs/Makefile
# qjs is the same program as janis.
SLOP ln -s janis /usr/bin/qjs

EXPORTS TOOL qjs
EXPORTS TOOL janis

SLOP qjs \
  --version
SLOP janis \
  --version

FILE /usr/lib/dolly/node.js
FILE /usr/lib/janis/runtime.js
EXPORTS LIB    dolly-js       /usr/lib/libdolly-js.a
EXPORTS HEADER quickjs-runner /usr/include/dolly/quickjs-runner.h
SLOP cp /usr/src/quickjs/quickjs.h /usr/include/quickjs.h
EXPORTS HEADER quickjs /usr/include/quickjs.h
FILE /usr/share/licenses/quickjs-ng/LICENSE

SLOP rm \
  -rf \
  /tmp/quickjs \
  /tmp/quickjs.tar \
  /usr/src/dolly/commands/janis.c \
  /usr/src/dolly/runtimes \
  /usr/src/quickjs

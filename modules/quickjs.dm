DOLLY 2
MODULE quickjs

REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES HEADER http
REQUIRES HEADER download

SOURCE HOST /static/default/quickjs.tar               /tmp/quickjs.tar                       d23b73610440a642dfb49de7910cbf34550d31b3a9ca375291f9c74444749d8a
SOURCE HOST /static/default/runtimes/quickjs-main.c   /usr/src/dolly/runtimes/quickjs-main.c 05514edfb37059ac9e7a1f9f8a1734f85e277756c002f59653a328b67034f064
SOURCE HOST /static/default/runtimes/quickjs-runner.h /usr/include/dolly/quickjs-runner.h    94853e68315a36d48167d4b8c1a09f4c33acf12f93e27f713110f0578ad5c597
SOURCE HOST /static/default/runtimes/dolly-node.js    /usr/lib/dolly/node.js                 e4d385b4576f0a08a34e361056f613ec622f9d76fc6fab291249ec2c423db0f8
SOURCE HOST /static/default/runtimes/janis.js         /usr/lib/janis/runtime.js              c5c834c9cb4292118c3bf68aa44e73e9756c09f50ee344ebdb5fe4abc6e78f00
SOURCE HOST /static/default/commands/qjs.c            /usr/src/dolly/commands/qjs.c          08c40227d11f06e851a6406fe5ed8f8d7e5f7cdd28a3dad2609c04650a7afe1b
SOURCE HOST /static/default/commands/janis.c          /usr/src/dolly/commands/janis.c        08c40227d11f06e851a6406fe5ed8f8d7e5f7cdd28a3dad2609c04650a7afe1b
SLOP tar \
  -xf /tmp/quickjs.tar \
  -C /

FILE /tmp/quickjs/Makefile
    .RECIPEPREFIX := >
    NAMES := dtoa libregexp libunicode quickjs
    OBJECTS := /tmp/quickjs/main.o $(addprefix /tmp/quickjs/,$(addsuffix .o,$(NAMES)))
    CPPFLAGS := \
      -std=gnu11 \
      -I /usr/src/quickjs \
      -I /usr/include/dolly \
      -DEMSCRIPTEN=1 \
      -D_GNU_SOURCE \
      -DQUICKJS_NG_BUILD \
      -DNDEBUG \
      -funsigned-char \
      -fdolly-runtime-interrupt-handler
    all: /usr/bin/qjs /usr/bin/janis
    /tmp/quickjs/main.o: /usr/src/dolly/runtimes/quickjs-main.c
    >cc $(CPPFLAGS) -c $< -o $@
    /tmp/quickjs/%.o: /usr/src/quickjs/%.c
    >cc $(CPPFLAGS) -c $< -o $@
    /usr/lib/libdolly-js.a: $(OBJECTS)
    >ar rcs $@ $^
    /usr/bin/qjs: /usr/src/dolly/commands/qjs.c /usr/lib/libdolly-js.a
    >cc $(CPPFLAGS) $< -ldolly-js -o $@
    /usr/bin/janis: /usr/src/dolly/commands/janis.c /usr/lib/libdolly-js.a
    >cc $(CPPFLAGS) $< -ldolly-js -o $@
SLOP CWD / make \
  -f /tmp/quickjs/Makefile

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
FILE /usr/share/licenses/quickjs-ng/LICENSE

SLOP rm \
  -rf \
  /tmp/quickjs \
  /tmp/quickjs.tar \
  /usr/src/dolly/commands/janis.c \
  /usr/src/dolly/commands/qjs.c \
  /usr/src/dolly/runtimes \
  /usr/src/quickjs

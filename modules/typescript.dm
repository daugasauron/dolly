DOLLY 2
MODULE typescript

# The unchanged npm TypeScript distribution runs under Janis. Its launcher is
# compiled as an ordinary Dolly executable and the compiler is exercised in
# the sandbox before this reusable layer is published.
REQUIRES HEADER libc
REQUIRES HEADER quickjs-runner
REQUIRES LIB    dolly-js
REQUIRES TOOL   cc
REQUIRES TOOL   gzip
REQUIRES TOOL   make
REQUIRES TOOL   mkdir
REQUIRES TOOL   qjs
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/typescript-5.9.3.tgz   /tmp/typescript/typescript.tgz    10e108c9cf7d5f2879053dff18515fb405abf2ccef63eaaf017d9c571687a1d3
SOURCE HOST /static/default/runtimes/tsc-dolly.mjs /usr/lib/typescript/tsc-dolly.mjs c81fe4905c8a1aeb83fd8dca09f7ad05242d2975efa91c1c7f004acc23eac80d
SOURCE HOST /static/default/commands/tsc.c         /tmp/typescript/tsc.c             eed8eb879762896740cec873c5ff227bc819e82b422bb2a35d32d420c0aee5eb

SLOP gzip \
  -dc \
  /tmp/typescript/typescript.tgz \
  > /tmp/typescript/typescript.tar
SLOP mkdir \
  -p \
  /usr/lib/typescript
SLOP tar \
  -xf /tmp/typescript/typescript.tar \
  -C /usr/lib/typescript

FILE /tmp/typescript/Makefile
    .RECIPEPREFIX := >
    CPPFLAGS := -std=gnu11 -I /usr/include/dolly -DEMSCRIPTEN=1 -D_GNU_SOURCE -DQUICKJS_NG_BUILD -DNDEBUG -funsigned-char -fdolly-runtime-interrupt-handler
    all: /usr/bin/tsc
    /usr/bin/tsc: /tmp/typescript/tsc.c /usr/lib/typescript/tsc-dolly.mjs /usr/lib/typescript/package/lib/_tsc.js
    >cc $(CPPFLAGS) $< -ldolly-js -o $@
SLOP make \
  -f /tmp/typescript/Makefile

EXPORTS TOOL   tsc
EXPORTS FOLDER typescript /usr/lib/typescript

SLOP tsc \
  --version

SLOP rm \
  -rf \
  /tmp/typescript

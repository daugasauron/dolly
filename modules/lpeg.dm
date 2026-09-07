DOLLY 3
MODULE lpeg

REQUIRES HEADER lua
REQUIRES TOOL lua
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL tar
REQUIRES TOOL mkdir
REQUIRES TOOL cp
REQUIRES TOOL rm

SOURCE HOST /static/neovim/lpeg.tar /tmp/lpeg/source.tar e8a9fd286cf0ba6b9eff1ac12680eca887e409236b34a556a5cf6e55957f83f6
SLOP tar -xf /tmp/lpeg/source.tar -C /
SLOP make -C /tmp/lpeg/source CC=cc LUADIR=/usr/include/lua5.1 \
  COPT=-O0 DLLFLAGS=-shared lpeg.so
SLOP ar rcs /usr/lib/liblpeg.a /tmp/lpeg/source/lpvm.o /tmp/lpeg/source/lpcap.o \
  /tmp/lpeg/source/lptree.o /tmp/lpeg/source/lpcode.o /tmp/lpeg/source/lpprint.o /tmp/lpeg/source/lpcset.o
SLOP mkdir -p /usr/lib/lua/5.1 /usr/share/lua/5.1
SLOP cp /tmp/lpeg/source/lpeg.so /usr/lib/lua/5.1/lpeg.so
SLOP cp /tmp/lpeg/source/re.lua /usr/share/lua/5.1/re.lua
SLOP lua -e 'local lpeg = require("lpeg"); assert(lpeg.match(lpeg.P("Dolly"), "Dolly") == 6); assert(require("re").match("hello", "%a+") == 6)'

EXPORTS LIB lpeg /usr/lib/liblpeg.a
EXPORTS LIB lua-lpeg /usr/lib/lua/5.1/lpeg.so
EXPORTS FOLDER lua-re /usr/share/lua/5.1
FILE /usr/share/licenses/lpeg/lpeg.html

SLOP rm -rf /tmp/lpeg

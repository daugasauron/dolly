DOLLY 3
MODULE lua

# Neovim supports PUC Lua 5.1. Build the upstream interpreter and C library;
# -rdynamic lets source-built Lua C modules share that interpreter's API.
REQUIRES HEADER libc
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL gzip
REQUIRES TOOL tar
REQUIRES TOOL mkdir
REQUIRES TOOL cp
REQUIRES TOOL rm
REQUIRES TOOL sed

SOURCE HOST /static/neovim/lua-5.1.5.tar.gz /tmp/lua/source.tar.gz 2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333
SLOP gzip -dc /tmp/lua/source.tar.gz > /tmp/lua/source.tar
SLOP tar -xf /tmp/lua/source.tar -C /tmp/lua
SLOP sed 's@"/usr/local/"@"/usr/"@' /tmp/lua/lua-5.1.5/src/luaconf.h > /tmp/lua/luaconf.h
SLOP cp /tmp/lua/luaconf.h /tmp/lua/lua-5.1.5/src/luaconf.h
SLOP make -C /tmp/lua/lua-5.1.5/src \
  CC=cc \
  'CFLAGS=-O0 -std=gnu99 -DLUA_USE_POSIX -DLUA_USE_DLOPEN' \
  MYLDFLAGS=-rdynamic \
  'AR=ar rcs' \
  RANLIB=: \
  lua
SLOP cp /tmp/lua/lua-5.1.5/src/lua /usr/bin/lua
SLOP cp /tmp/lua/lua-5.1.5/src/liblua.a /usr/lib/liblua.a
SLOP mkdir -p /usr/include/lua5.1 /usr/share/licenses/lua
SLOP cp /tmp/lua/lua-5.1.5/src/lua.h /tmp/lua/lua-5.1.5/src/luaconf.h \
  /tmp/lua/lua-5.1.5/src/lauxlib.h /tmp/lua/lua-5.1.5/src/lualib.h /usr/include/lua5.1
SLOP cp /tmp/lua/lua-5.1.5/COPYRIGHT /usr/share/licenses/lua/COPYRIGHT

FILE /tmp/lua/extension.c
    #include <lua.h>
    #include <lauxlib.h>
    int luaopen_dolly_lua_check(lua_State* state) { lua_pushinteger(state, 42); return 1; }
SLOP cc -O0 -shared -I/usr/include/lua5.1 /tmp/lua/extension.c -o /tmp/lua/extension.so
SLOP lua -e 'assert(_VERSION == "Lua 5.1"); assert(assert(package.loadlib("/tmp/lua/extension.so", "luaopen_dolly_lua_check"))() == 42); local f = assert(io.open("/tmp/lua/data", "w")); f:write("shared files"); f:close(); assert(os.execute("test -s /tmp/lua/data") == 0)'

EXPORTS TOOL lua
EXPORTS HEADER lua /usr/include/lua5.1
EXPORTS LIB lua /usr/lib/liblua.a
FILE /usr/share/licenses/lua/COPYRIGHT

SLOP rm -rf /tmp/lua

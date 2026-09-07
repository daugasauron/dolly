DOLLY 3
MODULE luv

REQUIRES HEADER uv
REQUIRES HEADER lua
REQUIRES LIB uv
REQUIRES LIB lua
REQUIRES TOOL cmake
REQUIRES TOOL lua
REQUIRES TOOL cc
REQUIRES TOOL make
REQUIRES TOOL ar
REQUIRES TOOL tar
REQUIRES TOOL rm

SOURCE HOST /static/neovim/luv.tar /tmp/luv/source.tar 576f4f861cabfd1d7313d56124e1473f724f3da09060df4dc93d59936d3b4004
SLOP tar -xf /tmp/luv/source.tar -C /
SLOP cmake -S /tmp/luv/source -B /tmp/luv/build \
  -DCMAKE_INSTALL_PREFIX=/usr -DCMAKE_C_FLAGS=-O0 \
  -DWITH_LUA_ENGINE=Lua -DLUA_BUILD_TYPE=System \
  -DLUA_INCLUDE_DIR=/usr/include/lua5.1 -DLUA_LIBRARY=/usr/lib/liblua.a -DLUA_MATH_LIBRARY:STRING=m \
  -DWITH_SHARED_LIBUV=ON -DBUILD_STATIC_LIBS=ON -DBUILD_MODULE=ON -DBUILD_SHARED_LIBS=OFF
SLOP cmake --build /tmp/luv/build
SLOP cmake --install /tmp/luv/build

FILE /tmp/luv/check.lua
    local uv = require("luv")
    local fired = false
    local timer = assert(uv.new_timer())
    timer:start(1, 0, function() fired = true; timer:close() end)
    uv.run()
    assert(fired)
    local fd = assert(uv.fs_open("/tmp/luv/check.txt", "w", 438))
    assert(uv.fs_write(fd, "Dolly", 0) == 5)
    assert(uv.fs_close(fd))
    assert(uv.fs_stat("/tmp/luv/check.txt").size == 5)
SLOP lua /tmp/luv/check.lua

EXPORTS HEADER luv /usr/include/luv
EXPORTS LIB luv /usr/lib/libluv.a
EXPORTS LIB lua-luv /usr/lib/lua/5.1/luv.so
FILE /usr/share/licenses/luv/LICENSE.txt
FILE /usr/share/licenses/lua-compat53/LICENSE
SLOP rm -rf /tmp/luv

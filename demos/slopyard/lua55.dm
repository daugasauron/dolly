DOLLY 5
MODULE lua55

REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL gzip
REQUIRES TOOL tar
REQUIRES TOOL cp
REQUIRES TOOL mkdir
REQUIRES TOOL rm
REQUIRES HEADER libc

SOURCE https://daugasauron.com/dist/static/slopyard/lua-5.5.1.tar.gz 1c4b4068d67061f2a2231ad2b5422e77acea1487ea9890f6320af614f4373dce /tmp/lua55/source.tar.gz
SLOP gzip -dc /tmp/lua55/source.tar.gz > /tmp/lua55/source.tar
SLOP tar -xf /tmp/lua55/source.tar -C /tmp/lua55
FILE /tmp/lua55/Makefile
    SOURCE := /tmp/lua55/lua-5.5.1/src
    FILES := $(filter-out $(SOURCE)/lua.c,$(wildcard $(SOURCE)/*.c))
    OBJECTS := $(patsubst $(SOURCE)/%.c,/tmp/lua55/%.o,$(FILES))
    /usr/lib/liblua5.5.a: $(OBJECTS)
    	ar rcs $@ $^
    /tmp/lua55/%.o: $(SOURCE)/%.c
    	cc -std=c17 -O2 -U__SIZEOF_INT128__ -DLUA_USE_C89 -I $(SOURCE) -c $< -o $@
SLOP make -f /tmp/lua55/Makefile
SLOP mkdir -p /usr/include/lua5.5 /usr/share/licenses/lua5.5
SLOP cp /tmp/lua55/lua-5.5.1/src/lua.h /tmp/lua55/lua-5.5.1/src/luaconf.h /tmp/lua55/lua-5.5.1/src/lauxlib.h /tmp/lua55/lua-5.5.1/src/lualib.h /usr/include/lua5.5
SLOP cp /tmp/lua55/lua-5.5.1/doc/readme.html /usr/share/licenses/lua5.5/readme.html
SLOP rm -rf /tmp/lua55
EXPORTS LIB lua55 /usr/lib/liblua5.5.a
EXPORTS HEADER lua55 /usr/include/lua5.5
FILE /usr/share/licenses/lua5.5/readme.html

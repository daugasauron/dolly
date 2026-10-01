DOLLY 5
MODULE zero-ad-engine

# Premake and the 0 A.D. engine (pyrogenesis), built by upstream's premake
# Makefiles with Dolly's c++.
REQUIRES TOOL cc
REQUIRES TOOL c++
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL pkg-config
REQUIRES TOOL gzip
REQUIRES TOOL tar
REQUIRES TOOL patch
REQUIRES TOOL cp
REQUIRES TOOL mkdir

SOURCE https://daugasauron.com/dist/static/zero-ad-build/engine.tar.gz b3c563dcbfb5adc57eadfd954c15485c086dc0cb280a9da29834252ea66b48c6 /tmp/0ad.tar.gz
SLOP gzip -dc /tmp/0ad.tar.gz | tar -xf - -C /
SLOP patch -p1 -d /tmp/0ad -i /tmp/0ad-patches/engine.patch

# Bootstrap.mak's two stages: a premake that loads its scripts, then one with
# them embedded. Its own Makefiles are skipped for their unbounded make -j.
SLOP patch -p1 -d /tmp/premake-core-5.0.0-beta7 -i /tmp/0ad-patches/premake.patch
FILE /tmp/premake.slop
    set -ex
    cd /tmp/premake-core-5.0.0-beta7
    lua=
    for name in lapi lauxlib lbaselib lbitlib lcode lcorolib lctype ldblib ldebug ldo ldump lfunc lgc linit liolib llex lmathlib lmem loadlib lobject lopcodes loslib lparser lstate lstring lstrlib ltable ltablib ltm lundump lutf8lib lvm lzio; do
      lua="$lua contrib/lua/src/$name.c"
    done
    flags='-DLUA_STATICLIB -DLUA_USE_POSIX -DLUA_USE_DLOPEN -Icontrib/lua/src -Icontrib/luashim'
    cc -O1 -o premake_bootstrap -DPREMAKE_NO_BUILTIN_SCRIPTS $flags src/host/*.c $lua -lm
    ./premake_bootstrap embed
    cc -O2 -o /usr/bin/premake5 $flags src/host/*.c src/scripts.c $lua -lm
SLOP slop -e /tmp/premake.slop

# Bootstrap exception: SpiderMonkey is still cross-compiled outside Dolly
# (toolchain/build-spidermonkey.sh).
SOURCE https://daugasauron.com/dist/static/zero-ad-build/mozjs-host.tar.gz 92826d6f0eede8d1b3fc7a750019de7a7e0f2ac93167740cdf58c9d389fd1f29 /tmp/mozjs.tar.gz
SLOP gzip -dc /tmp/mozjs.tar.gz | tar -xf - -C /
FILE /tmp/pkgconfig/mozjs-128.pc
    Name: SpiderMonkey 128.13.0
    Description: The Mozilla library for JavaScript
    Version: 128.13.0
    Cflags: -I/tmp/mozjs/include
    Libs: -L/tmp/mozjs/lib -ljs_static -ljsrust

SLOP CWD /tmp/0ad/build/premake PKG_CONFIG_PATH=/tmp/pkgconfig CC=cc CXX=c++ \
  premake5 --os=emscripten --minimal-flags --strip-binaries --with-system-mozjs \
  --without-atlas --without-nvtt --without-lobby --without-miniupnpc --without-pch \
  --without-tests --without-dap-interface --outpath=../workspaces/dolly gmake
# Premake's ALL_CPPFLAGS adds -MP, which Dolly's c++ does not accept.
SLOP CWD /tmp/0ad/build/workspaces/dolly time make config=release -j4 CC=cc CXX=c++ AR=ar \
  'ALL_CPPFLAGS=$(CPPFLAGS) -MD $(DEFINES) $(INCLUDES)' pyrogenesis
SLOP mkdir -p /opt/0ad/system
SLOP cp /tmp/0ad/binaries/system/pyrogenesis.wasm /opt/0ad/system/pyrogenesis
SLOP /opt/0ad/system/pyrogenesis -version

EXPORTS FILE pyrogenesis /opt/0ad/system/pyrogenesis

DOLLY 3
MODULE cmake

# Bootstrap CMake from upstream source using the already source-built libuv.
REQUIRES HEADER cpp
REQUIRES LIB c++
REQUIRES LIB c++abi
REQUIRES HEADER uv
REQUIRES LIB uv
REQUIRES LIB curl
REQUIRES LIB z
REQUIRES TOOL cc
REQUIRES TOOL c++
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL slop
REQUIRES TOOL sh
REQUIRES TOOL tar
REQUIRES TOOL mkdir
REQUIRES TOOL cp
REQUIRES TOOL rm
REQUIRES TOOL cat
REQUIRES TOOL dirname
REQUIRES TOOL diff
REQUIRES TOOL echo
REQUIRES TOOL false
REQUIRES TOOL grep
REQUIRES TOOL printf
REQUIRES TOOL pwd
REQUIRES TOOL sed
REQUIRES TOOL test
REQUIRES TOOL tr
REQUIRES TOOL true
REQUIRES TOOL uname
REQUIRES TOOL which

SOURCE HOST /static/neovim/cmake.tar /tmp/cmake/source.tar 5998029fcd38be176d3fa88af700aa95f21e817aea3a8168c6d3ce90ba7d240d
SLOP tar -xf /tmp/cmake/source.tar -C /

FILE /tmp/cmake/build.slop
    set -ex
    cd /tmp/cmake/source
    CC=cc CXX=c++ CFLAGS=-O0 CXXFLAGS='-O0 -std=c++17' slop bootstrap \
      --prefix=/usr --parallel=1 --bootstrap-system-libuv \
      --system-libuv --system-curl --system-zlib --no-qt-gui --no-debugger \
      -- -DBUILD_TESTING=OFF -DBUILD_CursesDialog=OFF -DCMAKE_USE_OPENSSL=OFF \
      -DCMake_INSTALL_COMPONENTS=ON \
      -DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS_DEBUG=-O0 -DCMAKE_CXX_FLAGS_DEBUG=-O0
    make cmake
    ./bin/cmake --install . --component cmake
    ./bin/cmake --install . --component Unspecified
    cmake --version
SLOP slop -e /tmp/cmake/build.slop

EXPORTS TOOL cmake
EXPORTS FOLDER cmake-data /usr/share/cmake-4.4
FILE /usr/share/licenses/cmake/LICENSE.rst

SLOP rm -rf /tmp/cmake

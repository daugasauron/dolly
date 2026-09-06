DOLLY 3
MODULE cpp

# The frontend and genuine Emscripten libc++/libc++abi archives belong to the
# externally prepared process SDK. Install their matching headers and expose
# that same runtime to every C++ link, including explicit -lc++/-lc++abi.
REQUIRES HEADER libc
REQUIRES FOLDER process-sdk
REQUIRES TOOL   c++
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/libcxx-headers.tar /tmp/cpp/libcxx-headers.tar           bf2e001df02242dfe12574daf0eca582d89708a76f794a8983c57abc72dd72c6
SOURCE HOST /static/default/licenses/libcxx    /usr/share/licenses/libcxx/LICENSE    539dd7aed86e8a4f12cbdd0e6c50c189c7d74847e4fecc64ce2c6ee3a01da38b
SOURCE HOST /static/default/licenses/libcxxabi /usr/share/licenses/libcxxabi/LICENSE e2b35be49f7284a45b7baca8fc7b3ab7440e7902392b2528a457816b5bb2a15c

SLOP tar \
  -xf /tmp/cpp/libcxx-headers.tar \
  -C /

EXPORTS HEADER cpp    /usr/include/c++/v1
EXPORTS LIB    c++    /usr/lib/dolly/process/libc++-ww-wasmexcept.a
EXPORTS LIB    c++abi /usr/lib/dolly/process/libc++abi-ww-wasmexcept.a
EXPORTS ENV    CXX    c++

FILE /usr/share/licenses/libcxx/LICENSE
FILE /usr/share/licenses/libcxxabi/LICENSE

SLOP rm \
  -rf \
  /tmp/cpp

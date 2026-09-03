DOLLY 2
MODULE cpp

# The C++ frontend belongs to the externally supplied compiler seed. This
# module adds the pinned libc++ header surface and the small no-exception ABI
# archives that make the frontend useful. Each adapter is source-built here;
# no host-built libc++ object crosses into the image.
REQUIRES HEADER libc
REQUIRES LIB    compiler-rt
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   c++
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/libcxx-headers.tar             /tmp/cpp/libcxx-headers.tar           bf2e001df02242dfe12574daf0eca582d89708a76f794a8983c57abc72dd72c6
SOURCE HOST /static/default/runtimes/libcxx-hash-dolly.c   /tmp/cpp/libcxx-hash-dolly.c          767c644069ea4b85afb842b1b2c9530e7a189ae4047c933bdb6c6ca74dea1188
SOURCE HOST /static/default/runtimes/libcxx-misc-dolly.c   /tmp/cpp/libcxx-misc-dolly.c          fbd4e83c88e7b0bc0b561e4d7ceb8139028eea6f875d192150762dd30c16c447
SOURCE HOST /static/default/runtimes/libcxx-new-dolly.c    /tmp/cpp/libcxx-new-dolly.c           a94cd68e96d7cee68d6d15e3841c6a7b1c064678b75f20f4d37ab1950d962bc1
SOURCE HOST /static/default/runtimes/libcxx-string-dolly.c /tmp/cpp/libcxx-string-dolly.c        26b13ba0deb49fdfb90d0b56bdb51e89d2a33095c665a5418d9477ce06d39d42
SOURCE HOST /static/default/licenses/libcxx                /usr/share/licenses/libcxx/LICENSE    539dd7aed86e8a4f12cbdd0e6c50c189c7d74847e4fecc64ce2c6ee3a01da38b
SOURCE HOST /static/default/licenses/libcxxabi             /usr/share/licenses/libcxxabi/LICENSE e2b35be49f7284a45b7baca8fc7b3ab7440e7902392b2528a457816b5bb2a15c

SLOP tar \
  -xf /tmp/cpp/libcxx-headers.tar \
  -C /
SLOP cc \
  -c \
  -O2 \
  -fPIC \
  -fvisibility=hidden \
  -fno-sanitize-coverage \
  /tmp/cpp/libcxx-hash-dolly.c \
  -o /tmp/cpp/libcxx-hash-dolly.o
SLOP cc \
  -c \
  -O2 \
  -fPIC \
  -fvisibility=hidden \
  -fno-sanitize-coverage \
  /tmp/cpp/libcxx-misc-dolly.c \
  -o /tmp/cpp/libcxx-misc-dolly.o
SLOP cc \
  -c \
  -O2 \
  -fPIC \
  -fvisibility=hidden \
  -fno-sanitize-coverage \
  /tmp/cpp/libcxx-new-dolly.c \
  -o /tmp/cpp/libcxx-new-dolly.o
SLOP cc \
  -c \
  -O2 \
  -fPIC \
  -fvisibility=hidden \
  -fno-sanitize-coverage \
  /tmp/cpp/libcxx-string-dolly.c \
  -o /tmp/cpp/libcxx-string-dolly.o
SLOP ar \
  rcs \
  /usr/lib/libc++.a \
  /tmp/cpp/libcxx-hash-dolly.o \
  /tmp/cpp/libcxx-misc-dolly.o \
  /tmp/cpp/libcxx-new-dolly.o \
  /tmp/cpp/libcxx-string-dolly.o
SLOP ar \
  rcs \
  /usr/lib/libc++abi.a

EXPORTS HEADER cpp    /usr/include/c++/v1
EXPORTS LIB    c++    /usr/lib/libc++.a
EXPORTS LIB    c++abi /usr/lib/libc++abi.a
EXPORTS ENV    CXX    c++

FILE /usr/share/licenses/libcxx/LICENSE
FILE /usr/share/licenses/libcxxabi/LICENSE

SLOP rm \
  -rf \
  /tmp/cpp

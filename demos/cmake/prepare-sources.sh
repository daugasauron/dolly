# Sourced by scripts/prepare-image-sources.sh.
if has_module libuv; then
  libuv_dir="$(bash demos/cmake/prepare-libuv.sh)"
  node scripts/build-source-tar.mjs "${static_dir}/neovim/libuv.tar" \
    "${libuv_dir}/include" /tmp/libuv/source/include \
    "${libuv_dir}/src" /tmp/libuv/source/src \
    "${libuv_dir}/LICENSE" /usr/share/licenses/libuv/LICENSE \
    demos/cmake/libuv /tmp/libuv/dolly \
    demos/cmake/libuv-dolly.mk /tmp/libuv/Makefile
fi
if has_module cmake; then
  cmake_dir="$(bash scripts/fetch-pinned-source.sh cmake)"
  node scripts/build-source-tar.mjs "${static_dir}/neovim/cmake.tar.gz" \
    "${cmake_dir}" /tmp/cmake/source \
    demos/cmake/Dolly.cmake /tmp/cmake/source/Modules/Platform/Dolly.cmake \
    "${cmake_dir}/LICENSE.rst" /usr/share/licenses/cmake/LICENSE.rst
fi

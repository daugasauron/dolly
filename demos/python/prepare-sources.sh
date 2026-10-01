# Sourced by scripts/prepare-image-sources.sh.
if has_module libffi; then
  libffi_dir="$(demos/python/prepare-libffi.sh)"
  copy_static demos/python/libffi-dolly.c python/runtimes/libffi-dolly.c
  node scripts/build-source-tar.mjs "${static_dir}/python/libffi.tar" \
    "${libffi_dir}" /usr/src/libffi \
    "${libffi_dir}/include/ffi.h" /usr/include/ffi.h \
    "${libffi_dir}/include/ffitarget.h" /usr/include/ffitarget.h \
    "${libffi_dir}/LICENSE" /usr/share/licenses/libffi/LICENSE
fi
if has_module cpython; then
  cpython_dir="$(demos/python/prepare-cpython.sh)"
  for source in \
    cpython-platform.c cpython-extension-check.c \
    cpython-socket-stubs.c cpython-termios.c \
    cpython-process.c cpython-http.c cpython-subprocess.py; do
    copy_static "demos/python/${source}" "python/runtimes/${source}"
  done
  node scripts/build-source-tar.mjs "${static_dir}/python/cpython.tar.gz" \
    "${cpython_dir}/Include" /usr/src/python/Include \
    "${cpython_dir}/Parser" /usr/src/python/Parser \
    "${cpython_dir}/Objects" /usr/src/python/Objects \
    "${cpython_dir}/Python" /usr/src/python/Python \
    "${cpython_dir}/Modules" /usr/src/python/Modules \
    "${cpython_dir}/Programs" /usr/src/python/Programs \
    "${cpython_dir}/Tools/freeze" /usr/src/python/Tools/freeze \
    "${cpython_dir}/Lib" /usr/src/python/Lib \
    "${cpython_dir}/Makefile" /usr/src/python/Makefile \
    "${cpython_dir}/Makefile.pre" /usr/src/python/Makefile.pre \
    "${cpython_dir}/Makefile.pre.in" /usr/src/python/Makefile.pre.in \
    "${cpython_dir}/pyconfig.h" /usr/src/python/pyconfig.h \
    "${cpython_dir}/config.status" /usr/src/python/config.status \
    "${cpython_dir}/configure" /usr/src/python/configure \
    "${cpython_dir}/LICENSE" /usr/share/licenses/cpython/LICENSE
fi
if has_module pip; then
  copy_static demos/python/dolly_http.py python/runtimes/dolly_http.py
fi

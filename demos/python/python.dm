DOLLY 5
MODULE python

# Build the Python runtime and native extension SDK; pip is a later image step.
REQUIRES HEADER curl
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES HEADER zlib
REQUIRES LIB    curl
REQUIRES LIB    z
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   c++
REQUIRES TOOL   cp
REQUIRES TOOL   make
REQUIRES TOOL   mkdir
REQUIRES TOOL   mv
REQUIRES TOOL   rm
REQUIRES TOOL   slop
REQUIRES TOOL   tar
REQUIRES TOOL   test
REQUIRES TOOL   touch

USE https://daugasauron.com/demos/python/libffi.dm  d85a99b9c4eb1ef9d1284bf43eba3eb5a7db60e26502cdb1d851b4ee7c21fc36
USE https://daugasauron.com/demos/python/cpython.dm f0dd68031591207e2c63487a2890d021673f3b145718ba3380d4cd95bff59203

EXPORTS TOOL   python
EXPORTS TOOL   python3
EXPORTS ENV    PYTHONDONTWRITEBYTECODE
EXPORTS ENV    PYTHONUTF8
EXPORTS FOLDER python-stdlib /usr/lib/python3.14
EXPORTS HEADER python        /usr/include/python3.14
EXPORTS HEADER ffi           /usr/include/ffi.h
EXPORTS HEADER ffitarget     /usr/include/ffitarget.h
EXPORTS LIB    ffi           /usr/lib/libffi.a
EXPORTS LIB    python        /usr/lib/libpython3.14.a

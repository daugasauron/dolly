DOLLY 4
MODULE python

# Build the Python runtime and native extension SDK; Bonnie is a later image step.
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

USE HOST /modules/libffi.dm  49616c8082050bb8da272d99755ffd8faa2207516b708b885e23be81a8d572f6
USE HOST /modules/cpython.dm 485c45e00765d6a359192e3d6ffc0d1fdb843b04fbaef9db7a9a1d7d98686807

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

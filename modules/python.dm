DOLLY 3
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

USE HOST /modules/libffi.dm  28021caac7880de565fcd5825cf6f8351b5af9a05424bf68888fda27b2f4423d
USE HOST /modules/cpython.dm 49446eda7bc94818c98e13bc2b83b06ce635911c5c47328c2bf5502b06630fc9

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

DOLLY 2
MODULE python

# Python is an aggregate so changes to the package installer do not invalidate
# the expensive CPython layer. Its imported objects are visible only to these
# direct children; only the selected runtime/SDK surface is re-exported.
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

USE HOST /modules/libffi.dm  91019e57acbe055e2323a499427f2e27602a45d7fb4c26b6c02622eefb002899
USE HOST /modules/cpython.dm 3ca25660fecd08693677e95e7d1db06d749cef5e3066e19f3d320026213daa18
USE HOST /modules/bonnie.dm  c8d97a1f19b1a429f58fc33e6ae6c18384d986f23bda8b295f1ce392588b6732

EXPORTS TOOL   python
EXPORTS TOOL   python3
EXPORTS TOOL   bonnie
EXPORTS ENV    PYTHONDONTWRITEBYTECODE
EXPORTS ENV    PYTHONUTF8
EXPORTS FOLDER python-stdlib
EXPORTS HEADER python
EXPORTS HEADER ffi
EXPORTS HEADER ffitarget
EXPORTS LIB    ffi
EXPORTS LIB    python

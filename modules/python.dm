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
REQUIRES TOOL   cp
REQUIRES TOOL   make
REQUIRES TOOL   mkdir
REQUIRES TOOL   mv
REQUIRES TOOL   rm
REQUIRES TOOL   slop
REQUIRES TOOL   tar
REQUIRES TOOL   touch

USE HOST /modules/cpython.dm 845fd21e26df28ed72dbf74a15f40ccee0d16aceca31c7d21c44c25f63f20f2f
USE HOST /modules/bonnie.dm  b82c34684fcb39075de2947e8fb50183ecfb8190fe2a2c6ab6f0aeb1336a7e4d

EXPORTS TOOL   python
EXPORTS TOOL   python3
EXPORTS TOOL   bonnie
EXPORTS ENV    PYTHONDONTWRITEBYTECODE
EXPORTS FOLDER python-stdlib
EXPORTS HEADER python
EXPORTS LIB    python

DOLLY 6
MODULE python

# Build the Python runtime and native extension SDK; pip.dm adds pip.
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

USE https://daugasauron.com/demos/python/libffi.dm  7674a8a3544cda269d6a9b037b4a2f88001e7f0e3e39c9a71030f006c931f7ca
USE https://daugasauron.com/demos/python/cpython.dm a736313a57a414a83d21d7740bb18f6d546a85f987ee9111783f8f0426c0d7e3

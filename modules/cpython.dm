DOLLY 2
MODULE cpython

REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES HEADER zlib
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

# The target is configured outside the browser, but every target object and
# executable is compiled here. Dolly-owned adapters remain independent pinned
# inputs instead of being hidden inside the upstream archive.
SOURCE HOST /static/python/cpython.tar /tmp/cpython.tar dd1acc18e20ff702ff5d17499b98657a20d977b1b8483de258f5cc0469b05f06

SLOP tar \
  -xf /tmp/cpython.tar \
  -C /

SOURCE HOST /static/python/runtimes/cpython-platform.c        /usr/src/python/Python/dolly_platform.c         24229c45e38dc00dd9503b25fc9a4072cf3e8d6b75ffb8f42e073e05ed9f2694
SOURCE HOST /static/python/runtimes/cpython-main.c            /usr/src/python/Programs/dolly_main.c           0fa1fea2ec7dbce3632e3d4450f6fbf277d96e6862e68b758f7fbb09cb3d20d4
SOURCE HOST /static/python/runtimes/cpython-extension-check.c /usr/src/python/Modules/dolly_extension_check.c 1763ec04e582beee6066af81c93fe20e8cf0d83ae7d41d935b395c5cb3cdf071
SOURCE HOST /static/python/runtimes/cpython-socket-stubs.c    /usr/src/python/Modules/dolly_socket_stubs.c    67d1b1c77687335dea25c58a5b9fa29c7ecc911957392e2e5beaf0a19184cd0b
SOURCE HOST /static/python/runtimes/cpython-termios.c         /usr/src/python/Modules/dolly_termios.c         b1241a673ceb4a34327a6245954acad23a4e77ce97d6817114b303ea32cd6cd0
SOURCE HOST /static/python/runtimes/cpython-mmap.c            /usr/src/python/Modules/dolly_mmap.c            20131df490c683927b5cbfe953163f4d86965f06d8f54995ca1ca18db58b75b6
SOURCE HOST /static/python/runtimes/cpython-process.c         /usr/src/python/Modules/dolly_process.c         a40c89ac78329cdda935eb427bbccdf108e641b44cf2830d8a2db1ca6e26be0e
SOURCE HOST /static/python/runtimes/cpython-subprocess.py     /usr/src/python/Lib/_dolly_subprocess.py        967b3f764b62c9a2273351d1566514d1d796bc0f4c2ed02c710de2ab0d1ab259

SLOP CWD /usr/src/python touch \
  Python/frozen_modules/*.h

# The embedded LLVM optimizer spends minutes on a small measured set of
# translation units. Compile only those outliers at -O0 and let upstream Make
# preserve the prepared objects; the rest of CPython is substantially faster
# at -O2.
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c11 \
  -fno-builtin \
  -fno-strict-aliasing \
  -DDOLLY \
  -IInclude/internal \
  -IInclude/internal/mimalloc \
  -IObjects \
  -IInclude \
  -IPython \
  -I. \
  -DPy_BUILD_CORE \
  Python/tracemalloc.c \
  -o Python/tracemalloc.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c11 \
  -fno-builtin \
  -fno-strict-aliasing \
  -DDOLLY \
  -IInclude/internal \
  -IInclude/internal/mimalloc \
  -IObjects \
  -IInclude \
  -IPython \
  -I. \
  -DPy_BUILD_CORE \
  Modules/arraymodule.c \
  -o Modules/arraymodule.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c11 \
  -IInclude/internal \
  -IInclude/internal/mimalloc \
  -IObjects \
  -IInclude \
  -IPython \
  -I. \
  -DPy_BUILD_CORE \
  Python/dolly_platform.c \
  -o Python/dolly_platform.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c11 \
  -IInclude/internal \
  -IInclude/internal/mimalloc \
  -IObjects \
  -IInclude \
  -IPython \
  -I. \
  -DPy_BUILD_CORE \
  -DDATE='"Jan 01 1970"' \
  -DTIME='"00:00:00"' \
  Modules/getbuildinfo.c \
  -o Modules/getbuildinfo.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c11 \
  -IInclude/internal \
  -IInclude/internal/mimalloc \
  -IObjects \
  -IInclude \
  -IPython \
  -I. \
  -DPy_BUILD_CORE \
  -DPLATFORM='"dolly"' \
  Python/getplatform.c \
  -o Python/getplatform.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c11 \
  -IInclude/internal \
  -IInclude/internal/mimalloc \
  -IObjects \
  -IInclude \
  -IPython \
  -I. \
  -DPy_BUILD_CORE \
  -DDOLLY \
  -DABIFLAGS='""' \
  -DMULTIARCH='"dolly_0_wasm64"' \
  Python/sysmodule.c \
  -o Python/sysmodule.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c11 \
  -IInclude/internal \
  -IInclude/internal/mimalloc \
  -IObjects \
  -IInclude \
  -IPython \
  -I. \
  -DPy_BUILD_CORE \
  Programs/dolly_main.c \
  -o Programs/python.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c17 \
  Modules/dolly_socket_stubs.c \
  -o Modules/dolly_socket_stubs.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c17 \
  Modules/dolly_termios.c \
  -o Modules/dolly_termios.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c17 \
  Modules/dolly_mmap.c \
  -o Modules/dolly_mmap.o

SLOP CWD /usr/src/python make \
  -o configure \
  -o config.status \
  -o Makefile.pre \
  -o Makefile \
  -o Modules/config.c \
  -o Modules/getbuildinfo.o \
  -o Python/getplatform.o \
  -o Python/sysmodule.o \
  -o Python/tracemalloc.o \
  -o Modules/arraymodule.o \
  -o Programs/python.o \
  python \
  libpython3.14.so \
  SHELL=/bin/slop \
  CC=cc \
  LINKCC=cc \
  AR=ar \
  BLDSHARED=cc\ -shared \
  INSTSONAME=libpython3.14.so \
  DYNLOADFILE=dynload_shlib.o \
  PY_CFLAGS=-O2\ -std=c11\ -fno-builtin\ -fno-strict-aliasing\ -DDOLLY \
  PY_CFLAGS_NODIST= \
  PY_CPPFLAGS=-IInclude/internal\ -IInclude/internal/mimalloc\ -IObjects\ -IInclude\ -IPython\ -I. \
  CFLAGSFORSHARED= \
  PY_CORE_LDFLAGS= \
  LDFLAGS= \
  LINKFORSHARED= \
  MODULE_MATH_LDFLAGS= \
  MODULE_CMATH_LDFLAGS= \
  MODULE__STATISTICS_LDFLAGS= \
  MODULE__DATETIME_LDFLAGS= \
  MODULE_PYEXPAT_LDFLAGS=Modules/expat/libexpat.a \
  MODULE_POSIX_CFLAGS=-DDOLLY \
  MODULE__SOCKET_CFLAGS=-Daccept=dolly_py_accept\ -Daccept4=dolly_py_accept4\ -Dbind=dolly_py_bind\ -Dfreeaddrinfo=dolly_py_freeaddrinfo\ -Dgai_strerror=dolly_py_gai_strerror\ -Dgetaddrinfo=dolly_py_getaddrinfo\ -Dgethostbyaddr=dolly_py_gethostbyaddr\ -Dgethostname=dolly_py_gethostname\ -Dgetnameinfo=dolly_py_getnameinfo\ -Dgetpeername=dolly_py_getpeername\ -Dgetprotobyname=dolly_py_getprotobyname\ -Dgetservbyport=dolly_py_getservbyport\ -Dgetsockname=dolly_py_getsockname\ -Dgetsockopt=dolly_py_getsockopt\ -Dhtonl=dolly_py_htonl\ -Dif_freenameindex=dolly_py_if_freenameindex\ -Dif_indextoname=dolly_py_if_indextoname\ -Dif_nameindex=dolly_py_if_nameindex\ -Dif_nametoindex=dolly_py_if_nametoindex\ -Dinet_aton=dolly_py_inet_aton\ -Dinet_ntop=dolly_py_inet_ntop\ -Dinet_pton=dolly_py_inet_pton\ -Dlisten=dolly_py_listen\ -Dntohl=dolly_py_ntohl\ -Dpoll=dolly_py_poll\ -Drecvfrom=dolly_py_recvfrom\ -Drecvmsg=dolly_py_recvmsg\ -Dsend=dolly_py_send\ -Dsendmsg=dolly_py_sendmsg\ -Dsendto=dolly_py_sendto \
  MODULE_TERMIOS_CFLAGS=-Dcfgetispeed=dolly_py_cfgetispeed\ -Dcfgetospeed=dolly_py_cfgetospeed\ -Dcfsetispeed=dolly_py_cfsetispeed\ -Dcfsetospeed=dolly_py_cfsetospeed\ -Dioctl=dolly_py_ioctl\ -Dtcdrain=dolly_py_tcdrain\ -Dtcflow=dolly_py_tcflow\ -Dtcflush=dolly_py_tcflush\ -Dtcgetattr=dolly_py_tcgetattr\ -Dtcsetattr=dolly_py_tcsetattr\ -Dtcsendbreak=dolly_py_tcsendbreak \
  MODULE_MMAP_CFLAGS=-Dmsync=dolly_py_msync\ -Dmadvise=dolly_py_madvise\ -Dmremap=dolly_py_mremap \
  MODULE_BINASCII_CFLAGS=-DUSE_ZLIB_CRC32 \
  MODULE_BINASCII_LDFLAGS=-lz \
  MODULE_ZLIB_CFLAGS= \
  MODULE_ZLIB_LDFLAGS=-lz \
  LIBS= \
  SYSLIBS= \
  LIBM= \
  LIBC= \
  SHLIBS= \
  MACHDEP_OBJS=Python/dolly_platform.o\ Modules/dolly_socket_stubs.o\ Modules/dolly_termios.o\ Modules/dolly_mmap.o \
  DTRACE=

SLOP mv \
  /usr/src/python/Lib \
  /usr/lib/python3.14
SLOP cp \
  /usr/src/python/libpython3.14.so \
  /usr/lib/libpython3.14.so
SLOP CWD /usr/src/python cc \
  Programs/python.o \
  -L/usr/lib \
  -lpython3.14 \
  -o /usr/bin/python
SLOP cp \
  /usr/bin/python \
  /usr/bin/python3
SLOP mkdir \
  -p \
  /usr/include/python3.14
SLOP cp \
  -R \
  /usr/src/python/Include/. \
  /usr/include/python3.14
SLOP cp \
  /usr/src/python/pyconfig.h \
  /usr/include/python3.14/pyconfig.h
SLOP CWD /usr/src/python slop \
  -c \
  'export _PYTHON_PROJECT_BASE=/usr/src/python; python -m sysconfig --generate-posix-vars'
SLOP cp \
  /usr/src/python/build/lib.dolly_0-wasm64-3.14/_sysconfigdata__dolly_dolly_0_wasm64.py \
  /usr/lib/python3.14/_sysconfigdata__dolly_dolly_0_wasm64.py
SLOP mkdir \
  -p \
  /usr/lib/python3.14/config-3.14-dolly_0_wasm64
SLOP cp \
  /usr/src/python/Makefile \
  /usr/lib/python3.14/config-3.14-dolly_0_wasm64/Makefile
SLOP cc \
  -shared \
  -O0 \
  -std=c17 \
  -I/usr/include/python3.14 \
  /usr/src/python/Modules/dolly_extension_check.c \
  -L/usr/lib \
  -lpython3.14 \
  -o /usr/lib/python3.14/dolly_extension_check.cpython-314-dolly_0_wasm64.so

EXPORTS TOOL   python
EXPORTS TOOL   python3
EXPORTS ENV    PYTHONDONTWRITEBYTECODE 1
EXPORTS LIB    python                  /usr/lib/libpython3.14.so
EXPORTS HEADER python                  /usr/include/python3.14

SLOP python \
  --version
SLOP python \
  -c 'import pathlib; p = pathlib.Path("/tmp/python-check.txt"); p.write_text("PYTHON-WASM64"); assert p.read_text() == "PYTHON-WASM64"'
SLOP python \
  -c 'import dolly_extension_check; assert dolly_extension_check.answer() == 42'
SLOP python \
  -c 'import mmap, pathlib; p = pathlib.Path("/tmp/mmap-check"); p.write_bytes(b"DOLLY"); f = p.open("rb"); m = mmap.mmap(f.fileno(), 5, access=mmap.ACCESS_READ); assert m[:] == b"DOLLY"; m.madvise(mmap.MADV_SEQUENTIAL); m.close(); f.close()'
SLOP python \
  -c 'import sysconfig; assert sysconfig.get_platform() == "dolly_0-wasm64"; assert sysconfig.get_config_var("EXT_SUFFIX") == ".cpython-314-dolly_0_wasm64.so"'
SLOP python \
  -c 'import subprocess; assert subprocess.check_output(["echo", "spawn-ok"], text=True).strip() == "spawn-ok"; assert subprocess.check_output(["python", "-c", "print(6 * 7)"], text=True).strip() == "42"'
SLOP python \
  -c 'import threading; seen = []; worker = threading.Thread(target=seen.append, args=(42,)); worker.start(); worker.join(); assert seen == [42] and not worker.is_alive()'
SLOP python \
  -c 'import os, termios, tty; before = termios.tcgetattr(0); assert len(termios.tcgetwinsize(0)) == 2; tty.setraw(0); after = termios.tcgetattr(0); assert after[3] & termios.ICANON == 0; termios.tcsetattr(0, termios.TCSANOW, before); assert os.isatty(0)'

FILE /usr/share/licenses/cpython/LICENSE
EXPORTS FOLDER python-stdlib /usr/lib/python3.14

SLOP rm \
  -rf \
  /tmp/cpython.tar \
  /tmp/mmap-check \
  /tmp/python \
  /tmp/python-check.txt \
  /usr/src/python

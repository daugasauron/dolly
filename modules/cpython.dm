DOLLY 2
MODULE cpython

REQUIRES HEADER libc
REQUIRES HEADER ffi
REQUIRES HEADER ffitarget
REQUIRES HEADER runtime
REQUIRES HEADER zlib
REQUIRES LIB    ffi
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

# The target is configured outside the browser, but every target object and
# executable is compiled here. Dolly-owned adapters remain independent pinned
# inputs instead of being hidden inside the upstream archive.
SOURCE HOST /static/python/cpython.tar /tmp/cpython.tar 6a656653b536a6f0fdd01f869045907de6b255fc712c311e9eb59867a0bbe4cc

SLOP tar \
  -xf /tmp/cpython.tar \
  -C /

SOURCE HOST /static/python/runtimes/cpython-platform.c        /usr/src/python/Python/dolly_platform.c         9a58412f3ecfebfef6bbd67dfc5fa43959314568b6add06c7c0d548ddc7eb5b6
SOURCE HOST /static/python/runtimes/cpython-extension-check.c /usr/src/python/Modules/dolly_extension_check.c 1763ec04e582beee6066af81c93fe20e8cf0d83ae7d41d935b395c5cb3cdf071
SOURCE HOST /static/python/runtimes/cpython-socket-stubs.c    /usr/src/python/Modules/dolly_socket_stubs.c    d54e0a1d299c128d483e7edc9dc089693e8ca53a7de54509e687a87a6368a4ce
SOURCE HOST /static/python/runtimes/cpython-termios.c         /usr/src/python/Modules/dolly_termios.c         b1241a673ceb4a34327a6245954acad23a4e77ce97d6817114b303ea32cd6cd0
SOURCE HOST /static/python/runtimes/cpython-process.c         /usr/src/python/Modules/dolly_process.c         7062b5536d7302c9197dbbddeeb6657aa8f05603c819f1ab4cfa8a43ef3ef618
SOURCE HOST /static/python/runtimes/cpython-subprocess.py     /usr/src/python/Lib/_dolly_subprocess.py        0a21de4e55971b8dfd393f43a61e011425c733c61d143c7ae4a02f02dcbeeee7

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
  -std=c17 \
  Modules/dolly_socket_stubs.c \
  -o Modules/dolly_socket_stubs.o
SLOP CWD /usr/src/python cc \
  -c \
  -O0 \
  -std=c17 \
  Modules/dolly_termios.c \
  -o Modules/dolly_termios.o
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
  python \
  libpython3.14.a \
  SHELL=/bin/slop \
  CC=cc \
  LINKCC=cc \
  AR=ar \
  BLDSHARED=cc\ -shared \
  INSTSONAME=libpython3.14.a \
  DYNLOADFILE=dynload_shlib.o \
  PY_CFLAGS=-O2\ -std=c11\ -fno-builtin\ -fno-strict-aliasing\ -DDOLLY \
  PY_CFLAGS_NODIST= \
  PY_CPPFLAGS=-IInclude/internal\ -IInclude/internal/mimalloc\ -IObjects\ -IInclude\ -IPython\ -I. \
  CFLAGSFORSHARED= \
  PY_CORE_LDFLAGS= \
  LDFLAGS= \
  LINKFORSHARED=-rdynamic \
  MODULE_MATH_LDFLAGS= \
  MODULE_CMATH_LDFLAGS= \
  MODULE__STATISTICS_LDFLAGS= \
  MODULE__DATETIME_LDFLAGS= \
  MODULE_PYEXPAT_LDFLAGS=Modules/expat/libexpat.a \
  MODULE_POSIX_CFLAGS=-DDOLLY \
  MODULE__SOCKET_CFLAGS=-Daccept=dolly_py_accept\ -Daccept4=dolly_py_accept4\ -Dbind=dolly_py_bind\ -Dfreeaddrinfo=dolly_py_freeaddrinfo\ -Dgai_strerror=dolly_py_gai_strerror\ -Dgetaddrinfo=dolly_py_getaddrinfo\ -Dgethostbyaddr=dolly_py_gethostbyaddr\ -Dgethostname=dolly_py_gethostname\ -Dgetnameinfo=dolly_py_getnameinfo\ -Dgetpeername=dolly_py_getpeername\ -Dgetprotobyname=dolly_py_getprotobyname\ -Dgetservbyport=dolly_py_getservbyport\ -Dgetsockname=dolly_py_getsockname\ -Dgetsockopt=dolly_py_getsockopt\ -Dhtonl=dolly_py_htonl\ -Dif_freenameindex=dolly_py_if_freenameindex\ -Dif_indextoname=dolly_py_if_indextoname\ -Dif_nameindex=dolly_py_if_nameindex\ -Dif_nametoindex=dolly_py_if_nametoindex\ -Dinet_aton=dolly_py_inet_aton\ -Dinet_ntop=dolly_py_inet_ntop\ -Dinet_pton=dolly_py_inet_pton\ -Dlisten=dolly_py_listen\ -Dntohl=dolly_py_ntohl\ -Dpoll=dolly_py_poll\ -Drecvfrom=dolly_py_recvfrom\ -Drecvmsg=dolly_py_recvmsg\ -Dsend=dolly_py_send\ -Dsendmsg=dolly_py_sendmsg\ -Dsendto=dolly_py_sendto \
  MODULE_TERMIOS_CFLAGS=-Dcfgetispeed=dolly_py_cfgetispeed\ -Dcfgetospeed=dolly_py_cfgetospeed\ -Dcfsetispeed=dolly_py_cfsetispeed\ -Dcfsetospeed=dolly_py_cfsetospeed\ -Dioctl=dolly_py_ioctl\ -Dtcdrain=dolly_py_tcdrain\ -Dtcflow=dolly_py_tcflow\ -Dtcflush=dolly_py_tcflush\ -Dtcgetattr=dolly_py_tcgetattr\ -Dtcsetattr=dolly_py_tcsetattr\ -Dtcsendbreak=dolly_py_tcsendbreak \
  MODULE_BINASCII_CFLAGS=-DUSE_ZLIB_CRC32 \
  MODULE_BINASCII_LDFLAGS=-lz \
  MODULE_ZLIB_CFLAGS= \
  MODULE_ZLIB_LDFLAGS=-lz \
  MODULE__CTYPES_CFLAGS=-DHAVE_FFI_PREP_CIF_VAR\ -DHAVE_FFI_PREP_CLOSURE_LOC\ -DHAVE_FFI_CLOSURE_ALLOC \
  MODULE__CTYPES_LDFLAGS=-lffi \
  LIBS= \
  SYSLIBS= \
  LIBM= \
  LIBC= \
  SHLIBS= \
  MACHDEP_OBJS=Python/dolly_platform.o\ Modules/dolly_socket_stubs.o\ Modules/dolly_termios.o \
  DTRACE=

# Install the standard-library contents into their final prefix.  Treat the
# destination as an installation directory explicitly: it may already exist
# in a composed image, and `mv SOURCE DESTINATION` would then create a nested
# `Lib` directory instead of the sys.path layout CPython requires.
SLOP mkdir \
  -p \
  /usr/lib/python3.14 \
  /usr/lib/python3.14/lib-dynload
SLOP cp \
  -R \
  /usr/src/python/Lib/. \
  /usr/lib/python3.14
SLOP test \
  -f \
  /usr/lib/python3.14/encodings/__init__.py
SLOP cp \
  /usr/src/python/libpython3.14.a \
  /usr/lib/libpython3.14.a
SLOP mv \
  /usr/src/python/python \
  /usr/bin/python
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
  -o /usr/lib/python3.14/lib-dynload/dolly_extension_check.cpython-314-dolly_0_wasm64.so

EXPORTS TOOL   python
EXPORTS TOOL   python3
EXPORTS ENV    PYTHONDONTWRITEBYTECODE 1
EXPORTS ENV    PYTHONUTF8              1
EXPORTS LIB    python                  /usr/lib/libpython3.14.a
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
  -c 'import os, subprocess; assert subprocess.check_output(["echo", "spawn-ok"], text=True).strip() == "spawn-ok"; assert subprocess.check_output(["python", "-c", "print(6 * 7)"], text=True).strip() == "42"; child_env = dict(os.environ, DOLLY_CHILD_ENV="explicit"); assert subprocess.check_output(["python", "-c", "import os; print(os.environ[\"DOLLY_CHILD_ENV\"])"] , env=child_env, text=True, timeout=1).strip() == "explicit"'
SLOP python \
  -c 'import threading; seen = []; worker = threading.Thread(target=seen.append, args=(42,)); worker.start(); worker.join(); assert seen == [42] and not worker.is_alive()'
SLOP python \
  -c 'import hashlib; assert hashlib.md5(b"abc", usedforsecurity=False).hexdigest() == "900150983cd24fb0d6963f7d28e17f72"'
SLOP python \
  -c 'import ctypes; libc = ctypes.CDLL(None); libc.strlen.argtypes = [ctypes.c_char_p]; libc.strlen.restype = ctypes.c_size_t; assert libc.strlen(b"dolly") == 5; callback_type = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_int); callback = callback_type(lambda value: value + 1); assert callback(41) == 42'
SLOP python \
  -c 'import locale, sys; assert sys.flags.utf8_mode == 1; assert locale.getpreferredencoding(False).lower() == "utf-8"; assert sys.getfilesystemencoding().lower() == "utf-8"'
SLOP python \
  -c 'from pathlib import Path; p = Path("/tmp/python-header-check/check.cpp"); p.parent.mkdir(); p.write_text("#include <Python.h>\nint python_header_check = 42;\n", encoding="utf-8")'
SLOP c++ \
  -c \
  -std=c++17 \
  -I/usr/include/python3.14 \
  /tmp/python-header-check/check.cpp \
  -o /tmp/python-header-check/check.o
SLOP python \
  -c 'import os, termios, tty; before = termios.tcgetattr(0); assert len(termios.tcgetwinsize(0)) == 2; tty.setraw(0); after = termios.tcgetattr(0); assert after[3] & termios.ICANON == 0; termios.tcsetattr(0, termios.TCSANOW, before); assert os.isatty(0)'

FILE /usr/share/licenses/cpython/LICENSE
EXPORTS FOLDER python-stdlib /usr/lib/python3.14

SLOP rm \
  -rf \
  /tmp/cpython.tar \
  /tmp/mmap-check \
  /tmp/python \
  /tmp/python-header-check \
  /tmp/python-check.txt \
  /usr/src/python

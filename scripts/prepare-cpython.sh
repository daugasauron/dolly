#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "${project_dir}/config/source-pins.sh"
source_dir="$("${project_dir}/scripts/fetch-cpython.sh")"
output_dir="${project_dir}/build/generated/cpython-source"
stamp="${output_dir}/.dolly-cpython-source"
configuration="${DOLLY_CPYTHON_COMMIT}:dolly-0-wasm64-process-mmap-v31"

if [[ -f "${stamp}" ]] &&
   [[ "$(<"${stamp}")" == "${configuration}" ]] &&
   [[ -f "${output_dir}/Makefile" ]] &&
   [[ -f "${output_dir}/Python/frozen_modules/importlib._bootstrap.h" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi

temporary="$(mktemp -d "${project_dir}/build/generated/cpython-source.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT
git -C "${source_dir}" archive --format=tar "${DOLLY_CPYTHON_COMMIT}" |
  tar -xf - -C "${temporary}"
cp -- "${project_dir}/config/cpython-Setup.local" \
  "${temporary}/Modules/Setup.local"
cp -- "${project_dir}/src/runtimes/cpython-process.c" \
  "${temporary}/Modules/dolly_process.c"
patch --batch --fuzz=0 -d "${temporary}" -p1 \
  < "${project_dir}/config/cpython-dolly.patch" >/dev/null

build_python="$(command -v python3.14 || true)"
if [[ -z "${build_python}" ]] ||
   [[ "$("${build_python}" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')" != "3.14" ]]; then
  echo "dolly: CPython target preparation requires a host Python 3.14" >&2
  exit 1
fi
build_python_root="$(cd -- "$(dirname -- "${build_python}")/.." && pwd)"

if command -v podman >/dev/null 2>&1; then
  container=(podman run --rm --userns=keep-id
    -v "${project_dir}:/src"
    -v "${build_python_root}:${build_python_root}:ro"
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache"
    -w "/src/${temporary#"${project_dir}/"}"
    "${DOLLY_EMSDK_IMAGE}")
elif command -v docker >/dev/null 2>&1; then
  container=(docker run --rm -u "$(id -u):$(id -g)"
    -v "${project_dir}:/src"
    -v "${build_python_root}:${build_python_root}:ro"
    -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache"
    -w "/src/${temporary#"${project_dir}/"}"
    "${DOLLY_EMSDK_IMAGE}")
else
  echo "dolly: podman or docker is required to configure CPython" >&2
  exit 1
fi

"${container[@]}" /usr/bin/env \
  CONFIG_SITE=Platforms/emscripten/config.site-wasm32-emscripten \
  HOSTRUNNER=/emsdk/node/24.19.0_64bit/bin/node \
  ac_cv_func_getpgrp=no ac_cv_func_getlogin_r=no ac_cv_func_killpg=no \
  ac_cv_func_setuid=no ac_cv_func_setreuid=no ac_cv_func_setgid=no \
  ac_cv_func_setregid=no ac_cv_func_setpgrp=no ac_cv_func_wait3=no \
  ac_cv_func_wait4=no ac_cv_func_waitid=no ac_cv_func_getsid=no \
  ac_cv_func_setpgid=no ac_cv_func_tcsetpgrp=no ac_cv_func_dup3=no \
  ac_cv_func_lockf=no ac_cv_func_truncate=no \
  ac_cv_func_ttyname_r=no ac_cv_func_fchownat=no ac_cv_func_chown=no \
  ac_cv_func_chroot=no ac_cv_func_ctermid=no ac_cv_func_fdopendir=no \
  ac_cv_func_rewinddir=no ac_cv_func_getpriority=no ac_cv_func_times=no \
  ac_cv_func_execv=no ac_cv_func_fexecve=no ac_cv_func_posix_openpt=no \
  ac_cv_func_grantpt=no ac_cv_func_unlockpt=no ac_cv_func_ptsname_r=no \
  ac_cv_func_login_tty=no ac_cv_func_getgid=no ac_cv_func_getegid=no \
  ac_cv_func_setrlimit=no ac_cv_func_pthread_sigmask=no \
  ac_cv_func_ptsname=no \
  /emsdk/upstream/emscripten/emconfigure ./configure \
    --host=wasm64-unknown-emscripten \
    --build=x86_64-pc-linux-gnu \
    --with-build-python="${build_python}" \
    --without-pymalloc \
    --without-mimalloc \
    --disable-shared \
    --disable-ipv6 \
    --disable-test-modules \
    --with-ensurepip=no \
    --with-suffix= \
    --prefix=/usr \
    CFLAGS="-m64 -O2" \
    LDFLAGS="-m64" >/dev/null

# Release tarballs do not carry frozen bytecode headers. CPython's own pinned
# freezer and the matching 3.14 build interpreter generate them here; the
# interpreter and every target object are still compiled later inside Dolly.
"${container[@]}" bash -lc \
  'make -n python | grep "/Programs/_freeze_module.py" | while IFS= read -r command; do eval "$command"; done'

# Modules/makesetup is a POSIX shell generator, not a target executable. Run
# the pinned upstream generator while preparing the source bundle; the emitted
# config.c is still compiled by Dolly with every other target object.
(
  cd -- "${temporary}"
  ./Modules/makesetup -c ./Modules/config.c.in \
    -s Modules \
    Modules/Setup.local \
    Modules/Setup.stdlib \
    Modules/Setup.bootstrap \
    ./Modules/Setup
)

# CPython's Emscripten objects reach directly into JavaScript for async I/O,
# Node identity, and signal delivery, and embed an optional wasm32 GC
# trampoline. Dolly exposes none of those ambient capabilities. Its target
# shim below the Python runtime supplies the signal bookkeeping; ordinary libc
# and Dolly lifecycle operations supply the rest.
sed -i \
  -e 's|^CC=.*|CC=\t\tcc|' \
  -e 's|^CXX=.*|CXX=\t\tc++|' \
  -e 's|^LINKCC=.*|LINKCC=\t\t$(CC)|' \
  -e 's|^AR=.*|AR=\t\tar|' \
  -e 's/ Python\/emscripten_signal\.o//' \
  -e 's/ Python\/emscripten_trampoline_wasm\.o//' \
  -e 's/ Python\/emscripten_syscalls\.o//' \
  "${temporary}/Makefile"

# Emscripten's configure script declares login_tty even though Dolly exposes
# no native PTY/session layer and its cache check cannot override that result.
sed -i 's/^#define HAVE_LOGIN_TTY 1$/\/\* #undef HAVE_LOGIN_TTY \*\//' \
  "${temporary}/pyconfig.h"

# A non-threaded Emscripten libc still advertises pthread.h and supplies its
# own compatibility symbols. Dolly deliberately uses CPython's smaller,
# explicit single-thread implementation instead: pthread_create() returns
# EAGAIN while locks and thread-local storage remain useful in one runtime.
sed -i \
  -e 's/^#define HAVE_PAUSE 1$/\/\* #undef HAVE_PAUSE \*\//' \
  -e 's/^#define HAVE_PTHREAD_H 1$/\/\* #undef HAVE_PTHREAD_H \*\//' \
  -e 's/^\/\* #undef HAVE_PTHREAD_STUBS \*\//#define HAVE_PTHREAD_STUBS 1/' \
  -e 's/^#define HAVE_PTHREAD_GETATTR_NP 1$/\/\* #undef HAVE_PTHREAD_GETATTR_NP \*\//' \
  -e 's/^#define HAVE_PTHREAD_GETCPUCLOCKID 1$/\/\* #undef HAVE_PTHREAD_GETCPUCLOCKID \*\//' \
  -e 's/^#define HAVE_PTHREAD_KILL 1$/\/\* #undef HAVE_PTHREAD_KILL \*\//' \
  "${temporary}/pyconfig.h"

# CPython's stock Emscripten site file still names the wasm32/Pyodide-style
# extension ABI. Dolly is a distinct wasm64 dynamic-linking target. Keep this
# name deliberately versioned: changing the machine contract must make old
# extension wheels visibly incompatible rather than failing during dlopen.
sed -i \
  -e 's/^MACHDEP=.*/MACHDEP=\tdolly/' \
  -e 's/^SOABI=.*/SOABI=\t\tcpython-314-dolly_0_wasm64/' \
  -e 's/^MULTIARCH=.*/MULTIARCH=\tdolly_0_wasm64/' \
  -e 's/^MULTIARCH_CPPFLAGS =.*/MULTIARCH_CPPFLAGS = -DMULTIARCH=\\"dolly_0_wasm64\\"/' \
  -e 's/^EXT_SUFFIX=.*/EXT_SUFFIX=\t.cpython-314-dolly_0_wasm64.so/' \
  -e 's|^LDSHARED=.*|LDSHARED=\tcc -shared $(PY_LDFLAGS) -L/usr/lib -lpython3.14|' \
  -e 's|^BLDSHARED=.*|BLDSHARED=\tcc -shared $(PY_CORE_LDFLAGS)|' \
  -e 's/^_PYTHON_HOST_PLATFORM=.*/_PYTHON_HOST_PLATFORM=dolly_0-wasm64/' \
  -e 's|^LIBPL=.*|LIBPL=\t\t$(prefix)/lib/python3.14/config-3.14-dolly_0_wasm64|' \
  "${temporary}/Makefile"

# CPython's stub type declarations already defer to libc on WASI. Emscripten's
# musl-derived alltypes.h has the same __NEED_* mechanism, so use that path
# instead of redeclaring types that sys/types.h may have exposed first.
sed -i \
  's/^#ifdef __wasi__$/#if defined(__wasi__) || defined(__EMSCRIPTEN__)/' \
  "${temporary}/Include/cpython/pthread_stubs.h"

# Dolly's initial process substrate is deliberately single-threaded. A shared
# memory Emscripten side module still lowers C thread-local variables to Wasm
# TLS, whose relocation setup is only supplied by Emscripten's pthread runtime.
# Make CPython's two fast-path thread-local pointers ordinary module globals;
# command execution is serialized, so they retain the required semantics.
sed -i \
  -e '/#    define HAVE_THREAD_LOCAL 1/a\#    ifdef DOLLY\n#      define _Py_thread_local' \
  -e 's/^#    ifdef thread_local$/#    elif defined(thread_local)/' \
  "${temporary}/Include/pyport.h"

# sys._emscripten_info asks JavaScript for a browser user-agent or Node version.
# Dolly has no ambient JavaScript capability, so retain Emscripten target
# semantics while omitting only those embedding-specific blocks.
sed -i \
  's/^#ifdef __EMSCRIPTEN__$/#if defined(__EMSCRIPTEN__) \&\& !defined(DOLLY)/' \
  "${temporary}/Python/sysmodule.c"

# Keep CPython's Emscripten-only method names for target compatibility. The
# patch above implements logging on Dolly stderr and makes the browser debugger
# fail explicitly, without an EM_JS import or DOM/console capability. It also
# carries the small set of standard-library safety decisions that Dolly needs
# after reporting its honest `sys.platform == "dolly"` identity.

printf '%s\n' "${configuration}" > "${temporary}/.dolly-cpython-source"
rm -rf -- "${output_dir}"
mv -- "${temporary}" "${output_dir}"
trap - EXIT
printf '%s\n' "${output_dir}"

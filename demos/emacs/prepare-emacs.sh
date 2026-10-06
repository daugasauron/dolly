#!/usr/bin/env bash
# Patches and configures the pinned GNU Emacs release for Dolly. Configure runs
# in the pinned Emscripten container, whose libc headers Dolly's compiler uses;
# Dolly compiles every object. Prints the configured tree.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" emacs)"
recipe_hash="$({
  printf '%s\n' "emsdk=${DOLLY_EMSDK_IMAGE}"
  cd "${project_dir}" && sha256sum demos/emacs/prepare-emacs.sh demos/emacs/emacs-dolly.patch
} | sha256sum | cut -c1-16)"
output="${project_dir}/build/generated/emacs-${DOLLY_EMACS_SHA256:0:16}-${recipe_hash}"
if [[ -d "${output}" ]]; then
  printf '%s\n' "${output}"
  exit 0
fi

mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.emacs.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT
tree="${temporary}/tree"
mkdir -p "${tree}" "${temporary}/bin"
tar -xzf "${archive}" --strip-components=1 -C "${tree}"
patch --silent --fuzz=0 --no-backup-if-mismatch -d "${tree}" -p1 \
  < "${project_dir}/demos/emacs/emacs-dolly.patch"

# Configure records the command names Dolly runs: cc, ar, mkdir, awk.
printf '#!/bin/sh\nexec emcc -m64 "$@"\n' > "${temporary}/bin/cc"
chmod +x "${temporary}/bin/cc"
if command -v podman >/dev/null 2>&1; then
  container=(podman run --rm --userns=keep-id)
elif command -v docker >/dev/null 2>&1; then
  container=(docker run --rm -u "$(id -u):$(id -g)")
else
  echo "dolly: podman or docker is required to configure Emacs" >&2
  exit 1
fi
container+=(-v "${tree}:/tmp/emacs" -v "${temporary}/bin:/dolly-bin:ro"
  -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache"
  -w /tmp/emacs "${DOLLY_EMSDK_IMAGE}" /usr/bin/env
  PATH="/dolly-bin:/emsdk:/emsdk/upstream/emscripten:/emsdk/node/24.19.0_64bit/bin:/usr/bin:/bin")
# The tree is configured where Dolly builds it, /tmp/emacs. Where Emscripten's
# JavaScript runtime and Dolly differ, or a cross-compile guess is wrong for
# Dolly, the result is stated: the runtime provides getrandom but neither
# sysinfo nor malloc_trim's declaration; its fchmodat honours
# AT_SYMLINK_NOFOLLOW (gnulib's glibc workaround needs O_PATH, which Dolly
# lacks); without the threads host module there are no POSIX threads; its
# terminal has no FIONREAD; Emacs's own termcap.o provides tputs (see the
# patch). Dolly's compiler has no -MP.
# -O0 keeps C locals in linear memory, where Emacs's conservative collector
# scans the stack: Wasm locals are invisible to it, and an -O2 temacs crashes
# collecting garbage during loadup.
"${container[@]}" CONFIG_SHELL=/bin/sh \
  ac_cv_func_getrandom=yes ac_cv_func_malloc_trim=no emacs_cv_linux_sysinfo=no \
  gl_cv_func_fchmodat_works=yes emacs_cv_pthread_lib=no emacs_cv_usable_FIONREAD=no \
  emacs_cv_tputs_lib='none required' \
  /bin/sh ./configure \
    --host=wasm64-unknown-emscripten --build=x86_64-pc-linux-gnu --prefix=/usr \
    --disable-autodepend --without-all --without-x --without-ns \
    --with-dumping=pdumper --without-native-compilation --without-modules \
    --without-threads --without-compress-install --without-pop \
    --without-libsystemd --without-dbus --without-selinux --without-gpm \
    --with-sound=no --without-file-notification --disable-acl \
    CC=cc AR=ar RANLIB=: MKDIR_P='mkdir -p' INSTALL='install -c' \
    AWK=awk GREP=grep EGREP='grep -E' SED=sed CFLAGS='-O0' >/dev/null
# Make re-executes itself after remaking an included makefile; Dolly has no
# exec, so the fragment src/Makefile includes is generated here.
"${container[@]}" make -s -C src /tmp/emacs/src/lisp.mk >/dev/null
rm -f "${tree}/config.log" "${tree}/configure.lineno" "${tree}/a.wasm"

mv -T -- "${tree}" "${output}"
printf '%s\n' "${output}"

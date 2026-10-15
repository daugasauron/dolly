#!/usr/bin/env bash
# Patches and configures the pinned zsh release for Dolly, as Emacs is
# (demos/emacs/prepare-emacs.sh): configure and zsh's generated sources come
# from the pinned Emscripten container, whose libc headers Dolly's compiler
# uses; Dolly compiles every object (Dollyfile-zsh). Prints the tree.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" zsh)"
recipe_hash="$({
  printf '%s\n' "emsdk=${DOLLY_EMSDK_IMAGE}"
  cd "${project_dir}" && sha256sum demos/zsh/prepare-zsh.sh demos/zsh/zsh-dolly.patch
} | sha256sum | cut -c1-16)"
output="${project_dir}/build/generated/zsh-${DOLLY_ZSH_SHA256:0:16}-${recipe_hash}"
if [[ -d "${output}" ]]; then
  printf '%s\n' "${output}"
  exit 0
fi

mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.zsh.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT
tree="${temporary}/tree"
mkdir -p "${tree}" "${temporary}/bin"
tar -xJf "${archive}" --strip-components=1 -C "${tree}"
patch --silent --fuzz=0 --no-backup-if-mismatch -d "${tree}" -p1 \
  < "${project_dir}/demos/zsh/zsh-dolly.patch"

printf '#!/bin/sh\nexec emcc -m64 "$@"\n' > "${temporary}/bin/cc"
chmod +x "${temporary}/bin/cc"
# zsh's build compiles against libterminfo's <termcap.h>, as Dolly's does.
mkdir -p "${temporary}/include"
tar -xzf "$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" netbsd_curses)" -O \
  netbsd-curses-0.3.2/libterminfo/termcap.h > "${temporary}/include/termcap.h"
container=(podman run --rm --userns=keep-id -v "${tree}:/tmp/zsh" -v "${temporary}/bin:/dolly-bin:ro"
  -v "${temporary}/include:/dolly-include:ro" -e CPATH=/dolly-include
  -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache"
  -w /tmp/zsh "${DOLLY_EMSDK_IMAGE}" /usr/bin/env
  PATH="/dolly-bin:/emsdk:/emsdk/upstream/emscripten:/emsdk/node/24.19.0_64bit/bin:/usr/bin:/bin")
# Where Dolly and Emscripten's libc differ, the result is stated. The terminal
# library is NetBSD's libterminfo (the libterminfo package), which Dolly's
# link adds: zsh uses it through <termcap.h>, there being no curses header
# for <term.h>. Dolly's wait reports no resource usage (wait3). Modules are
# linked in: Dolly loads no shared objects into zsh.
"${container[@]}" CONFIG_SHELL=/bin/sh \
  ac_cv_search_tigetstr='none required' ac_cv_search_tigetflag='none required' \
  ac_cv_search_tigetnum='none required' ac_cv_search_tgetent='none required' \
  ac_cv_func_tgetent=yes ac_cv_header_termcap_h=yes ac_cv_header_term_h=no \
  ac_cv_func_tigetflag=no ac_cv_func_tigetnum=no ac_cv_func_tigetstr=no ac_cv_func_setupterm=no \
  ac_cv_func_wait3=no \
  /bin/sh ./configure \
    --host=wasm64-unknown-emscripten --build=x86_64-pc-linux-gnu --prefix=/usr \
    --disable-dynamic --disable-gdbm --disable-pcre --disable-cap --enable-etcdir=/etc \
    CC=cc >/dev/null
# zsh's build generates headers and sources with awk and sh as it compiles:
# the whole build runs here, and only its objects and programs are dropped.
"${container[@]}" make -k >/dev/null 2>&1 || true
find "${tree}" \( -name '*.o' -o -name 'zsh' -o -name 'zsh.wasm' -o -name 'a.out*' \) -type f -delete
rm -f "${tree}/config.log"

mv -T -- "${tree}" "${output}"
printf '%s\n' "${output}"

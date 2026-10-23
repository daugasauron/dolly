#!/usr/bin/env bash
# Patches and configures the pinned OCaml release for Dolly, as zsh is
# (demos/zsh/prepare-zsh.sh): configure runs in the pinned Emscripten
# container, whose libc headers Dolly's compiler uses; Dolly compiles the
# runtime and builds the compiler from upstream's boot/ocamlc
# (Dollyfile-ocaml). Prints the tree.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${project_dir}/config/source-pins.sh"
archive="$(bash "${project_dir}/scripts/fetch-pinned-archive.sh" ocaml)"
recipe_hash="$({
  printf '%s\n' "emsdk=${DOLLY_EMSDK_IMAGE}"
  cd "${project_dir}" && sha256sum demos/ocaml/prepare-ocaml.sh demos/ocaml/ocaml-dolly.patch
} | sha256sum | cut -c1-16)"
output="${project_dir}/build/generated/ocaml-${DOLLY_OCAML_SHA256:0:16}-${recipe_hash}"
if [[ -d "${output}" ]]; then
  printf '%s\n' "${output}"
  exit 0
fi

mkdir -p "${project_dir}/build/generated"
temporary="$(mktemp -d "${project_dir}/build/generated/.ocaml.XXXXXX")"
trap 'rm -rf -- "${temporary}"' EXIT
tree="${temporary}/tree"
mkdir -p "${tree}" "${temporary}/bin"
tar -xzf "${archive}" --strip-components=1 -C "${tree}"
patch --silent --fuzz=0 --no-backup-if-mismatch -d "${tree}" -p1 \
  < "${project_dir}/demos/ocaml/ocaml-dolly.patch"

# configure records the names it finds: these are Dolly's.
printf '#!/bin/sh\nexec emcc -m64 "$@"\n' > "${temporary}/bin/cc"
printf '#!/bin/sh\nexec emar "$@"\n' > "${temporary}/bin/ar"
chmod +x "${temporary}/bin/cc" "${temporary}/bin/ar"
container=(podman run --rm --userns=keep-id -v "${tree}:/tmp/ocaml" -v "${temporary}/bin:/dolly-bin:ro"
  -v "${project_dir}/.cache/emscripten:/emsdk/upstream/emscripten/cache"
  -w /tmp/ocaml "${DOLLY_EMSDK_IMAGE}" /usr/bin/env
  PATH="/dolly-bin:/emsdk:/emsdk/upstream/emscripten:/emsdk/node/24.19.0_64bit/bin:/usr/bin:/bin")
# Where Dolly and Emscripten's libc differ, the result is stated: Dolly's
# libc spawns with posix_spawnp, which Unix.create_process then uses instead
# of fork and exec, and has no gethostbyname_r or gethostbyaddr_r. Dolly's
# threads are linked with -pthread. Dolly has no strip. Bytecode only: there
# is no native code generator for WebAssembly, and no shared stub libraries,
# since Dolly's -rdynamic excludes the threads OCaml 5's runtime is built with.
"${container[@]}" ac_cv_func_posix_spawnp=yes \
  ac_cv_func_which_gethostbyname_r=no ac_cv_func_which_gethostbyaddr_r=no \
  ./configure \
    --host=wasm64-unknown-emscripten --build=x86_64-pc-linux-gnu --prefix=/usr \
    --mandir=/usr/share/man --disable-native-compiler --disable-shared --disable-suffixing \
    --disable-debug-runtime --disable-instrumented-runtime --disable-installing-source-artifacts \
    --disable-ocamldoc --disable-ocamltest --disable-debugger --disable-stdlib-manpages \
    CC=cc AR=ar AWK=awk SED=sed STRIP=: INSTALL='install -c' LDFLAGS=-pthread >/dev/null
# Dolly's tar holds files: configure's links become copies.
find "${tree}" -type l | while read -r link; do
  cp --remove-destination -- "$(readlink -f -- "${link}")" "${link}"
done
rm -f "${tree}/config.log" "${tree}/a.wasm"

mv -T -- "${tree}" "${output}"
printf '%s\n' "${output}"

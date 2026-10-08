#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${project_dir}/dist"
staging="$(mktemp -d "${project_dir}/dist/.kernel-seed.XXXXXX")"
trap 'rm -rf -- "${staging}"' EXIT
cd -- "${staging}"
EM_CACHE="${staging}/headers" python3 /emsdk/upstream/emscripten/embuilder.py build sysroot
# Emscripten has no signals and aliases sigsetjmp and siglongjmp to setjmp and
# longjmp. Dolly's libc keeps the mask and learns of a jump out of a handler
# (src/process/signal.c).
patch --silent -d headers/sysroot/include -p1 < "${project_dir}/config/libc-setjmp-dolly.patch"
# A program compiled inside Dolly sees __dolly__ and no Emscripten macro
# (src/compiler.cpp). The bootstrap libc's headers keep their own branches,
# such as the layout of struct stat, under the name programs do see.
grep -rlZw __EMSCRIPTEN__ headers/sysroot/include |
  xargs -0 sed -i 's/\b__EMSCRIPTEN__\b/__dolly__/g'
node "${project_dir}/scripts/pack-seed.mjs" dolly.data \
  "${staging}/headers/sysroot/include@/usr/include" "$@"
mv -- dolly.data "${project_dir}/dist/"

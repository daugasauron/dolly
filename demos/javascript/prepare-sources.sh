# Sourced by scripts/prepare-image-sources.sh.
if has_image typescript-build; then
  copy_static demos/javascript/tsc.c default/commands/tsc.c
  copy_static demos/javascript/tsc-dolly.mjs default/runtimes/tsc-dolly.mjs
  typescript_archive="$(demos/javascript/fetch-typescript.sh)"
  copy_static "${typescript_archive}" default/typescript-5.9.3.tgz
fi
if has_image typescript-build; then
  copy_static demos/javascript/janis.c default/commands/janis.c
  copy_static demos/javascript/quickjs-main.c default/runtimes/quickjs-main.c
  copy_static demos/javascript/quickjs-runner.h default/runtimes/quickjs-runner.h
  copy_static demos/javascript/dolly-node.js default/runtimes/dolly-node.js
  copy_static demos/javascript/janis.js default/runtimes/janis.js
  quickjs_dir="$(scripts/fetch-pinned-checkout.sh quickjs)"
  node scripts/build-source-tar.mjs "${static_dir}/default/quickjs.tar" \
    "${quickjs_dir}/builtin-array-fromasync.h" /usr/src/quickjs/builtin-array-fromasync.h \
    "${quickjs_dir}/builtin-iterator-zip-keyed.h" /usr/src/quickjs/builtin-iterator-zip-keyed.h \
    "${quickjs_dir}/builtin-iterator-zip.h" /usr/src/quickjs/builtin-iterator-zip.h \
    "${quickjs_dir}/cutils.h" /usr/src/quickjs/cutils.h \
    "${quickjs_dir}/dtoa.c" /usr/src/quickjs/dtoa.c \
    "${quickjs_dir}/dtoa.h" /usr/src/quickjs/dtoa.h \
    "${quickjs_dir}/libregexp-opcode.h" /usr/src/quickjs/libregexp-opcode.h \
    "${quickjs_dir}/libregexp.c" /usr/src/quickjs/libregexp.c \
    "${quickjs_dir}/libregexp.h" /usr/src/quickjs/libregexp.h \
    "${quickjs_dir}/libunicode-table.h" /usr/src/quickjs/libunicode-table.h \
    "${quickjs_dir}/libunicode.c" /usr/src/quickjs/libunicode.c \
    "${quickjs_dir}/libunicode.h" /usr/src/quickjs/libunicode.h \
    "${quickjs_dir}/list.h" /usr/src/quickjs/list.h \
    "${quickjs_dir}/quickjs-atom.h" /usr/src/quickjs/quickjs-atom.h \
    "${quickjs_dir}/quickjs-c-atomics.h" /usr/src/quickjs/quickjs-c-atomics.h \
    "${quickjs_dir}/quickjs-opcode.h" /usr/src/quickjs/quickjs-opcode.h \
    "${quickjs_dir}/quickjs.c" /usr/src/quickjs/quickjs.c \
    "${quickjs_dir}/quickjs.h" /usr/src/quickjs/quickjs.h \
    "${quickjs_dir}/LICENSE" /usr/share/licenses/quickjs-ng/LICENSE
fi

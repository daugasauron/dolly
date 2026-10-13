# Sourced by scripts/prepare-image-sources.sh.
if has_image quickjs; then
  # The engine, and what upstream's CMakeLists.txt builds qjs from.
  quickjs_dir="$(scripts/fetch-pinned-checkout.sh quickjs)"
  quickjs_inputs=()
  for file in builtin-array-fromasync.h builtin-iterator-zip-keyed.h builtin-iterator-zip.h cutils.h \
    dtoa.c dtoa.h libregexp-opcode.h libregexp.c libregexp.h libunicode-table.h libunicode.c libunicode.h \
    list.h quickjs-atom.h quickjs-c-atomics.h quickjs-opcode.h quickjs.c quickjs.h \
    qjs.c quickjs-libc.c quickjs-libc.h gen/repl.c gen/standalone.c; do
    quickjs_inputs+=("${quickjs_dir}/${file}" "/usr/src/quickjs/${file}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/default/quickjs.tar" "${quickjs_inputs[@]}" \
    "${quickjs_dir}/LICENSE" /usr/share/licenses/quickjs-ng/LICENSE
fi
if has_image janis; then
  copy_static demos/javascript/janis.c default/commands/janis.c
  copy_static demos/javascript/quickjs-main.c default/runtimes/quickjs-main.c
  copy_static demos/javascript/quickjs-runner.h default/runtimes/quickjs-runner.h
  copy_static demos/javascript/dolly-node.js default/runtimes/dolly-node.js
  copy_static demos/javascript/janis.js default/runtimes/janis.js
fi
if has_image typescript; then
  copy_static demos/javascript/tsc.c default/commands/tsc.c
  copy_static demos/javascript/tsc-dolly.mjs default/runtimes/tsc-dolly.mjs
  typescript_archive="$(demos/javascript/fetch-typescript.sh)"
  copy_static "${typescript_archive}" default/typescript-5.9.3.tgz
fi

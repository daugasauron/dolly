# Sourced by scripts/prepare-image-sources.sh.
if has_image sysroot; then
  # The C library's sources at the Emscripten pin, read from the checkout's
  # objects (its sparse work tree has none of them), with their __EMSCRIPTEN__
  # tests renamed as the installed headers' are (scripts/prepare-kernel-seed.sh).
  emscripten_checkout="$("${project_dir}/scripts/fetch-pinned-checkout.sh" emscripten)"
  mkdir "${staging}/sysroot"
  git -C "${emscripten_checkout}" archive HEAD system/lib/libc system/lib/pthread system/lib/standalone \
    system/lib/dlmalloc.c | tar -x -C "${staging}/sysroot"
  # Dolly's own parts of the sysroot (scripts/build.sh, scripts/build-process-threads.sh).
  mkdir -p "${staging}/sysroot/dolly/src"
  cp -r src/process "${staging}/sysroot/dolly/src/process"
  clients=
  while read -r module source; do
    install -D -m 644 "${source}" "${staging}/sysroot/dolly/${source}"
    clients+=" ${module}:${source}"
  done < <(node scripts/host-modules.mjs client)
  echo "clients :=${clients}" > "${staging}/sysroot/dolly/clients.mk"
  grep -rlZw __EMSCRIPTEN__ "${staging}/sysroot" | xargs -0 sed -i 's/\b__EMSCRIPTEN__\b/__dolly__/g'
  node scripts/build-source-tar.mjs "${static_dir}/sysroot/sources.tar" "${staging}/sysroot" /tmp/sysroot \
    demos/sysroot/units.mk /tmp/sysroot/units.mk
fi

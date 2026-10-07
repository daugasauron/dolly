# Sourced by scripts/prepare-image-sources.sh.
if has_image llvm-tablegen; then
  # The seed's checkout (scripts/build-toolchain.sh): pinned commit plus the LLD patch.
  llvm_dir="${project_dir}/.cache/llvm-project"
  bash scripts/verify-git-source.sh "${llvm_dir}" "$(source config/source-pins.sh && echo "${DOLLY_LLVM_COMMIT}")" \
    "${project_dir}/config/lld-dolly.patch"
  # Everything CMake configures and the compiler closure compiles; no tests,
  # docs, examples or benchmarks. LLD always adds docs; mlgo-utils links three
  # scripts to their real copies under mlgo/.
  llvm_inputs=()
  stage_tree() {
    local tree="$1" entry
    shift
    for entry in "${llvm_dir}/${tree}"/*; do
      case " $* " in *" ${entry##*/} "*) continue ;; esac
      llvm_inputs+=("${entry}" "/tmp/llvm-project/${tree}/${entry##*/}")
    done
  }
  stage_tree llvm test unittests docs examples benchmarks utils
  stage_tree llvm/utils mlgo-utils gn
  stage_tree llvm/utils/mlgo-utils combine_training_corpus.py extract_ir.py make_corpus.py
  stage_tree clang test unittests docs www examples
  stage_tree lld test
  stage_tree cmake
  stage_tree third-party benchmark unittest
  for path in libc/shared libc/src/__support libc/hdr libc/include libc/LICENSE.TXT; do
    llvm_inputs+=("${llvm_dir}/${path}" "/tmp/llvm-project/${path}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/llvm/llvm-project.tar.gz" "${llvm_inputs[@]}"
  copy_static demos/llvm/llvm-host-triple.patch llvm/llvm-host-triple.patch
fi
if has_image llvm-runtimes; then
  # The runtime sources at the Emscripten pin, read from the checkout's objects
  # (its sparse work tree omits compiler-rt), with their __EMSCRIPTEN__ tests
  # renamed as the installed libc++ headers' are (scripts/prepare-image-sources.sh).
  emscripten_checkout="$("${project_dir}/scripts/fetch-pinned-checkout.sh" emscripten)"
  mkdir "${staging}/llvm-runtimes"
  git -C "${emscripten_checkout}" archive HEAD \
    system/lib/libcxx/src system/lib/libcxxabi system/lib/libunwind system/lib/llvm-libc |
    tar -x -C "${staging}/llvm-runtimes"
  grep -rlZw __EMSCRIPTEN__ "${staging}/llvm-runtimes" | xargs -0 sed -i 's/\b__EMSCRIPTEN__\b/__dolly__/g'
  node scripts/build-source-tar.mjs "${static_dir}/llvm/runtimes.tar" "${staging}/llvm-runtimes" /tmp/llvm-runtimes
fi

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
if has_image llvm-cc; then
  # The seed's driver and the contract digests npm run build:runtime generates.
  copy_static src/compiler.cpp llvm/compiler.cpp
  copy_static src/process/compiler-main.c llvm/compiler-main.c
  copy_static build/generated/dolly-process-abi-digest.h llvm/dolly-process-abi-digest.h
  copy_static build/generated/dolly-kernel-plugin-abi-digest.h llvm/dolly-kernel-plugin-abi-digest.h
fi

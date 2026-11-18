# Sourced by scripts/prepare-image-sources.sh.
# Stages the subdirectories of ROOT under /tmp/DESTINATION, leaving out the names that follow.
stage_mojo_tree() {
  local root="$1" destination="$2" tree="$3" entry
  shift 3
  for entry in "${root}/${tree}"/*; do
    case " $* " in *" ${entry##*/} "*) continue ;; esac
    mojo_inputs+=("${entry}" "/tmp/${destination}/${tree}/${entry##*/}")
  done
}
if has_image mojo-llvm; then
  mojo_dir="$(bash scripts/fetch-pinned-checkout.sh modular)"
  mojo_llvm_dir="$(bash scripts/fetch-pinned-checkout.sh mojo-llvm)"
  # What CMake configures and Mojo's closure compiles (LLVM, MLIR and Clang's
  # Basic library): no tests, docs, examples or benchmarks. mlgo-utils links
  # three scripts to their real copies under mlgo/.
  mojo_inputs=()
  stage_mojo_tree "${mojo_llvm_dir}" mojo-llvm llvm test unittests docs examples benchmarks utils
  stage_mojo_tree "${mojo_llvm_dir}" mojo-llvm llvm/utils mlgo-utils gn
  stage_mojo_tree "${mojo_llvm_dir}" mojo-llvm llvm/utils/mlgo-utils combine_training_corpus.py extract_ir.py make_corpus.py
  stage_mojo_tree "${mojo_llvm_dir}" mojo-llvm mlir test unittests docs examples benchmark python
  stage_mojo_tree "${mojo_llvm_dir}" mojo-llvm clang test unittests docs www examples
  stage_mojo_tree "${mojo_llvm_dir}" mojo-llvm cmake
  stage_mojo_tree "${mojo_llvm_dir}" mojo-llvm third-party benchmark unittest
  for path in libc/shared libc/src/__support libc/hdr libc/include libc/LICENSE.TXT; do
    mojo_inputs+=("${mojo_llvm_dir}/${path}" "/tmp/mojo-llvm/${path}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/mojo/mojo-llvm.tar.gz" "${mojo_inputs[@]}"
  copy_static demos/llvm/llvm-host-triple.patch mojo/llvm-host-triple.patch
  # The one patch of Mojo's LLVM (bazel/public-patches/llvm_source.bzl) outside LLDB and the Bazel overlay.
  copy_static "${mojo_dir}/bazel/public-patches/llvm-machinefunction-sti-ref-to-ptr.patch" mojo/llvm-machinefunction-sti-ref-to-ptr.patch
fi
if has_image mojo; then
  mojo_dir="$(bash scripts/fetch-pinned-checkout.sh modular)"
  # The packages of the compiler's closure and the standard library: no tests,
  # docs, examples, other tools or max/. The target's patches (one names
  # Bazel's list of LLVM backends) and its package gpu.
  mojo_inputs=()
  for path in BUILD.bazel LICENSE bazel/internal/gen_dialect_checksum.py bazel/public-patches/llvm_project.bzl \
      Config Mojo/BUILD.bazel Mojo/include Mojo/lib \
      Mojo/tools/mojo Mojo/stdlib/std Support/BUILD.bazel Support/include Support/lib Support/tools/driver-tblgen \
      AsyncRT/BUILD.bazel AsyncRT/include AsyncRT/lib Cache/BUILD.bazel Cache/include Cache/lib \
      Init/BUILD.bazel Init/include Init/lib; do
    mojo_inputs+=("${mojo_dir}/${path}" "/tmp/mojo/modular/${path}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/mojo/mojo.tar.gz" "${mojo_inputs[@]}" \
    demos/mojo/port /tmp/mojo/port demos/mojo/bazel-to-cmake.py /tmp/mojo/bazel-to-cmake.py \
    demos/mojo/mojo-dolly.patch /tmp/mojo/mojo-dolly.patch \
    demos/mojo/target/patches /tmp/mojo/target/patches demos/mojo/target/gpu /tmp/mojo/target/gpu
fi
if has_image mojo-gpu; then
  for example in hello saxpy mandelbrot; do
    copy_static "demos/mojo/target/test/fixtures/${example}.mojo" "mojo/examples/${example}.mojo"
  done
fi
# The xxhash package's sources: the library's, xxhsum's, its manual page and both licences.
if has_image xxhash; then
  xxhash_dir="$(bash scripts/fetch-pinned-source.sh xxhash)"
  node scripts/build-source-tar.mjs "${static_dir}/xxhash/source.tar.gz" \
    "${xxhash_dir}/xxhash.c" /tmp/xxhash/xxhash.c "${xxhash_dir}/xxhash.h" /tmp/xxhash/xxhash.h \
    "${xxhash_dir}/xxh3.h" /tmp/xxhash/xxh3.h "${xxhash_dir}/cli" /tmp/xxhash/cli \
    "${xxhash_dir}/LICENSE" /usr/share/licenses/xxhash/LICENSE "${xxhash_dir}/cli/COPYING" /usr/share/licenses/xxhash/COPYING
fi
# The opentelemetry-cpp package's sources: what its CMake project reads for the API, the SDK and the exporters.
if has_image opentelemetry-cpp; then
  opentelemetry_dir="$(bash scripts/fetch-pinned-source.sh opentelemetry)"
  opentelemetry_inputs=()
  for path in CMakeLists.txt api sdk ext exporters cmake third_party_release LICENSE; do
    opentelemetry_inputs+=("${opentelemetry_dir}/${path}" "/tmp/opentelemetry-cpp/${path}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/opentelemetry-cpp/source.tar.gz" "${opentelemetry_inputs[@]}" \
    "${opentelemetry_dir}/LICENSE" /usr/share/licenses/opentelemetry-cpp/LICENSE
fi

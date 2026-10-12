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
  # The library alone, without its legacy formats and dictionary builder.
  zstd_dir="$(bash scripts/fetch-pinned-source.sh zstd)"
  mojo_inputs=()
  for path in lib/common lib/compress lib/decompress lib/zstd.h lib/zstd_errors.h lib/zdict.h LICENSE; do
    mojo_inputs+=("${zstd_dir}/${path}" "/tmp/zstd/${path}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/mojo/zstd.tar" "${mojo_inputs[@]}"
  copy_static demos/llvm/llvm-host-triple.patch mojo/llvm-host-triple.patch
  copy_static demos/rust/config/patches/llvm-main-executable.patch mojo/llvm-main-executable.patch
  # The one patch of Mojo's LLVM (bazel/public-patches/llvm_source.bzl) outside LLDB and the Bazel overlay.
  copy_static "${mojo_dir}/bazel/public-patches/llvm-machinefunction-sti-ref-to-ptr.patch" mojo/llvm-machinefunction-sti-ref-to-ptr.patch
fi
if has_image mojo-build; then
  mojo_dir="$(bash scripts/fetch-pinned-checkout.sh modular)"
  fmt_dir="$(bash scripts/fetch-pinned-source.sh fmt)"
  xxhash_dir="$(bash scripts/fetch-pinned-source.sh xxhash)"
  opentelemetry_dir="$(bash scripts/fetch-pinned-source.sh opentelemetry)"
  # The packages of the compiler's closure and the standard library: no tests,
  # docs, examples, other tools or max/. Of {fmt}, xxHash and OpenTelemetry,
  # what is compiled or included. The target's patches (one names Bazel's
  # list of LLVM backends) and its package gpu.
  mojo_inputs=()
  for path in BUILD.bazel LICENSE bazel/internal/gen_dialect_checksum.py bazel/public-patches/llvm_project.bzl \
      Config Mojo/BUILD.bazel Mojo/include Mojo/lib \
      Mojo/tools/mojo Mojo/stdlib/std Support/BUILD.bazel Support/include Support/lib Support/tools/driver-tblgen \
      AsyncRT/BUILD.bazel AsyncRT/include AsyncRT/lib Cache/BUILD.bazel Cache/include Cache/lib \
      Init/BUILD.bazel Init/include Init/lib; do
    mojo_inputs+=("${mojo_dir}/${path}" "/tmp/mojo/modular/${path}")
  done
  for path in include src/format.cc LICENSE; do mojo_inputs+=("${fmt_dir}/${path}" "/tmp/mojo/fmt/${path}"); done
  for path in xxhash.c xxhash.h xxh3.h LICENSE; do mojo_inputs+=("${xxhash_dir}/${path}" "/tmp/mojo/xxhash/${path}"); done
  for path in api/include sdk/include LICENSE; do
    mojo_inputs+=("${opentelemetry_dir}/${path}" "/tmp/mojo/opentelemetry/${path}")
  done
  node scripts/build-source-tar.mjs "${static_dir}/mojo/mojo.tar.gz" "${mojo_inputs[@]}" \
    demos/mojo/port /tmp/mojo/port demos/mojo/bazel-to-cmake.py /tmp/mojo/bazel-to-cmake.py \
    demos/mojo/mojo-dolly.patch /tmp/mojo/mojo-dolly.patch \
    demos/mojo/target/patches /tmp/mojo/target/patches demos/mojo/target/gpu /tmp/mojo/target/gpu
fi

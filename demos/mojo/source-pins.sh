# The mojo demo's upstream source pins, sourced by config/source-pins.sh.

# Mojo: tag mojo/v1.1.0 of Modular's repository, the LLVM it pins
# (bazel/public-patches/llvm_source.bzl) and what its compiler takes besides
# LLVM (bazel/common.MODULE.bazel): xxHash, OpenTelemetry C++, {fmt} and Zstandard
# (with which LLVM compresses a precompiled package), each a package.
DOLLY_MODULAR_VERSION=1.1.0
DOLLY_MODULAR_COMMIT=c6fa49f712fe15c99d0461ad2baaf2a15cbc58ce
DOLLY_MODULAR_URL='https://github.com/modular/modular.git'
DOLLY_MOJO_LLVM_COMMIT=4154b56ccc70220dca3fa1226fc8a24bafd90ac3
DOLLY_MOJO_LLVM_URL='https://github.com/llvm/llvm-project.git'
# Only the trees a recipe stages: Modular's max/ has another licence, and
# neither repository is wanted whole.
DOLLY_MODULAR_SPARSE='Mojo AsyncRT Support Cache Config Init bazel Licenses'
DOLLY_MOJO_LLVM_SPARSE='llvm mlir clang cmake third-party libc'
DOLLY_XXHASH_VERSION=0.8.3
DOLLY_XXHASH_URL='https://github.com/Cyan4973/xxHash/archive/refs/tags/v0.8.3.tar.gz'
DOLLY_XXHASH_SHA256=aae608dfe8213dfd05d909a57718ef82f30722c392344583d3f39050c7f29a80
DOLLY_OPENTELEMETRY_VERSION=1.19.0
DOLLY_OPENTELEMETRY_URL='https://github.com/open-telemetry/opentelemetry-cpp/archive/refs/tags/v1.19.0.tar.gz'
DOLLY_OPENTELEMETRY_SHA256=e0330194b72f2fe4c0ce3ece06b02dc4aa0ab491eb75bf42c6f5e283912e468c

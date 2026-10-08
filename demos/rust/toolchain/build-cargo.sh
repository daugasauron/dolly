#!/usr/bin/env bash
# Cross-compile Cargo from the sources its image build uses, up to one object that Dolly links.
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
stage="${project_dir}/build/rust-sources/cargo"
export CARGO_TARGET_DIR="${port_dir}/cargo-target"
# Cargo does not see a rebuilt standard library behind an installed target.
rm -rf "${CARGO_TARGET_DIR}"
export CC_wasm64_emscripten_probe="${project_dir}/demos/rust/toolchain/cc.sh"
export CRATE_CC_NO_DEFAULTS=1
# libgit2 reads the headers of the zlib that Dolly links.
export CFLAGS="-O1 -I$("${project_dir}/scripts/prepare-zlib.sh")"
# The standard library is the seed's own, found as an installed target.
installed="${port_dir}/toolchain/lib/rustlib/wasm64-emscripten-probe"
ln -sfn "${port_dir}/package/rust-sdk/lib/rustlib/wasm64-emscripten-probe" "${installed}"
trap 'rm -f "${installed}"' EXIT
cd "${stage}"/cargo-*/
"${port_dir}/toolchain/bin/cargo" rustc -j 4 --offline -p cargo --bin cargo \
  --target "${port_dir}/wasm64-emscripten-probe.json" -Z json-target-spec \
  --config "source.vendored-sources.directory=\"${stage}/vendor\"" \
  -- -Zno-link --emit=obj
# One relocatable object of everything but libc, libcurl and zlib. The panic
# runtime is the first archive that defines it: abort.
out="${CARGO_TARGET_DIR}/wasm64-emscripten-probe/debug"
sdk="${port_dir}/package/rust-sdk/lib/rustlib/wasm64-emscripten-probe/lib"
source "${project_dir}/config/source-pins.sh"
podman run --rm --userns=keep-id -v "${project_dir}:${project_dir}" -w "$PWD" \
  "${DOLLY_EMSDK_IMAGE}" /emsdk/upstream/bin/wasm-ld -r -mwasm64 \
  -o "${port_dir}/package/rust-sdk/cargo.o" \
  "${out}"/deps/cargo-*.rcgu.o "${out}"/deps/*.rlib "${sdk}"/*.rlib \
  "${out}"/build/libgit2-sys-*/out/build/libgit2.a "${out}"/build/libsqlite3-sys-*/out/libsqlite3.a

#!/usr/bin/env bash
# What prepare-rustc-sources.py stages for rust-llvm and rust-build, in build/rustc-port:
# Rust's pinned revision with its patches, the standard library's source from upstream's
# release (whose Cargo locks the crates below), the libc and jobserver crates with theirs, and
# the LLVM revision Rust pins. It compiles nothing, and does nothing while its inputs are those
# of the tree it left.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
port_dir="${project_dir}/build/rustc-port"
patch_dir="${project_dir}/demos/rust/toolchain"
key="$(cd "${project_dir}" && sha256sum demos/rust/toolchain/prepare.sh demos/rust/toolchain/*.patch \
  demos/rust/toolchain/bootstrap-sources.json | sha256sum | cut -d' ' -f1)"
if [[ -f "${port_dir}/prepare.inputs" && "$(cat "${port_dir}/prepare.inputs")" == "${key}" ]]; then exit 0; fi
rm -rf "${port_dir}/prepare.inputs" "${port_dir}/rust" "${port_dir}/toolchain" "${port_dir}/libc" "${port_dir}/libc-186" \
  "${port_dir}/jobserver" "${port_dir}/llvm-source"
mkdir -p "${port_dir}/downloads" "${port_dir}/cargo-home"
cd "${port_dir}/downloads"
while read -r package url checksum; do
  if [[ ! -f "${package}" ]]; then curl --retry 2 -fsSL "${url}" -o "${package}"; fi
  printf '%s  %s\n' "${checksum}" "${package}" | sha256sum -c -
  tar -xJf "${package}"
  "${package%.tar.xz}/install.sh" --prefix="${port_dir}/toolchain" --disable-ldconfig
done < <(python3 - "${patch_dir}/bootstrap-sources.json" <<'PY'
import json, sys
for source in json.load(open(sys.argv[1])):
    print(source['name'], source['url'], source['sha256'])
PY
)
rust_revision=48a229ceaefd4985c50990b14116b6d856af0985
if [[ ! -f "${port_dir}/rust-source.tar.gz" ]]; then
  curl --retry 2 -fsSL "https://github.com/rust-lang/rust/archive/${rust_revision}.tar.gz" \
    -o "${port_dir}/rust-source.tar.gz"
fi
printf '%s  %s\n' \
  50ac07d25365f6681bae413743695e35b2c35bf7d45dc9a3749d5f7549b0f31d \
  "${port_dir}/rust-source.tar.gz" | sha256sum -c -
mkdir "${port_dir}/rust"
tar -xzf "${port_dir}/rust-source.tar.gz" --strip-components=1 -C "${port_dir}/rust"
for name in rust proc-macro-host match-stack; do
  patch --batch --fuzz=0 -d "${port_dir}/rust" -p1 < "${patch_dir}/${name}.patch"
done
patch --batch --fuzz=0 -d "${port_dir}/toolchain/lib/rustlib/src/rust" -p1 < "${patch_dir}/std.patch"
while read -r crate version directory checksum; do
  curl --retry 2 -fsSL "https://static.crates.io/crates/${crate}/${crate}-${version}.crate" \
    -o "${crate}-${version}.crate"
  printf '%s  %s\n' "${checksum}" "${crate}-${version}.crate" | sha256sum -c -
  mkdir "${port_dir}/${directory}"
  tar -xzf "${crate}-${version}.crate" --strip-components=1 -C "${port_dir}/${directory}"
  patch_file="${crate}-${version}.patch"
  if [[ "${crate}" == jobserver ]]; then patch_file=jobserver.patch; fi
  patch --batch --fuzz=0 -d "${port_dir}/${directory}" -p1 < "${patch_dir}/${patch_file}"
done <<'EOF'
libc 0.2.185 libc 52ff2c0fe9bc6cb6b14a0592c2ff4fa9ceb83eea9db979b0487cd054946a2b8f
libc 0.2.186 libc-186 68ab91017fe16c622486840e4c83c9a37afeff978bd239b5293d61ece587de66
jobserver 0.1.34 jobserver 9afb3de4395d6b3e67a780b6de64b51c978ecf11cb9a462c66be7d4ca9039d33
EOF
source "${patch_dir}/env.sh"
cd "${port_dir}/rust"
"${port_dir}/toolchain/bin/cargo" update -p libc@0.2.183 --precise 0.2.186 \
  --config "patch.crates-io.libc.path=\"${port_dir}/libc-186\"" \
  --config 'patch.crates-io.libc-std.package="libc"' \
  --config "patch.crates-io.libc-std.path=\"${port_dir}/libc\"" \
  --config "patch.crates-io.jobserver.path=\"${port_dir}/jobserver\""
# LLVM at the revision Rust's own build pins: what rust-llvm configures and compiles.
llvm_revision=52ed14fcd56afc30f9cccd8ca8ce237c2eef7e04
if [[ ! -f "${port_dir}/llvm-source.tar.gz" ]]; then
  curl --retry 2 -fL "https://github.com/rust-lang/llvm-project/archive/${llvm_revision}.tar.gz" \
    -o "${port_dir}/llvm-source.tar.gz"
fi
printf '%s  %s\n' \
  27f31a6639023d90cd754c1de42d8f9d77cc0c3deff37896f88c1346c6c3f396 \
  "${port_dir}/llvm-source.tar.gz" | sha256sum -c -
mkdir -p "${port_dir}/llvm-source"
tar -xzf "${port_dir}/llvm-source.tar.gz" --strip-components=1 -C "${port_dir}/llvm-source" \
  "llvm-project-${llvm_revision}/llvm" "llvm-project-${llvm_revision}/cmake" "llvm-project-${llvm_revision}/third-party"
printf '%s\n' "${key}" > "${port_dir}/prepare.inputs"

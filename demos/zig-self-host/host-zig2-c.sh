#!/usr/bin/env bash
# Measurement shortcut for zig-stage2-hostc only: emits zig2.c and compiler_rt.c
# for wasm64-emscripten with a host-built zig1, because zig1 overflows the
# browser Worker stack in Dolly (see README). Prints the output directory.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
zig_dir="$(bash "${project_dir}/scripts/prepare-zig-native.sh")"
demo_dir="${project_dir}/demos/zig-self-host"
digest="$(cat "${zig_dir}/.dolly-native-source" "${demo_dir}/zig2-config.zig" "$0" | sha256sum | cut -c1-16)"
output_dir="${project_dir}/build/zig-self-host/host-c-${digest}"
if [[ -f "${output_dir}/zig2.c" && -f "${output_dir}/compiler_rt.c" ]]; then
  printf '%s\n' "${output_dir}"
  exit 0
fi
work="$(mktemp -d "${project_dir}/build/zig-self-host.XXXXXX")"
trap 'rm -rf -- "${work}"' EXIT
cd "${work}"
ln -s "${zig_dir}/lib" lib
ln -s "${zig_dir}/src" src
cp "${demo_dir}/zig2-config.zig" config.zig
cc -O2 -std=c99 -o wasm2c "${zig_dir}/stage1/wasm2c.c"
./wasm2c "${zig_dir}/stage1/zig1.wasm" zig1.c
cc -Os -std=c99 -fno-strict-aliasing -o zig1 zig1.c "${zig_dir}/stage1/wasi.c" -lm
target=(-target wasm64-emscripten -mcpu=generic+atomics -fsingle-threaded -OReleaseSmall -ofmt=c)
./zig1 lib build-exe "${target[@]}" -lc --name zig2 -femit-bin=zig2.c \
  --dep build_options --dep aro -Mroot=src/main.zig -Mbuild_options=config.zig \
  -Maro=lib/compiler/aro/aro.zig >&2
./zig1 lib build-obj "${target[@]}" --name compiler_rt -femit-bin=compiler_rt.c \
  -Mroot=lib/compiler_rt.zig >&2
mkdir -p "${output_dir}"
mv zig2.c compiler_rt.c "${output_dir}/"
printf '%s\n' "${output_dir}"

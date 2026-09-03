#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_archive="${project_dir}/.cache/emscripten/sysroot/lib/wasm64-emscripten/pic/libclang_rt.builtins.a"
output_archive="${project_dir}/build/generated/libclang_rt.dolly.a"

if [[ ! -f "${source_archive}" ]]; then
  echo "dolly: missing pinned Emscripten compiler-rt archive" >&2
  exit 1
fi

mkdir -p "$(dirname -- "${output_archive}")"
staging="$(mktemp "${output_archive}.tmp.XXXXXX")"
cleanup() {
  rm -f -- "${staging}"
}
trap cleanup EXIT INT TERM

cp -- "${source_archive}" "${staging}"

# Emscripten packages its setjmp implementation in the compiler builtins
# archive. Dolly deliberately obtains setjmp/longjmp from the shared libc
# substrate instead. If this member is left in the archive, ordinary programs
# that use setjmp acquire the private browser glue import
# `_emscripten_throw_longjmp` when the linker scans compiler-rt.
ar d "${staging}" emscripten_setjmp.o
ar sD "${staging}"
if ar t "${staging}" | grep -qx 'emscripten_setjmp\.o'; then
  echo "dolly: could not remove Emscripten's setjmp runtime from compiler-rt" >&2
  exit 1
fi

chmod 0644 "${staging}"
mv -T -- "${staging}" "${output_archive}"
trap - EXIT INT TERM
echo "dolly: prepared Dolly compiler builtins without host setjmp glue"

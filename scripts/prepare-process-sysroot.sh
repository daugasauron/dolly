#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
emscripten_lib="${project_dir}/.cache/emscripten/sysroot/lib/wasm64-emscripten"
process_runtime="${project_dir}/build/libdolly-process.a"
cache_root="${project_dir}/.cache"
llvm_nm="${project_dir}/.cache/llvm-host/bin/llvm-nm"
reserved_libc_symbols="${project_dir}/config/process-libc-provider.symbols"

libraries=(
  crt1.o
  libstandalonewasm-ww-memgrow.a
  libstubs.a
  libc-ww.a
  libdlmalloc-ww.a
  libclang_rt.builtins-wasmsjlj-ww.a
  libunwind-ww-wasmexcept.a
  libc++-ww-wasmexcept.a
  libc++abi-ww-wasmexcept.a
)

for library in "${libraries[@]}"; do
  if [[ ! -f "${emscripten_lib}/${library}" ]]; then
    echo "dolly: missing process runtime archive: ${emscripten_lib}/${library}" >&2
    exit 1
  fi
done
if [[ ! -f "${process_runtime}" ]]; then
  echo "dolly: missing Dolly process adapter: ${process_runtime}" >&2
  exit 1
fi
if [[ ! -x "${llvm_nm}" ]]; then
  echo "dolly: missing host llvm-nm: ${llvm_nm}" >&2
  exit 1
fi
if [[ ! -f "${reserved_libc_symbols}" ]]; then
  echo "dolly: missing reviewed process libc provider symbols: ${reserved_libc_symbols}" >&2
  exit 1
fi

mkdir -p -- "${cache_root}"
staging="$(mktemp -d "${cache_root}/.process-sysroot.XXXXXX")"
cleanup() {
  rm -rf -- "${staging}"
}
trap cleanup EXIT HUP INT TERM

for library in "${libraries[@]}"; do
  cp -- "${emscripten_lib}/${library}" "${staging}/${library}"
done
cp -- "${process_runtime}" "${staging}/libdolly-process.a"
cp -- "${reserved_libc_symbols}" "${staging}/libc-provider.symbols"

"${llvm_nm}" -j --defined-only --extern-only \
  "${staging}/libc-ww.a" \
  "${staging}/libdlmalloc-ww.a" \
  2>/dev/null | awk 'NF && $0 !~ /:$/ { print }' | LC_ALL=C sort -u \
  >"${staging}/.libc-defined.symbols"
while IFS= read -r symbol; do
  if [[ -z "${symbol}" || "${symbol}" == \#* ]]; then
    continue
  fi
  if ! grep -Fqx -- "${symbol}" "${staging}/.libc-defined.symbols"; then
    echo "dolly: reviewed process libc symbol is not defined: ${symbol}" >&2
    exit 1
  fi
done <"${staging}/libc-provider.symbols"

# A process with loadable Wasm DSOs has the same ownership rule as a native
# dynamically linked process: one C/POSIX runtime, allocator, C++ runtime, and
# exception runtime serve the complete address space. Emscripten's target
# archives are static, so publish their provider symbol set and let -rdynamic
# executables root and export it.
#
# libc and dlmalloc contribute their public C spellings. Private archive
# helpers are implementation details and Emscripten's browser-facing API is
# deliberately excluded: neither is part of Dolly's process-local libc ABI.
# The small reviewed file adds conventional reserved public libc spellings
# (for example __errno_location) without publishing every private underscore
# name found in the archive.
# C++ ABI names are mangled (and therefore begin with underscores), so retain
# the complete public archive symbol set for libc++, libc++abi, and libunwind.
# Any selected object which still requires an undeclared browser import makes
# the final executable link fail; the process verifier then independently
# proves that the finished module imports only memory and dolly_process_0.call.
{
  "${llvm_nm}" -j --defined-only --extern-only \
    "${staging}/libc-ww.a" \
    "${staging}/libdlmalloc-ww.a" \
    2>/dev/null | awk \
      'NF && $0 !~ /:$/ && $0 !~ /^_/ && $0 !~ /^emscripten_/ { print }'
  awk 'NF && $0 !~ /^#/ { print }' "${staging}/libc-provider.symbols"
  "${llvm_nm}" -j --defined-only --extern-only \
    "${staging}/libc++-ww-wasmexcept.a" \
    "${staging}/libc++abi-ww-wasmexcept.a" \
    "${staging}/libunwind-ww-wasmexcept.a" \
    2>/dev/null | awk 'NF && $0 !~ /:$/ { print }'
} | LC_ALL=C sort -u >"${staging}/dynamic-provider.symbols"
if [[ ! -s "${staging}/dynamic-provider.symbols" ]]; then
  echo "dolly: process runtime provider has no symbols" >&2
  exit 1
fi
rm -- "${staging}/.libc-defined.symbols"

(
  cd -- "${staging}"
  sha256sum -- \
    "${libraries[@]}" \
    libdolly-process.a \
    libc-provider.symbols \
    dynamic-provider.symbols
) >"${staging}/SHA256SUMS"

key="$({
  printf '%s\n' 'dolly-process-sysroot-0'
  cat -- "${staging}/SHA256SUMS"
} | sha256sum | awk '{print $1}')"
published="${cache_root}/process-sysroot-${key}"

if [[ -e "${published}" ]]; then
  if [[ ! -d "${published}" ]] ||
      ! cmp -s -- "${staging}/SHA256SUMS" "${published}/SHA256SUMS"; then
    echo "dolly: process sysroot cache collision: ${published}" >&2
    exit 1
  fi
else
  mv -- "${staging}" "${published}"
  staging="${cache_root}/.process-sysroot-published"
fi

printf '%s\n' "${published}"

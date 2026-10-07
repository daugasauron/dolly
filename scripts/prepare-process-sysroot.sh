#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
emscripten_lib="${project_dir}/.cache/emscripten/sysroot/lib/wasm64-emscripten"
process_runtime="${project_dir}/build/libdolly-process.a"
cache_root="${project_dir}/.cache"
llvm_nm="${project_dir}/.cache/llvm-native/bin/llvm-nm"
reserved_libc_symbols="${project_dir}/config/process-libc-provider.symbols"

libraries=(
  libstandalonewasm-ww-memgrow.a
  libstubs.a
  libc-ww.a
  libdlmalloc-ww.a
  libclang_rt.builtins-wasmsjlj-ww.a
)
# Dollyfile-system-build builds these three from source. The container's
# copies, with the same symbols, are inside the seed compiler and name what an
# -rdynamic host exports.
cxx_runtime=(libc++-ww-wasmexcept.a libc++abi-ww-wasmexcept.a libunwind-ww-wasmexcept.a)

for library in "${libraries[@]}" "${cxx_runtime[@]}"; do
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
  echo "dolly: missing seed toolchain llvm-nm: ${llvm_nm}" >&2
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
cp -- "${project_dir}/build/process-crt1.o" "${staging}/crt1.o"
cp -- "${process_runtime}" "${staging}/libdolly-process.a"
# Arguments name the host module client archives (libdolly-NAME.a).
host_libraries=("$@")
for library in "${host_libraries[@]}"; do
  cp -- "${project_dir}/build/${library}" "${staging}/${library}"
done
cp -- "${reserved_libc_symbols}" "${staging}/libc-provider.symbols"
mkdir "${staging}/threads"
cp -- "${project_dir}/build/process-threads/"{libdolly-process.a,libdolly-runtime.a,libc-mt.a,crt1.o} "${staging}/threads/"
for library in libstandalonewasm-mt-memgrow.a libdlmalloc-mt.a \
    libclang_rt.builtins-wasmsjlj-mt.a; do
  cp -- "${emscripten_lib}/${library}" "${staging}/threads/"
done

# Dolly owns signal and timer state. Keeping the replaced objects lets -rdynamic
# root Emscripten's action_abort/action_terminate helpers and pull in a second owner.
emar d "${staging}/libc-ww.a" \
  raise.o sigaction.o pthread_sigmask.o sigtimedwait.o setitimer.o getitimer.o

"${llvm_nm}" -j --defined-only --extern-only \
  "${staging}/libc-ww.a" \
  "${staging}/libstubs.a" \
  "${staging}/libdlmalloc-ww.a" \
  "${staging}/libstandalonewasm-ww-memgrow.a" \
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
# libc, its Dolly adapters and dlmalloc contribute their public C spellings.
# Private helpers are implementation details and Emscripten's browser-facing API is
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
    "${staging}/libstandalonewasm-ww-memgrow.a" \
    "${staging}/libdolly-process.a" \
    "${staging}/libdolly-runtime.a" \
    "${staging}/libdlmalloc-ww.a" \
    2>/dev/null | awk \
      'NF && $0 !~ /:$/ && $0 !~ /^_/ && $0 !~ /^emscripten_/ { print }'
  awk 'NF && $0 !~ /^#/ { print }' "${staging}/libc-provider.symbols"
  "${llvm_nm}" -j --defined-only --extern-only \
    "${cxx_runtime[@]/#/${emscripten_lib}/}" \
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
    crt1.o \
    libdolly-process.a \
    "${host_libraries[@]}" \
    libc-provider.symbols \
    dynamic-provider.symbols threads/*
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
fi

printf '%s\n' "${published}"

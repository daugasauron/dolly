cmake_minimum_required(VERSION 3.20)
project(dolly-runtime LANGUAGES C CXX)

if(NOT DOLLY_PROCESS_SYSROOT_DIR OR
   NOT EXISTS "${DOLLY_PROCESS_SYSROOT_DIR}/SHA256SUMS" OR
   NOT EXISTS "${DOLLY_PROCESS_SYSROOT_DIR}/libdolly-process.a")
  message(FATAL_ERROR
    "DOLLY_PROCESS_SYSROOT_DIR must name the prepared process target sysroot")
endif()

if(NOT DOLLY_KERNEL_SOURCES)
  message(FATAL_ERROR "DOLLY_KERNEL_SOURCES must list the host modules' kernel sources")
endif()
add_executable(dolly ${DOLLY_KERNEL_SOURCES})
# statvfs reports the kernel's maximum memory as the filesystem's capacity.
set(DOLLY_KERNEL_MEMORY_MAXIMUM 8589934592)
target_compile_definitions(dolly PRIVATE DOLLY_KERNEL_MEMORY_MAXIMUM=${DOLLY_KERNEL_MEMORY_MAXIMUM})

target_include_directories(dolly PRIVATE
  ../build/include
  ../build/generated
  ../src
  ../host
  # src/file-blocks.cpp implements a WasmFS backend.
  ${EMSCRIPTEN_ROOT_PATH}/system/lib/wasmfs
)
target_compile_options(dolly PRIVATE
  -m64
  -O2
  -Wall
  -Werror
  -fPIC
  -fvisibility=default
  -matomics
  -mbulk-memory
  # Like WasmFS itself; a throw would import __cxa_throw from JavaScript.
  $<$<COMPILE_LANGUAGE:CXX>:-fno-exceptions>
)
target_link_options(dolly PRIVATE
  -m64
  -O2
  -fPIC
  -matomics
  -mbulk-memory
  "SHELL:-Wl,--shared-memory,--no-check-features"
  "SHELL:-Wl,--export=__stack_pointer"
  # Resident Wasm bytes are instantiated by the small boot loader; the kernel
  # has no dlopen or dlsym.
  "SHELL:-Wl,--export-table,--growable-table"
  -sWASMFS
  # The kernel is one Wasm module and no generated JavaScript: every import is
  # one it declares (abi/dolly-browser-0.wat, src/libc-host.c).
  -sSTANDALONE_WASM=1
  # The kernel never calls setjmp; Emscripten's JavaScript longjmp would
  # export two stack helpers no contract names.
  -sSUPPORT_LONGJMP=0
  -sALLOW_MEMORY_GROWTH=1
  -sIMPORTED_MEMORY=1
  -sINITIAL_MEMORY=67108864
  -sMAXIMUM_MEMORY=${DOLLY_KERNEL_MEMORY_MAXIMUM}
  -sSTACK_SIZE=16777216
  --no-entry
  --profiling-funcs
  "SHELL:-sEXPORTED_FUNCTIONS=@/src/build/runtime-exports.json"
)

# Only a root rebuild restores the seed: images already contain their
# compiler and tools.
add_custom_target(dolly-seed
  COMMAND bash /src/scripts/prepare-kernel-seed.sh
    /src/build/generated/libclang_rt.dolly.a@/usr/lib/libclang_rt.builtins.a
    /src/build/seed-compiler/usr/lib/clang@/usr/lib/clang
    /src/build/seed-include/dolly@/usr/include/dolly
    /src/src/dollyfile.c@/usr/src/dolly/dollyfile.c
    /src/src/sha256.h@/usr/src/dolly/sha256.h
    /src/src/fs-record.h@/usr/src/dolly/fs-record.h
    /src/build/dolly-kernel-plugin-0.wasm@/usr/lib/dolly/dolly-kernel-plugin-0.wasm
    ${DOLLY_PROCESS_SYSROOT_DIR}@/usr/lib/dolly/process
    /src/build/process-bin/bootstrap@/usr/libexec/dolly/process-bin/bootstrap
    /src/build/seed-compiler/usr/libexec/dolly/process-bin/compiler@/usr/libexec/dolly/process-bin/compiler
  VERBATIM
)
add_dependencies(dolly dolly-seed)

set_target_properties(dolly PROPERTIES
  OUTPUT_NAME dolly
  SUFFIX .wasm
  RUNTIME_OUTPUT_DIRECTORY /src/dist
)

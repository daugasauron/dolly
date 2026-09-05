cmake_minimum_required(VERSION 3.20)
project(dolly-runtime LANGUAGES C CXX)

find_package(LLVM REQUIRED CONFIG)
find_package(LLD REQUIRED CONFIG)
find_package(Clang REQUIRED CONFIG)

if(NOT DOLLY_ZIG_DIR OR NOT EXISTS "${DOLLY_ZIG_DIR}/src/zig_llvm.cpp" OR
   NOT EXISTS "${DOLLY_ZIG_DIR}/lib/std/std.zig")
  message(FATAL_ERROR "DOLLY_ZIG_DIR must name the prepared Zig source tree")
endif()
if(NOT DOLLY_ZIG_OBJECT OR NOT EXISTS "${DOLLY_ZIG_OBJECT}")
  message(FATAL_ERROR "DOLLY_ZIG_OBJECT must name the prepared Zig frontend object")
endif()
if(NOT DOLLY_PROCESS_SYSROOT_DIR OR
   NOT EXISTS "${DOLLY_PROCESS_SYSROOT_DIR}/SHA256SUMS" OR
   NOT EXISTS "${DOLLY_PROCESS_SYSROOT_DIR}/libdolly-process.a")
  message(FATAL_ERROR
    "DOLLY_PROCESS_SYSROOT_DIR must name the prepared process target sysroot")
endif()

add_executable(dolly
  ../src/dolly.c
  ../src/process-kernel.c
  ../src/session-snapshot.c
  ../src/system-snapshot.c
)

target_include_directories(dolly PRIVATE
  ../include
)
target_compile_options(dolly PRIVATE
  -m64
  -O2
  -fPIC
  -fvisibility=default
  -matomics
  -mbulk-memory
)
set(DOLLY_CLANG_LLD_LIBRARIES
  clangFrontendTool
  clangCodeGen
  clangFrontend
  clangBasic
  lldWasm
  lldCommon
  LLVMWebAssemblyCodeGen
  LLVMWebAssemblyAsmParser
  LLVMBitReader
  LLVMBitWriter
  LLVMIRReader
  LLVMPasses
  LLVMObject
)

# Emscripten makes --preload-file directory nodes read-only. Keep its packaged
# input under /seed; Dolly installs that tree into its mutable in-Wasm /usr
# filesystem before invoking the compiler. No image-specific source belongs in
# this common seed.
target_link_options(dolly PRIVATE
  -m64
  -O2
  -fPIC
  -matomics
  -mbulk-memory
  "SHELL:-Wl,--shared-memory,--no-check-features"
  "SHELL:-Wl,--export=getTempRet0,--export=setTempRet0,--export=__stack_pointer,--export=__stack_high,--export=__stack_low"
  -sMAIN_MODULE=2
  -sWASMFS
  -sALLOW_MEMORY_GROWTH=1
  -sIMPORTED_MEMORY=1
  -sINITIAL_MEMORY=67108864
  -sMAXIMUM_MEMORY=8589934592
  -sSTACK_SIZE=16777216
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createDolly
  -sENVIRONMENT=worker
  -sINVOKE_RUN=0
  --profiling-funcs
  "SHELL:-sEXPORTED_RUNTIME_METHODS=FS,FS_createPath,FS_createDataFile"
  "SHELL:-sEXPORTED_FUNCTIONS=@/src/build/runtime-exports.json"
  "SHELL:--js-library /src/src/browser-broker.js"
  "SHELL:--preload-file /src/.cache/emscripten/sysroot/include@/seed/usr/include"
  "SHELL:--exclude-file */c++/v1/*"
  "SHELL:--preload-file /src/build/generated/libclang_rt.dolly.a@/seed/usr/lib/libclang_rt.builtins.a"
  "SHELL:--preload-file /src/.cache/llvm-wasm/lib/clang/24/include@/seed/usr/lib/clang/24/include"
  "SHELL:--preload-file /src/include/dolly/http.h@/seed/usr/include/dolly/http.h"
  "SHELL:--preload-file /src/include/dolly/display.h@/seed/usr/include/dolly/display.h"
  "SHELL:--preload-file /src/include/dolly/download.h@/seed/usr/include/dolly/download.h"
  "SHELL:--preload-file /src/include/dolly/runtime.h@/seed/usr/include/dolly/runtime.h"
  "SHELL:--preload-file /src/include/dolly/process.h@/seed/usr/include/dolly/process.h"
  "SHELL:--preload-file /src/include/dolly/toolchain.h@/seed/usr/include/dolly/toolchain.h"
  "SHELL:--preload-file /src/src/slop.c@/seed/usr/src/dolly/slop.c"
  "SHELL:--preload-file /src/src/dollyfile.c@/seed/usr/src/dolly/dollyfile.c"
  "SHELL:--preload-file /src/src/commands/mkdir.c@/seed/usr/src/dolly/commands/mkdir.c"
  "SHELL:--preload-file /src/src/commands/rm.c@/seed/usr/src/dolly/commands/rm.c"
  "SHELL:--preload-file /src/src/process/cc.c@/seed/usr/src/dolly/process-tools/cc.c"
  "SHELL:--preload-file /src/src/process/cxx.c@/seed/usr/src/dolly/process-tools/cxx.c"
  "SHELL:--preload-file /src/src/process/ld.c@/seed/usr/src/dolly/process-tools/ld.c"
  "SHELL:--preload-file /src/src/process/ar.c@/seed/usr/src/dolly/process-tools/ar.c"
  "SHELL:--preload-file /src/src/process/dso-library.c@/seed/usr/src/dolly/process/dso-library.c"
  "SHELL:--preload-file /src/src/process/dso-cpp-library.cpp@/seed/usr/src/dolly/process/dso-cpp-library.cpp"
  "SHELL:--preload-file /src/src/process/dso-cpp-check.cpp@/seed/usr/src/dolly/process/dso-cpp-check.cpp"
  "SHELL:--preload-file /src/build/dolly-kernel-plugin-0.wasm@/seed/usr/lib/dolly/dolly-kernel-plugin-0.wasm"
  "SHELL:--preload-file /src/build/dolly-process-0.wasm@/seed/usr/lib/dolly/dolly-process-0.wasm"
  "SHELL:--preload-file ${DOLLY_PROCESS_SYSROOT_DIR}@/seed/usr/lib/dolly/process"
  "SHELL:--preload-file /src/build/process-bin@/seed/usr/libexec/dolly/process-bin"
)

set_target_properties(dolly PROPERTIES
  OUTPUT_NAME dolly
  SUFFIX .mjs
  RUNTIME_OUTPUT_DIRECTORY /src/dist
)

# The compiler is an ordinary Dolly process, not a callable kernel service.
# Keeping it in its own address space lets the supervisor reclaim every LLVM
# allocation after a compile and terminate a pathological frontend without
# losing the shell or filesystem.
add_executable(dolly-process-compiler
  ../src/compiler.cpp
  ../src/process/compiler-main.c
  "${DOLLY_ZIG_DIR}/src/zig_llvm.cpp"
  "${DOLLY_ZIG_OBJECT}"
)
target_include_directories(dolly-process-compiler PRIVATE
  ../include
  ../build/generated
  ${LLVM_INCLUDE_DIRS}
  ${CLANG_INCLUDE_DIRS}
  ${LLD_INCLUDE_DIRS}
)
target_compile_options(dolly-process-compiler PRIVATE
  -m64
  -O2
  -fno-exceptions
  -fno-rtti
  -fwasm-exceptions
  -matomics
  -mbulk-memory
  -sSUPPORT_LONGJMP=wasm
  -sWASM_LEGACY_EXCEPTIONS=0
)
target_compile_features(dolly-process-compiler PRIVATE cxx_std_17)
target_link_libraries(dolly-process-compiler PRIVATE
  "-Wl,--whole-archive"
  /src/build/libdolly-process.a
  "-Wl,--no-whole-archive"
  ${DOLLY_CLANG_LLD_LIBRARIES}
)
target_link_options(dolly-process-compiler PRIVATE
  -m64
  -O2
  -fwasm-exceptions
  -matomics
  -mbulk-memory
  "SHELL:-Wl,--shared-memory,--no-check-features"
  "SHELL:-Wl,--export=__dolly_dso_allocate,--export=__stack_pointer,--export-table,--growable-table"
  -sSTANDALONE_WASM=1
  -sIMPORTED_MEMORY=1
  -sSHARED_MEMORY=1
  -sSUPPORT_LONGJMP=wasm
  -sWASM_LEGACY_EXCEPTIONS=0
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=33554432
  -sMAXIMUM_MEMORY=8589934592
  -sSTACK_SIZE=8388608
)
set_target_properties(dolly-process-compiler PROPERTIES
  OUTPUT_NAME compiler
  SUFFIX .wasm
  RUNTIME_OUTPUT_DIRECTORY /src/build/process-tools
)

cmake_minimum_required(VERSION 3.20)
project(dolly-runtime LANGUAGES C CXX)

find_package(LLVM REQUIRED CONFIG)
find_package(LLD REQUIRED CONFIG)
find_package(Clang REQUIRED CONFIG)

if(NOT DOLLY_ZIG_DIR OR NOT EXISTS "${DOLLY_ZIG_DIR}/src/zig_llvm.cpp" OR
   NOT EXISTS "${DOLLY_ZIG_DIR}/lib/std/std.zig")
  message(FATAL_ERROR "DOLLY_ZIG_DIR must name the prepared Zig source tree")
endif()

add_executable(dolly
  ../src/dolly.c
  ../src/system-snapshot.c
  ../src/compiler.cpp
  "${DOLLY_ZIG_DIR}/src/zig_llvm.cpp"
)

target_include_directories(dolly PRIVATE
  ../include
  ../build/generated
  ${LLVM_INCLUDE_DIRS}
  ${CLANG_INCLUDE_DIRS}
  ${LLD_INCLUDE_DIRS}
  "${DOLLY_ZIG_DIR}/src"
)
target_compile_options(dolly PRIVATE
  -m64
  -O2
  -fno-exceptions
  -fno-rtti
  -fPIC
  -fvisibility=default
  -matomics
  -mbulk-memory
)
target_compile_features(dolly PRIVATE cxx_std_17)
target_link_libraries(dolly PRIVATE
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
  "SHELL:-Wl,--export=getTempRet0,--export=setTempRet0,--export=__stack_pointer"
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
  "SHELL:-sEXPORTED_RUNTIME_METHODS=FS,FS_createPath,FS_createDataFile"
  "SHELL:-sEXPORTED_FUNCTIONS=@/src/build/runtime-exports.json"
  "SHELL:--js-library /src/src/browser-broker.js"
  "SHELL:--preload-file /src/.cache/emscripten/sysroot/include@/seed/usr/include"
  "SHELL:--preload-file /src/.cache/llvm-wasm/lib/clang/24/include@/seed/usr/lib/clang/24/include"
  "SHELL:--preload-file /src/include/dolly/abi.h@/seed/usr/include/dolly/abi.h"
  "SHELL:--preload-file /src/include/dolly/http.h@/seed/usr/include/dolly/http.h"
  "SHELL:--preload-file /src/include/dolly/display.h@/seed/usr/include/dolly/display.h"
  "SHELL:--preload-file /src/include/dolly/download.h@/seed/usr/include/dolly/download.h"
  "SHELL:--preload-file /src/include/dolly/runtime.h@/seed/usr/include/dolly/runtime.h"
  "SHELL:--preload-file /src/include/dolly/toolchain.h@/seed/usr/include/dolly/toolchain.h"
  "SHELL:--preload-file /src/src/slop.c@/seed/usr/src/dolly/slop.c"
  "SHELL:--preload-file /src/src/dollyfile.c@/seed/usr/src/dolly/dollyfile.c"
  "SHELL:--preload-file /src/src/commands/mkdir.c@/seed/usr/src/dolly/commands/mkdir.c"
  "SHELL:--preload-file /src/src/commands/rm.c@/seed/usr/src/dolly/commands/rm.c"
  "SHELL:--preload-file /src/src/commands/cc.c@/seed/usr/src/dolly/commands/cc.c"
  "SHELL:--preload-file /src/src/commands/c++.c@/seed/usr/src/dolly/commands/c++.c"
  "SHELL:--preload-file /src/src/commands/ld.c@/seed/usr/src/dolly/commands/ld.c"
  "SHELL:--preload-file /src/src/commands/ar.c@/seed/usr/src/dolly/commands/ar.c"
  "SHELL:--preload-file /src/build/dolly-0.wasm@/seed/usr/lib/dolly/dolly-0.wasm"
)

set_target_properties(dolly PROPERTIES
  OUTPUT_NAME dolly
  SUFFIX .mjs
  RUNTIME_OUTPUT_DIRECTORY /src/dist
)

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
  ../src/upload.c
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
set(DOLLY_LLVM_LIBRARIES
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

target_link_options(dolly PRIVATE
  -m64
  -O2
  -fPIC
  -matomics
  -mbulk-memory
  "SHELL:-Wl,--shared-memory,--no-check-features"
  "SHELL:-Wl,--export=getTempRet0,--export=setTempRet0,--export=__stack_pointer,--export=__stack_high,--export=__stack_low"
  # Resident Wasm bytes are instantiated by the small boot loader. The kernel
  # has no general dlopen/dlsym JavaScript capability or dynamic JS evaluation.
  "SHELL:-Wl,--export-table,--growable-table"
  -sDYNAMIC_EXECUTION=0
  -sWASMFS
  -sFORCE_FILESYSTEM=1
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
  "SHELL:-sEXPORTED_RUNTIME_METHODS=FS,FS_createPath,FS_createDataFile,addRunDependency,removeRunDependency"
  "SHELL:-sEXPORTED_FUNCTIONS=@/src/build/runtime-exports.json"
  "SHELL:--js-library /src/src/browser-broker.js"
)

# Only a root rebuild needs this bundle. Restored images already contain their
# compiler and tools, so kernel instantiation must not preload the seed.
add_custom_target(dolly-seed
  COMMAND bash /src/scripts/prepare-kernel-seed.sh
    /src/.cache/emscripten/sysroot/include@/seed/usr/include
    /src/build/generated/libclang_rt.dolly.a@/seed/usr/lib/libclang_rt.builtins.a
    /src/.cache/llvm-wasm/lib/clang/24/include@/seed/usr/lib/clang/24/include
    /src/include/dolly/http.h@/seed/usr/include/dolly/http.h
    /src/include/dolly/display.h@/seed/usr/include/dolly/display.h
    /src/include/dolly/download.h@/seed/usr/include/dolly/download.h
    /src/include/dolly/runtime.h@/seed/usr/include/dolly/runtime.h
    /src/include/dolly/process.h@/seed/usr/include/dolly/process.h
    /src/include/dolly/toolchain.h@/seed/usr/include/dolly/toolchain.h
    /src/src/slop.c@/seed/usr/src/dolly/slop.c
    /src/src/dollyfile.c@/seed/usr/src/dolly/dollyfile.c
    /src/src/sha256.h@/seed/usr/src/dolly/sha256.h
    /src/src/fs-record.h@/seed/usr/src/dolly/fs-record.h
    /src/src/commands/mkdir.c@/seed/usr/src/dolly/commands/mkdir.c
    /src/src/commands/rm.c@/seed/usr/src/dolly/commands/rm.c
    /src/src/process/cc.c@/seed/usr/src/dolly/process-tools/cc.c
    /src/src/process/cxx.c@/seed/usr/src/dolly/process-tools/cxx.c
    /src/src/process/ld.c@/seed/usr/src/dolly/process-tools/ld.c
    /src/src/process/ar.c@/seed/usr/src/dolly/process-tools/ar.c
    /src/build/dolly-kernel-plugin-0.wasm@/seed/usr/lib/dolly/dolly-kernel-plugin-0.wasm
    /src/build/dolly-process-0.wasm@/seed/usr/lib/dolly/dolly-process-0.wasm
    ${DOLLY_PROCESS_SYSROOT_DIR}@/seed/usr/lib/dolly/process
    /src/build/process-bin/bootstrap@/seed/usr/libexec/dolly/process-bin/bootstrap
    /src/build/process-bin/compiler@/seed/usr/libexec/dolly/process-bin/compiler
  VERBATIM
)
add_dependencies(dolly dolly-seed)

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
)
target_link_libraries(dolly-process-compiler PRIVATE
  clangFrontendTool clangCodeGen clangFrontend clangBasic
)
add_executable(dolly-process-zig
  ../src/process/zig.c
  "${DOLLY_ZIG_DIR}/src/zig_llvm.cpp"
  "${DOLLY_ZIG_OBJECT}"
)
foreach(tool compiler zig)
  target_include_directories(dolly-process-${tool} PRIVATE
    ../include
    ../build/generated
    ${LLVM_INCLUDE_DIRS}
    ${CLANG_INCLUDE_DIRS}
    ${LLD_INCLUDE_DIRS}
  )
  target_compile_options(dolly-process-${tool} PRIVATE
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
  target_compile_features(dolly-process-${tool} PRIVATE cxx_std_17)
  target_link_libraries(dolly-process-${tool} PRIVATE
    /src/build/process-crt1.o
    "-Wl,--whole-archive"
    /src/build/libdolly-process.a
    "-Wl,--no-whole-archive"
    ${DOLLY_LLVM_LIBRARIES}
  )
  target_link_options(dolly-process-${tool} PRIVATE
    -nostartfiles
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
  set_target_properties(dolly-process-${tool} PROPERTIES
    OUTPUT_NAME ${tool}
    SUFFIX .wasm
    RUNTIME_OUTPUT_DIRECTORY /src/build/process-tools
  )
endforeach()

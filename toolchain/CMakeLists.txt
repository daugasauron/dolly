cmake_minimum_required(VERSION 3.20)
project(dolly-runtime LANGUAGES C CXX)

find_package(LLVM REQUIRED CONFIG)
find_package(LLD REQUIRED CONFIG)
find_package(Clang REQUIRED CONFIG)

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
  -fPIC
  -fvisibility=default
  -matomics
  -mbulk-memory
  # Like WasmFS itself; a throw would import __cxa_throw from JavaScript.
  $<$<COMPILE_LANGUAGE:CXX>:-fno-exceptions>
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

# Only a root rebuild needs this bundle. Restored images already contain their
# compiler and tools, so kernel instantiation must not preload the seed.
add_custom_target(dolly-seed
  COMMAND bash /src/scripts/prepare-kernel-seed.sh
    /src/build/generated/libclang_rt.dolly.a@/seed/usr/lib/libclang_rt.builtins.a
    /src/.cache/llvm-wasm/lib/clang/24/include@/seed/usr/lib/clang/24/include
    /src/build/include/dolly@/seed/usr/include/dolly
    /src/src/dollyfile.c@/seed/usr/src/dolly/dollyfile.c
    /src/src/sha256.h@/seed/usr/src/dolly/sha256.h
    /src/src/fs-record.h@/seed/usr/src/dolly/fs-record.h
    /src/build/dolly-kernel-plugin-0.wasm@/seed/usr/lib/dolly/dolly-kernel-plugin-0.wasm
    ${DOLLY_PROCESS_SYSROOT_DIR}@/seed/usr/lib/dolly/process
    /src/build/process-bin/bootstrap@/seed/usr/libexec/dolly/process-bin/bootstrap
    /src/build/process-bin/compiler@/seed/usr/libexec/dolly/process-bin/compiler
  VERBATIM
)
add_dependencies(dolly dolly-seed)

set_target_properties(dolly PROPERTIES
  OUTPUT_NAME dolly
  SUFFIX .wasm
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
# A new process contract restamps the tool, so relink it to drop the old stamp.
set_property(TARGET dolly-process-compiler APPEND PROPERTY
  LINK_DEPENDS /src/build/generated/dolly-process-abi-digest.h)
target_include_directories(dolly-process-compiler PRIVATE
  ../build/include
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
  /src/build/process-crt1.o
  "-Wl,--whole-archive"
  /src/build/libdolly-process.a
  "-Wl,--no-whole-archive"
  ${DOLLY_CLIENT_LIBRARIES}
  ${DOLLY_LLVM_LIBRARIES}
)
target_link_options(dolly-process-compiler PRIVATE
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
set_target_properties(dolly-process-compiler PROPERTIES
  OUTPUT_NAME compiler
  SUFFIX .wasm
  RUNTIME_OUTPUT_DIRECTORY /src/build/process-tools
)

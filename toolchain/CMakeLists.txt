cmake_minimum_required(VERSION 3.20)
project(dolly-runtime LANGUAGES C CXX)

find_package(LLVM REQUIRED CONFIG)
find_package(LLD REQUIRED CONFIG)
find_package(Clang REQUIRED CONFIG)

if(NOT DOLLY_SBASE_DIR OR NOT EXISTS "${DOLLY_SBASE_DIR}/grep.c")
  message(FATAL_ERROR "DOLLY_SBASE_DIR must name the pinned sbase checkout")
endif()
if(NOT DOLLY_AWK_DIR OR NOT EXISTS "${DOLLY_AWK_DIR}/awkgram.y")
  message(FATAL_ERROR "DOLLY_AWK_DIR must name the pinned AWK checkout")
endif()
if(NOT DOLLY_AWK_GENERATED_DIR OR
   NOT EXISTS "${DOLLY_AWK_GENERATED_DIR}/awkgram.tab.c" OR
   NOT EXISTS "${DOLLY_AWK_GENERATED_DIR}/awkgram.tab.h")
  message(FATAL_ERROR "DOLLY_AWK_GENERATED_DIR must contain the pinned Bison output")
endif()
if(NOT DOLLY_QUICKJS_DIR OR NOT EXISTS "${DOLLY_QUICKJS_DIR}/quickjs.c")
  message(FATAL_ERROR "DOLLY_QUICKJS_DIR must name the pinned QuickJS-ng checkout")
endif()
if(NOT DOLLY_CURL_DIR OR NOT EXISTS "${DOLLY_CURL_DIR}/include/curl/curl.h")
  message(FATAL_ERROR "DOLLY_CURL_DIR must name the pinned curl checkout")
endif()
if(NOT DOLLY_ZLIB_DIR OR NOT EXISTS "${DOLLY_ZLIB_DIR}/zlib.h")
  message(FATAL_ERROR "DOLLY_ZLIB_DIR must name the prepared zlib source tree")
endif()
if(NOT DOLLY_GIT_DIR OR NOT EXISTS "${DOLLY_GIT_DIR}/dolly-sources.txt")
  message(FATAL_ERROR "DOLLY_GIT_DIR must name the prepared Git source tree")
endif()
if(NOT DOLLY_MAKE_DIR OR NOT EXISTS "${DOLLY_MAKE_DIR}/dolly-sources.txt")
  message(FATAL_ERROR "DOLLY_MAKE_DIR must name the prepared GNU Make source tree")
endif()
if(NOT DOLLY_ZIG_DIR OR NOT EXISTS "${DOLLY_ZIG_DIR}/stage1/zig1.wasm" OR
   NOT EXISTS "${DOLLY_ZIG_DIR}/lib/std/std.zig")
  message(FATAL_ERROR "DOLLY_ZIG_DIR must name the pinned Zig source tree")
endif()
if(NOT DOLLY_WAMR_DIR OR
   NOT EXISTS "${DOLLY_WAMR_DIR}/core/iwasm/include/wasm_export.h")
  message(FATAL_ERROR "DOLLY_WAMR_DIR must name the pinned WAMR source tree")
endif()
if(NOT DOLLY_GHOSTTY_DIR OR NOT EXISTS "${DOLLY_GHOSTTY_DIR}/.dolly-source" OR
   NOT EXISTS "${DOLLY_GHOSTTY_DIR}/src/lib_vt.zig")
  message(FATAL_ERROR "DOLLY_GHOSTTY_DIR must name the prepared Ghostty source tree")
endif()
if(NOT DOLLY_UUCODE_DIR OR NOT EXISTS "${DOLLY_UUCODE_DIR}/src/root.zig")
  message(FATAL_ERROR "DOLLY_UUCODE_DIR must name the pinned uucode source tree")
endif()
if(NOT DOLLY_LUA_WASM OR NOT EXISTS "${DOLLY_LUA_WASM}")
  message(FATAL_ERROR "DOLLY_LUA_WASM must name the compiled Lua bootstrap module")
endif()

add_executable(dolly
  ../src/dolly.c
  ../src/compiler.cpp
)

target_include_directories(dolly PRIVATE
  ../include
  ../build/generated
  ${LLVM_INCLUDE_DIRS}
  ${CLANG_INCLUDE_DIRS}
  ${LLD_INCLUDE_DIRS}
)
target_compile_options(dolly PRIVATE
  -m64
  -O2
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
  LLVMObject
)

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
  "SHELL:-sEXPORTED_RUNTIME_METHODS=ccall,FS"
  "SHELL:-sEXPORTED_FUNCTIONS=@/src/build/runtime-exports.json"
  "SHELL:--js-library /src/src/browser-broker.js"
  "SHELL:--preload-file /src/.cache/emscripten/sysroot/include@/usr/include"
  "SHELL:--preload-file /src/.cache/llvm-wasm/lib/clang/24/include@/usr/lib/clang/24/include"
  "SHELL:--preload-file /src/include/dolly/abi.h@/usr/include/dolly/abi.h"
  "SHELL:--preload-file /src/include/dolly/http.h@/usr/include/dolly/http.h"
  "SHELL:--preload-file /src/include/dolly/runtime.h@/usr/include/dolly/runtime.h"
  "SHELL:--preload-file /src/include/dolly/toolchain.h@/usr/include/dolly/toolchain.h"
  "SHELL:--preload-file /src/src/slop.c@/usr/src/dolly/slop.c"
  "SHELL:--preload-file /src/src/startup.slop@/etc/dolly/startup.slop"
  "SHELL:--preload-file /src/src/startup.mk@/usr/src/dolly/startup.mk"
  "SHELL:--preload-file /src/build/dolly-0.wasm@/usr/lib/dolly/dolly-0.wasm"
  "SHELL:--preload-file /src/src/commands/help.c@/usr/src/dolly/commands/help.c"
  "SHELL:--preload-file /src/src/commands/pwd.c@/usr/src/dolly/commands/pwd.c"
  "SHELL:--preload-file /src/src/commands/cd.c@/usr/src/dolly/commands/cd.c"
  "SHELL:--preload-file /src/src/commands/cat.c@/usr/src/dolly/commands/cat.c"
  "SHELL:--preload-file /src/src/commands/echo.c@/usr/src/dolly/commands/echo.c"
  "SHELL:--preload-file /src/src/commands/mkdir.c@/usr/src/dolly/commands/mkdir.c"
  "SHELL:--preload-file /src/src/commands/touch.c@/usr/src/dolly/commands/touch.c"
  "SHELL:--preload-file /src/src/commands/rm.c@/usr/src/dolly/commands/rm.c"
  "SHELL:--preload-file /src/src/commands/clear.c@/usr/src/dolly/commands/clear.c"
  "SHELL:--preload-file /src/src/commands/ls.c@/usr/src/dolly/commands/ls.c"
  "SHELL:--preload-file /src/src/commands/cc.c@/usr/src/dolly/commands/cc.c"
  "SHELL:--preload-file /src/src/commands/c++.c@/usr/src/dolly/commands/c++.c"
  "SHELL:--preload-file /src/src/commands/ld.c@/usr/src/dolly/commands/ld.c"
  "SHELL:--preload-file /src/src/commands/ar.c@/usr/src/dolly/commands/ar.c"
  "SHELL:--preload-file /src/src/commands/curl.c@/usr/src/dolly/commands/curl.c"
  "SHELL:--preload-file /src/src/libcurl-fetch.c@/usr/src/dolly/libcurl-fetch.c"
  "SHELL:--preload-file ${DOLLY_CURL_DIR}/include/curl@/usr/include/curl"
  "SHELL:--preload-file ${DOLLY_CURL_DIR}/COPYING@/usr/share/licenses/curl/COPYING"
  "SHELL:--preload-file ${DOLLY_ZLIB_DIR}@/usr/src/zlib"
  "SHELL:--preload-file ${DOLLY_ZLIB_DIR}/zlib.h@/usr/include/zlib.h"
  "SHELL:--preload-file ${DOLLY_ZLIB_DIR}/zconf.h@/usr/include/zconf.h"
  "SHELL:--preload-file ${DOLLY_ZLIB_DIR}/LICENSE@/usr/share/licenses/zlib/LICENSE"
  "SHELL:--preload-file ${DOLLY_GIT_DIR}@/usr/src/git"
  "SHELL:--preload-file ${DOLLY_GIT_DIR}/templates@/usr/share/git-core/templates"
  "SHELL:--preload-file ${DOLLY_GIT_DIR}/COPYING@/usr/share/licenses/git/COPYING"
  "SHELL:--preload-file ${DOLLY_MAKE_DIR}@/usr/src/make"
  "SHELL:--preload-file ${DOLLY_MAKE_DIR}/COPYING@/usr/share/licenses/make/COPYING"
  # The preloaded-file backend must materialize this output directory before
  # startup. The hidden marker is outside PATH and is never an executable.
  "SHELL:--preload-file ${DOLLY_GIT_DIR}/COPYING@/usr/libexec/git-core/.bootstrap"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/grep.c@/usr/src/sbase/grep.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/head.c@/usr/src/sbase/head.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/sed.c@/usr/src/sbase/sed.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/wc.c@/usr/src/sbase/wc.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/queue.h@/usr/src/sbase/queue.h"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/util.h@/usr/src/sbase/util.h"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/utf.h@/usr/src/sbase/utf.h"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/arg.h@/usr/src/sbase/arg.h"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/compat.h@/usr/src/sbase/compat.h"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutil/ealloc.c@/usr/src/sbase/libutil/ealloc.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutil/eprintf.c@/usr/src/sbase/libutil/eprintf.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutil/eregcomp.c@/usr/src/sbase/libutil/eregcomp.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutil/fshut.c@/usr/src/sbase/libutil/fshut.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutil/reallocarray.c@/usr/src/sbase/libutil/reallocarray.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutil/strlcat.c@/usr/src/sbase/libutil/strlcat.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutil/strcasestr.c@/usr/src/sbase/libutil/strcasestr.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutil/strtonum.c@/usr/src/sbase/libutil/strtonum.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutf/fgetrune.c@/usr/src/sbase/libutf/fgetrune.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutf/isdigitrune.c@/usr/src/sbase/libutf/isdigitrune.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutf/isspacerune.c@/usr/src/sbase/libutf/isspacerune.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutf/rune.c@/usr/src/sbase/libutf/rune.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutf/runetype.c@/usr/src/sbase/libutf/runetype.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutf/runetype.h@/usr/src/sbase/libutf/runetype.h"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/libutf/utf.c@/usr/src/sbase/libutf/utf.c"
  "SHELL:--preload-file ${DOLLY_SBASE_DIR}/LICENSE@/usr/share/licenses/sbase/LICENSE"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/awk.h@/usr/src/awk/awk.h"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/awkgram.y@/usr/src/awk/awkgram.y"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/b.c@/usr/src/awk/b.c"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/lex.c@/usr/src/awk/lex.c"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/lib.c@/usr/src/awk/lib.c"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/main.c@/usr/src/awk/main.c"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/maketab.c@/usr/src/awk/maketab.c"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/parse.c@/usr/src/awk/parse.c"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/proto.h@/usr/src/awk/proto.h"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/run.c@/usr/src/awk/run.c"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/tran.c@/usr/src/awk/tran.c"
  "SHELL:--preload-file ${DOLLY_AWK_GENERATED_DIR}/awkgram.tab.c@/usr/src/awk/awkgram.tab.c"
  "SHELL:--preload-file ${DOLLY_AWK_GENERATED_DIR}/awkgram.tab.h@/usr/src/awk/awkgram.tab.h"
  "SHELL:--preload-file ${DOLLY_AWK_DIR}/LICENSE@/usr/share/licenses/awk/LICENSE"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/builtin-array-fromasync.h@/usr/src/quickjs/builtin-array-fromasync.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/builtin-iterator-zip-keyed.h@/usr/src/quickjs/builtin-iterator-zip-keyed.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/builtin-iterator-zip.h@/usr/src/quickjs/builtin-iterator-zip.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/cutils.h@/usr/src/quickjs/cutils.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/dtoa.c@/usr/src/quickjs/dtoa.c"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/dtoa.h@/usr/src/quickjs/dtoa.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/libregexp-opcode.h@/usr/src/quickjs/libregexp-opcode.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/libregexp.c@/usr/src/quickjs/libregexp.c"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/libregexp.h@/usr/src/quickjs/libregexp.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/libunicode-table.h@/usr/src/quickjs/libunicode-table.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/libunicode.c@/usr/src/quickjs/libunicode.c"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/libunicode.h@/usr/src/quickjs/libunicode.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/list.h@/usr/src/quickjs/list.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/quickjs-atom.h@/usr/src/quickjs/quickjs-atom.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/quickjs-c-atomics.h@/usr/src/quickjs/quickjs-c-atomics.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/quickjs-opcode.h@/usr/src/quickjs/quickjs-opcode.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/quickjs.c@/usr/src/quickjs/quickjs.c"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/quickjs.h@/usr/src/quickjs/quickjs.h"
  "SHELL:--preload-file ${DOLLY_QUICKJS_DIR}/LICENSE@/usr/share/licenses/quickjs-ng/LICENSE"
  "SHELL:--preload-file /src/src/runtimes/quickjs-main.c@/usr/src/dolly/runtimes/quickjs-main.c"
  "SHELL:--preload-file /src/src/runtimes/quickjs-runner.h@/usr/src/dolly/runtimes/quickjs-runner.h"
  "SHELL:--preload-file /src/src/runtimes/dolly-node.js@/usr/lib/dolly/node.js"
  "SHELL:--preload-file /src/src/commands/qjs.c@/usr/src/dolly/commands/qjs.c"
  "SHELL:--preload-file /src/src/commands/pi.c@/usr/src/dolly/commands/pi.c"
  "SHELL:--preload-file /src/src/runtimes/pi-dolly.js@/usr/src/dolly/runtimes/pi-dolly.js"
  "SHELL:--preload-file /src/build/generated/pi.js@/usr/lib/pi/pi.js"
  "SHELL:--preload-file /src/build/generated/pi-metadata/package.json@/usr/share/pi/package.json"
  "SHELL:--preload-file /src/build/generated/pi-metadata/README.md@/usr/share/pi/README.md"
  "SHELL:--preload-file ${DOLLY_ZIG_DIR}/stage1@/usr/src/zig/stage1"
  "SHELL:--preload-file ${DOLLY_ZIG_DIR}/lib/std@/usr/lib/zig/std"
  "SHELL:--preload-file ${DOLLY_ZIG_DIR}/lib/zig.h@/usr/lib/zig/zig.h"
  "SHELL:--preload-file ${DOLLY_ZIG_DIR}/LICENSE@/usr/share/licenses/zig/LICENSE"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/iwasm/common@/usr/src/wamr/core/iwasm/common"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/iwasm/aot@/usr/src/wamr/core/iwasm/aot"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/iwasm/compilation@/usr/src/wamr/core/iwasm/compilation"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/iwasm/include@/usr/src/wamr/core/iwasm/include"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/iwasm/interpreter@/usr/src/wamr/core/iwasm/interpreter"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/shared/mem-alloc@/usr/src/wamr/core/shared/mem-alloc"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/shared/platform/include@/usr/src/wamr/core/shared/platform/include"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/shared/utils@/usr/src/wamr/core/shared/utils"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/config.h@/usr/src/wamr/core/config.h"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/core/version.h@/usr/src/wamr/core/version.h"
  "SHELL:--preload-file ${DOLLY_WAMR_DIR}/LICENSE@/usr/share/licenses/wamr/LICENSE"
  "SHELL:--preload-file /src/src/commands/zig.c@/usr/src/dolly/commands/zig.c"
  "SHELL:--preload-file /src/src/runtimes/zig1-wamr.c@/usr/src/dolly/runtimes/zig1-wamr.c"
  "SHELL:--preload-file /src/src/runtimes/wamr-platform@/usr/src/dolly/runtimes/wamr-platform"
  "SHELL:--preload-file /src/src/zig/answer.zig@/usr/src/dolly/zig/answer.zig"
  "SHELL:--preload-file /src/src/zig/check.c@/usr/src/dolly/zig/check.c"
  "SHELL:--preload-file /src/src/zig/include/zig.h@/usr/src/dolly/zig/include/zig.h"
  "SHELL:--preload-file ${DOLLY_GHOSTTY_DIR}/src@/usr/src/ghostty/src"
  "SHELL:--preload-file ${DOLLY_GHOSTTY_DIR}/include/ghostty@/usr/include/ghostty"
  "SHELL:--preload-file ${DOLLY_GHOSTTY_DIR}/include/ghostty.h@/usr/include/ghostty.h"
  "SHELL:--preload-file ${DOLLY_GHOSTTY_DIR}/LICENSE@/usr/share/licenses/ghostty/LICENSE"
  "SHELL:--preload-file ${DOLLY_UUCODE_DIR}/src@/usr/src/uucode/src"
  "SHELL:--preload-file ${DOLLY_UUCODE_DIR}/LICENSE.md@/usr/share/licenses/uucode/LICENSE.md"
  "SHELL:--preload-file /src/src/ghostty/generated@/usr/src/ghostty/generated"
  "SHELL:--preload-file /src/src/ghostty/check.c@/usr/src/dolly/ghostty/check.c"
  "SHELL:--preload-file /src/src/program-cpp.cpp@/usr/src/dolly/cpp-check.cpp"
  "SHELL:--preload-file /src/src/program-demo.c@/usr/src/dolly/demo.c"
  "SHELL:--preload-file ${DOLLY_LUA_WASM}@/usr/bin/lua"
  "SHELL:--preload-file /src/build/program-writer.wasm@/usr/libexec/dolly/writer"
  "SHELL:--preload-file /src/build/program-reader.wasm@/usr/libexec/dolly/reader"
  "SHELL:--preload-file /src/build/program-inspector.wasm@/usr/libexec/dolly/inspector"
)

set_target_properties(dolly PROPERTIES
  OUTPUT_NAME dolly
  SUFFIX .mjs
  RUNTIME_OUTPUT_DIRECTORY /src/dist
)

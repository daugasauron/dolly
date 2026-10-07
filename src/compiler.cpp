#include <algorithm>
#include <cerrno>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <limits.h>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include <clang/Basic/Diagnostic.h>
#include <clang/Basic/DiagnosticIDs.h>
#include <clang/Basic/DiagnosticOptions.h>
#include <clang/CodeGen/ObjectFilePCHContainerWriter.h>
#include <clang/Frontend/CompilerInstance.h>
#include <clang/Frontend/CompilerInvocation.h>
#include <clang/Frontend/TextDiagnosticBuffer.h>
#include <clang/FrontendTool/Utils.h>
#include <clang/Serialization/ObjectFilePCHContainerReader.h>
#include <clang/Serialization/PCHContainerOperations.h>
#include <lld/Common/Driver.h>
#include <llvm/ADT/ArrayRef.h>
#include <llvm/ADT/STLExtras.h>
#include <llvm/ADT/SmallString.h>
#include <llvm/ADT/SmallVector.h>
#include <llvm/BinaryFormat/Wasm.h>
#include <llvm/Object/Archive.h>
#include <llvm/Object/ArchiveWriter.h>
#include <llvm/Object/Wasm.h>
#include <llvm/Support/Error.h>
#include <llvm/Support/CommandLine.h>
#include <llvm/Support/FileSystem.h>
#include <llvm/Support/MemoryBuffer.h>
#include <llvm/Support/Path.h>
#include <llvm/Support/StringSaver.h>
#include <llvm/Support/TargetSelect.h>
#include <llvm/Support/VirtualFileSystem.h>
#include <llvm/Support/raw_ostream.h>

#include <dolly/host-abi.h>
#include <dolly/toolchain.h>

#include "dolly-kernel-plugin-abi-digest.h"
#include "dolly-process-abi-digest.h"

LLD_HAS_DRIVER(wasm)

namespace {

constexpr const char *kKernelContractPath =
    "/usr/lib/dolly/dolly-kernel-plugin-0.wasm";
constexpr const char *kProcessSysroot = "/usr/lib/dolly/process";
constexpr const char *kProcessDynamicProviderSymbols =
    "/usr/lib/dolly/process/dynamic-provider.symbols";
constexpr uint64_t kProcessInitialMemoryPages = 256;
constexpr uint64_t kProcessMaximumMemoryPages = 131072;

enum class DebugInfoKind {
  None,
  LineTables,
  Full,
};

struct DriverOptions {
  bool compile_only = false;
  bool preprocess_only = false;
  bool dump_macros = false;
  bool linker_version = false;
  bool print_search_dirs = false;
  bool dependency_output = false;
  bool include_system_dependencies = false;
  bool phony_dependencies = false;
  bool end_options = false;
  bool exceptions_disabled = false;
  bool optimization_selected = false;
  bool export_dynamic = false;
  bool kernel_plugin = false;
  bool shared_library = false;
  bool link_cxx_runtime = false;
  bool no_standard_cxx_runtime = false;
  bool pic = true;
  bool standard_selected = false;
  bool unsigned_char = false;
  bool pthread = false;
  std::string thread_model;
  DebugInfoKind debug_info = DebugInfoKind::None;
  std::string output;
  std::string forced_language;
  std::string dependency_file;
  std::string dependency_target;
  std::vector<std::string> frontend_options;
  std::vector<std::string> inputs;
  std::vector<std::string> linker_options;
};

struct LoadedWasm {
  std::unique_ptr<llvm::MemoryBuffer> bytes;
  std::unique_ptr<llvm::object::WasmObjectFile> object;
};

bool starts_with(const std::string &text, const char *prefix) {
  return text.rfind(prefix, 0) == 0;
}

bool ends_with(const std::string &text, const char *suffix) {
  const size_t suffix_length = std::strlen(suffix);
  return text.size() >= suffix_length &&
         text.compare(text.size() - suffix_length, suffix_length, suffix) == 0;
}

bool is_language(const std::string &language) {
  return language == "c" || language == "c++";
}

bool is_linker_option(const std::string &argument) {
  return starts_with(argument, "-L") || starts_with(argument, "-l");
}

bool is_implicit_process_runtime_library(const std::string &name) {
  return name == "c" || name == "m" || name == "dl" || name == "rt" ||
      name == "pthread" || name == "util";
}

void add_library(DriverOptions &options, const std::string &name,
                 std::vector<std::string> &arguments) {
  if (name == "c++" || name == "c++abi") {
    options.link_cxx_runtime = true;
  } else if (!is_implicit_process_runtime_library(name)) {
    arguments.push_back("-l" + name);
  }
}

// Like Clang, classify inputs by suffix: C, C++ and assembly sources are compiled and
// every other input (objects, archives, shared objects, unknown files) is
// passed to the linker. `-x` selects the language of non-object inputs.
std::string source_language(const std::string &input, int default_language,
                            const std::string &forced_language) {
  if (is_linker_option(input) || ends_with(input, ".o") || ends_with(input, ".a")) {
    return "";
  }
  if (!forced_language.empty()) return forced_language;
  if (input == "-" || ends_with(input, ".c")) {
    return default_language == DOLLY_TOOLCHAIN_CXX ? "c++" : "c";
  }
  for (const char *suffix : {".cc", ".cp", ".cpp", ".cxx", ".c++", ".C", ".CPP"}) {
    if (ends_with(input, suffix)) return "c++";
  }
  if (ends_with(input, ".S") || ends_with(input, ".sx")) return "assembler-with-cpp";
  if (ends_with(input, ".s")) return "assembler";
  return "";
}

std::string input_stem(const std::string &input) {
  const llvm::StringRef name = llvm::sys::path::filename(input);
  return name.substr(0, name.rfind('.')).str();
}

std::string dependency_file(const DriverOptions &options, const std::string &source) {
  if (!options.dependency_file.empty()) return options.dependency_file;
  if (options.output.empty()) return input_stem(source) + ".d";
  llvm::SmallString<128> path(options.output);
  llvm::sys::path::replace_extension(path, "d");
  return path.str().str();
}

std::string dependency_target(const DriverOptions &options, const std::string &source) {
  if (!options.dependency_target.empty()) return options.dependency_target;
  return options.output.empty() ? input_stem(source) + ".o" : options.output;
}

// Concurrent compilers share /tmp, so scratch files are named by a hash of the
// absolute output path. wasm-ld records the staged file's name in the name
// section, so a job must also get the same names in every build.
std::string temporary_path(const std::string &output, size_t index,
                           const char *suffix) {
  llvm::SmallString<256> absolute(output);
  llvm::sys::fs::make_absolute(absolute);
  char path[128];
  std::snprintf(path, sizeof(path), "/tmp/dolly-cc-%016llx-%zu%s",
                static_cast<unsigned long long>(llvm::xxh3_64bits(absolute.str())),
                index, suffix);
  return path;
}

void print_help(const char *program, int driver_mode) {
  if (driver_mode == DOLLY_TOOLCHAIN_LD) {
    std::printf("usage: %s [-o FILE] [-L DIR] [-l NAME] INPUT.o|INPUT.a...\n",
                program);
    return;
  }
  if (driver_mode == DOLLY_TOOLCHAIN_AR) {
    std::printf("usage: %s rcs|cq ARCHIVE MEMBER.o...\n       %s s ARCHIVE\n", program, program);
    return;
  }
  std::printf(
      "usage: %s [OPTIONS] INPUT...\n"
      "  -c                 compile one source file without linking\n"
      "  -E                 preprocess one source file without compiling\n"
      "  -dM                print macro definitions in -E mode\n"
      "  -P                 omit line markers from preprocessor output\n"
      "  -shared            build a process-local shared object\n"
      "  --dolly-kernel-plugin\n"
      "                     build the explicitly privileged display plugin\n"
      "  -rdynamic          host shared objects: export the program's symbols and\n"
      "                     load them with dlopen (needs REQUIRES HOST dso@0)\n"
      "  -o FILE            write the object or executable to FILE\n"
      "  -L DIR, -l NAME    link libNAME.a from DIR; /usr/lib is always searched.\n"
      "                     <dolly/NAME.h> host clients (libdolly-NAME.a in\n"
      "                     /usr/lib/dolly/process) and libc are linked without -l\n"
      "  -pthread           link the thread runtime (pthreads, C++ threads)\n"
      "  -x c|c++           override source language\n"
      "  -std=STANDARD      select a C or C++ language standard\n"
      "  -O0|-O1|-O2|-O3|-Os|-Oz\n"
      "                     select optimization level\n"
      "  -I DIR, -D NAME, -U NAME, -include FILE\n"
      "                     pass a preprocessing option\n"
      "  -funsigned-char    use unsigned plain char\n"
      "  -fexceptions       enable C++ exception throwing and catching\n"
      "  -fno-exceptions    compile C++ without exception throwing or catching\n"
      "  -fno-rtti          compile C++ without runtime type information\n"
      "  -Wall, -Wextra, -Werror, -Wno-NAME\n"
      "                     configure diagnostics\n"
      "  --help             display this help\n"
      "  --version          display the embedded toolchain version\n"
      "  --print-search-dirs display target program and library search paths\n",
      program);
}

bool take_option_value(int argc, const char *const *argv, int &index,
                       const char *option, std::string &value) {
  if (index + 1 >= argc) {
    std::fprintf(stderr, "%s: %s requires an argument\n", argv[0], option);
    return false;
  }
  value = argv[++index];
  return true;
}

int parse_driver_options(int argc, const char *const *argv, DriverOptions &options,
                         int driver_mode) {
  for (int index = 1; index < argc; index++) {
    std::string argument = argv[index];
    if (options.end_options) {
      options.inputs.push_back(argument);
    } else if (argument == "--") {
      options.end_options = true;
    } else if (argument == "--help") {
      print_help(argv[0], driver_mode);
      return 1;
    } else if (argument == "--version") {
      std::puts("dolly toolchain: Clang/LLD 24, wasm64-unknown-dolly");
      return 1;
    } else if (argument == "-dumpmachine") {
      std::puts("wasm64-unknown-dolly");
      return 1;
    } else if (argument == "--print-search-dirs") {
      options.print_search_dirs = true;
    } else if (argument == "-c") {
      options.compile_only = true;
    } else if (argument == "-E") {
      options.preprocess_only = true;
    } else if (argument == "-dM") {
      options.dump_macros = true;
    } else if (argument == "-P" || argument == "-v") {
      // Both are cc1 spellings as well as public driver options. Meson uses
      // -P for header probes and -v to discover the target include search.
      options.frontend_options.push_back(argument);
    } else if (argument == "-MD" || argument == "-MMD") {
      options.dependency_output = true;
      options.include_system_dependencies = argument == "-MD";
    } else if (argument == "-MP") {
      options.phony_dependencies = true;
    } else if (argument == "-MF") {
      if (!take_option_value(argc, argv, index, "-MF",
                             options.dependency_file)) return -1;
    } else if (argument == "-MQ" || argument == "-MT") {
      if (!take_option_value(argc, argv, index, argument.c_str(),
                             options.dependency_target)) return -1;
    } else if (argument == "-shared") {
      options.shared_library = true;
    } else if (argument == "--dolly-kernel-plugin") {
      options.kernel_plugin = true;
    } else if (argument == "-rdynamic") {
      options.export_dynamic = true;
    } else if (argument == "-o") {
      if (!take_option_value(argc, argv, index, "-o", options.output)) return -1;
    } else if (starts_with(argument, "-o") && argument.size() > 2) {
      options.output = argument.substr(2);
    } else if (argument == "-x") {
      if (!take_option_value(argc, argv, index, "-x", options.forced_language)) return -1;
      if (!is_language(options.forced_language)) {
        std::fprintf(stderr, "%s: unsupported language: %s\n",
                     argv[0], options.forced_language.c_str());
        return -1;
      }
    } else if (starts_with(argument, "-x") && argument.size() > 2) {
      options.forced_language = argument.substr(2);
      if (!is_language(options.forced_language)) {
        std::fprintf(stderr, "%s: unsupported language: %s\n",
                     argv[0], options.forced_language.c_str());
        return -1;
      }
    } else if (starts_with(argument, "-std=")) {
      options.standard_selected = true;
      options.frontend_options.push_back(argument);
    } else if (argument == "-O0" || argument == "-O1" ||
               argument == "-O2" || argument == "-O3" ||
               argument == "-Os" || argument == "-Oz") {
      options.optimization_selected = true;
      options.frontend_options.push_back(argument);
    } else if (argument == "-funsigned-char" || argument == "-fno-signed-char") {
      options.unsigned_char = true;
    } else if (argument == "-fsigned-char" || argument == "-fno-unsigned-char") {
      options.unsigned_char = false;
    } else if (argument == "-fexceptions" || argument == "-fcxx-exceptions") {
      // Accept Clang's public positive spellings. Process-target C++ enables
      // both frontend exception modes below; recording the option here keeps
      // the usual last-option-wins driver behavior when build systems probe
      // or state the default explicitly.
      options.exceptions_disabled = false;
    } else if (argument == "-fno-exceptions") {
      // Emscripten's ordinary default is -fignore-exceptions. Bootstrap
      // libraries and build tools can opt into the smaller, explicit
      // no-exception target profile used by Dolly version 0.
      options.exceptions_disabled = true;
    } else if (argument == "-fno-rtti") {
      options.frontend_options.push_back("-fno-rtti");
    } else if (argument == "-fpermissive") {
      // GCC accepts this for downgraded C++ diagnostics; Clang deliberately
      // accepts and ignores it. Mirror that compatibility at Dolly's driver
      // boundary rather than forwarding an ignored driver-only flag to cc1.
    } else if (argument == "-fno-builtin") {
      // Some embedded LLVM library-call lowerings omit WebAssembly symbol
      // signatures. Callers may retain ordinary typed libc calls instead.
      options.frontend_options.push_back(argument);
    } else if (argument == "-fno-strict-aliasing") {
      // This public Clang driver spelling maps to the cc1 option below. Some
      // upstream sources use representation-compatible typed views and need
      // Clang's relaxed type-based alias analysis.
      options.frontend_options.push_back("-relaxed-aliasing");
    } else if (argument == "-fno-strict-overflow" || argument == "-fwrapv") {
      // CPython's public build flags request two's-complement wrapping. Clang's
      // cc1 spelling is -fwrapv; the driver-level -fno-strict-overflow alias
      // is not accepted by CompilerInvocation directly.
      options.frontend_options.push_back("-fwrapv");
    } else if (argument == "-m64") {
      // Dolly has one fixed wasm64 target; Clang accepts the flag for it.
    } else if (argument == "-pthread") {
      options.pthread = true;
    } else if (argument == "-mthread-model") {
      std::string value;
      if (!take_option_value(argc, argv, index, "-mthread-model", value)) return -1;
      options.thread_model = value;
    } else if (argument == "-msimd128") {
      // Wasm SIMD, as Clang's driver spells it for this target; every browser
      // with memory64 has it. <wasm_simd128.h> and Emscripten's SSE compat
      // headers need the feature on the unit.
      options.frontend_options.push_back("-target-feature");
      options.frontend_options.push_back("+simd128");
    } else if (argument == "-fno-math-errno") {
      // Clang's WebAssembly driver compiles without math errno by default,
      // so the flag states the default and cc1 gets nothing.
    } else if (argument == "-fomit-frame-pointer") {
      // cc1 already gets -mframe-pointer=none: WebAssembly has no frame pointer.
    } else if (starts_with(argument, "-ffp-contract=")) {
      // Follows the default -ffp-contract=on in cc1's arguments, so it wins.
      options.frontend_options.push_back(argument);
    } else if (argument == "-fno-lto") {
      // Dolly links no LTO bitcode; -flto is never enabled, so the negative
      // states the default and cc1, which has no such driver flag, gets nothing.
    } else if (argument == "-fstandalone-debug" ||
               argument == "-fno-standalone-debug") {
      // cc1 accepts both; they select how much debug info types carry and are
      // inert without -g, exactly as Clang's driver forwards them.
      options.frontend_options.push_back(argument);
    } else if (starts_with(argument, "-ferror-limit=")) {
      // cc1 accepts the joined spelling, like -std=.
      options.frontend_options.push_back(argument);
    } else if (argument == "-fPIC" || argument == "-fpic" || argument == "-fPIE" ||
               argument == "-fpie") {
      options.pic = true;
    } else if (argument == "-fno-pic" || argument == "-fno-PIC") {
      // Static code for a program's own link; it cannot go into a shared object.
      options.pic = false;
    } else if (argument == "-pipe") {
      // The compiler runs in one process.
    } else if (argument == "-fno-common") {
      // Clang's default; LLVM's CMake states it.
    } else if (argument == "-funroll-loops" || argument == "-fno-unroll-loops" ||
               argument == "-fignore-exceptions" ||
               starts_with(argument, "-fdebug-prefix-map=") ||
               starts_with(argument, "-fmacro-prefix-map=")) {
      // cc1 spells these as Clang's driver does.
      options.frontend_options.push_back(argument);
    } else if (starts_with(argument, "-ffile-prefix-map=")) {
      const std::string map = argument.substr(std::strlen("-ffile-prefix-map="));
      options.frontend_options.push_back("-fdebug-prefix-map=" + map);
      options.frontend_options.push_back("-fmacro-prefix-map=" + map);
    } else if (argument == "-nostdlib++") {
      // The link names its own C++ runtime; libc and the unwinder stay.
      options.no_standard_cxx_runtime = true;
    } else if (argument == "-funwind-tables") {
      // WebAssembly has no unwind tables: C++ exceptions use Wasm EH.
    } else if (argument == "-ffunction-sections" || argument == "-fdata-sections") {
      options.frontend_options.push_back(argument);
    } else if (argument == "-ftrapping-math") {
      options.frontend_options.push_back("-ffp-exception-behavior=strict");
    } else if (argument == "-Xclang") {
      std::string value;
      if (!take_option_value(argc, argv, index, "-Xclang", value)) return -1;
      options.frontend_options.push_back(value);
    } else if (argument == "-fdiagnostics-color=always") {
      options.frontend_options.push_back("-fcolor-diagnostics");
    } else if (argument == "-fdiagnostics-color=never") {
      options.frontend_options.push_back("-fno-color-diagnostics");
    } else if (argument == "-fdiagnostics-color=auto") {
      // Diagnostics are emitted through the active in-Wasm descriptor. Clang's
      // auto decision has no native terminal to query, so retain plain output.
    } else if (starts_with(argument, "-fvisibility=")) {
      options.frontend_options.push_back(argument);
    } else if (argument == "-fvisibility-inlines-hidden") {
      // C++ DSOs commonly hide inline definitions independently from the
      // default symbol visibility. This is a real Clang frontend option (and
      // is emitted by Meson for NumPy), so preserve it rather than treating it
      // as an unknown driver-only spelling.
      options.frontend_options.push_back(argument);
    } else if (argument == "-g" || argument == "-g2" || argument == "-g3") {
      // The embedded frontend is invoked as cc1, where the public driver
      // spelling `-g` is represented by explicit debug-info options.
      options.debug_info = DebugInfoKind::Full;
    } else if (argument == "-g1" || argument == "-gline-tables-only") {
      options.debug_info = DebugInfoKind::LineTables;
    } else if (argument == "-g0") {
      options.debug_info = DebugInfoKind::None;
    } else if (argument == "-pedantic" ||
               argument == "-pedantic-errors" ||
               argument == "-w" ||
               (starts_with(argument, "-W") &&
                !starts_with(argument, "-Wl,"))) {
      options.frontend_options.push_back(argument);
    } else if (argument == "-I" || argument == "-D" ||
               argument == "-U" || argument == "-include" ||
               argument == "-isystem" || argument == "-idirafter") {
      std::string value;
      if (!take_option_value(argc, argv, index, argument.c_str(), value)) return -1;
      options.frontend_options.push_back(argument);
      options.frontend_options.push_back(value);
    } else if ((starts_with(argument, "-idirafter") && argument.size() > 10) ||
               (starts_with(argument, "-isystem") && argument.size() > 8)) {
      options.frontend_options.push_back(argument);
    } else if ((starts_with(argument, "-I") || starts_with(argument, "-D") ||
                starts_with(argument, "-U")) && argument.size() > 2) {
      options.frontend_options.push_back(argument);
    } else if (argument == "-L" || argument == "-l") {
      std::string value;
      if (!take_option_value(argc, argv, index, argument.c_str(), value)) return -1;
      if (argument == "-L") options.inputs.push_back(argument + value);
      else add_library(options, value, options.inputs);
    } else if ((starts_with(argument, "-L") || starts_with(argument, "-l")) &&
               argument.size() > 2) {
      if (starts_with(argument, "-l")) add_library(options, argument.substr(2), options.inputs);
      else options.inputs.push_back(argument);
    } else if (starts_with(argument, "-Wl,")) {
      size_t begin = 4;
      while (begin <= argument.size()) {
        size_t comma = argument.find(',', begin);
        std::string option = argument.substr(
            begin, comma == std::string::npos ? std::string::npos : comma - begin);
        if (option == "-l" && comma != std::string::npos) {
          begin = comma + 1;
          comma = argument.find(',', begin);
          option += argument.substr(begin, comma == std::string::npos
              ? std::string::npos : comma - begin);
        }
        if (starts_with(option, "-l") && option.size() > 2) {
          add_library(options, option.substr(2), options.linker_options);
        } else if (option == "-h") {
          // GNU ld's short soname spelling; wasm-ld names the module with it.
          options.linker_options.push_back("--soname");
        } else if (starts_with(option, "-h")) {
          options.linker_options.push_back("--soname=" + option.substr(2));
        } else if (option == "--version" || option == "-v") {
          options.linker_version = true;
        } else if (option == "--start-group" || option == "--end-group") {
          // wasm-ld rescans archives without GNU ld's group delimiters.
        } else if (!option.empty() && option != "--no-as-needed" &&
                   option != "--as-needed" && option != "--no-undefined" &&
                   option != "--allow-shlib-undefined") {
          // Dolly links no ELF shared libraries, so these policies have no
          // meaning; the typed import validation after linking decides.
          options.linker_options.push_back(option);
        }
        if (comma == std::string::npos) break;
        begin = comma + 1;
      }
    } else if (argument == "-") {
      options.inputs.push_back(argument);
    } else if (!argument.empty() && argument[0] == '-') {
      std::fprintf(stderr, "%s: unsupported option: %s\n",
                   argv[0], argument.c_str());
      return -1;
    } else {
      options.inputs.push_back(argument);
    }
  }
  if (options.pthread && options.thread_model == "single") {
    std::fprintf(stderr, "%s: -pthread is not allowed with -mthread-model single\n",
                 argv[0]);
    return -1;
  }
  return 0;
}

std::vector<const char *> argument_pointers(
    const std::vector<std::string> &arguments) {
  std::vector<const char *> pointers;
  pointers.reserve(arguments.size());
  for (const std::string &argument : arguments) {
    pointers.push_back(argument.c_str());
  }
  return pointers;
}

bool run_clang(const std::string &source, const std::string &language,
               const std::string &output,
               const DriverOptions &options) {
  static bool targets_initialized = false;
  if (!targets_initialized) {
    llvm::InitializeAllTargets();
    llvm::InitializeAllTargetMCs();
    llvm::InitializeAllAsmPrinters();
    llvm::InitializeAllAsmParsers();
    targets_initialized = true;
  }

  std::vector<std::string> arguments = {
      // LLVM has no Dolly OS. This triple selects the code-generation ABI of
      // the bootstrap libc archives (data layout, long double alignment, TLS);
      // it is not the platform's name. Programs see __dolly__ and no
      // Emscripten macro, and the sysroot headers test __dolly__.
      "-triple", "wasm64-unknown-emscripten",
      "-U", "__EMSCRIPTEN__", "-U", "__EMSCRIPTEN_PTHREADS__", "-D", "__dolly__=1",
  };
  if (options.preprocess_only) {
    arguments.push_back("-E");
    if (options.dump_macros) arguments.push_back("-dM");
  } else {
    arguments.insert(arguments.end(), {
        "-emit-obj",
        "-clear-ast-before-backend",
        "-disable-llvm-verifier",
        "-discard-value-names",
        "-mframe-pointer=none",
        "-ffp-contract=on",
        "-mconstructor-aliases",
    });
  }
  // -E sees the macros -c compiles with: the relocation model here, the
  // target features and the exception model below.
  if (options.pic) {
    arguments.insert(arguments.end(), {"-mrelocation-model", "pic", "-pic-level", "2"});
  } else {
    arguments.insert(arguments.end(), {"-mrelocation-model", "static"});
  }
  // Clang's driver names the unit; without it debug information says <stdin>.
  arguments.insert(arguments.end(), {"-main-file-name", llvm::sys::path::filename(source).str()});
  if (options.pthread) arguments.push_back("-pthread");
  if (!options.thread_model.empty()) {
    arguments.push_back("-mthread-model");
    arguments.push_back(options.thread_model);
  }
  arguments.insert(arguments.end(), {
      "-target-cpu", "generic",
      "-target-feature", "+mutable-globals",
      "-target-feature", "+atomics",
      "-target-feature", "+bulk-memory",
      "-target-feature", "+exception-handling",
      "-target-feature", "+multivalue",
      "-target-feature", "+reference-types",
      "-exception-model=wasm",
  });
  arguments.insert(arguments.end(), {
      "-resource-dir", "/usr/lib/clang/24",
  });
  // As Clang's driver does: reproducible __DATE__, __TIME__ and __TIMESTAMP__.
  if (const char *epoch = std::getenv("SOURCE_DATE_EPOCH")) {
    arguments.insert(arguments.end(), {"-source-date-epoch", epoch});
  }
  // A kernel plugin is the sole resident dynamic object. The kernel implements
  // __assert_fail in JavaScript, so a plugin's assertions reach the kernel's C
  // reporter instead; ordinary output targets the private process runtime and
  // its process-local dynamic namespace.
  if (options.kernel_plugin) {
    arguments.insert(arguments.end(), {
      "-D", "__assert_fail=dolly_assert_fail",
    });
  } else {
    // Emscripten's standalone libc carries non-functional dl* stubs. Keep
    // upstream source unchanged while selecting Dolly's process-local dynamic
    // namespace at the target compiler boundary.
    arguments.insert(arguments.end(), {
      "-D", "dlopen=dolly_dlopen",
      "-D", "dlsym=dolly_dlsym",
      "-D", "dlerror=dolly_dlerror",
      "-D", "dlclose=dolly_dlclose",
    });
  }
  arguments.insert(arguments.end(), {
      "-isysroot", "/",
      // Match the pinned Emscripten C++ driver's target include order. libc++
      // deliberately interposes wrappers such as stddef.h before Clang's
      // resource headers and obtains xlocale.h from Emscripten's compat tree.
      "-internal-isystem", "/usr/include/fakesdl",
      "-internal-isystem", "/usr/include/compat",
      "-internal-isystem", "/usr/include/c++/v1",
      "-internal-isystem", "/usr/lib/clang/24/include",
      "-internal-isystem", "/usr/include/wasm64-emscripten",
      "-internal-isystem", "/usr/include",
      options.kernel_plugin ? "-fvisibility=hidden" : "-fvisibility=default",
      "-fgnuc-version=4.2.1",
      "-vectorize-loops",
      "-vectorize-slp",
  });
  if (!options.preprocess_only) {
    // Clang's -mllvm parser mutates LLVM process-global state on every
    // CompilerInvocation. Dolly embeds many sequential compiler jobs, so parse
    // the fixed target profile exactly once and keep per-job invocations free
    // of process-global backend options.
    static bool backend_options_initialized = false;
    if (!backend_options_initialized) {
      const std::vector<const char *> backend_arguments = {
          "dolly-cc",
          "-combiner-global-alias-analysis=false",
          "-wasm-enable-sjlj",
          "-wasm-use-legacy-eh=0",
          "-wasm-enable-eh",
          "-disable-lsr",
      };
      llvm::cl::ParseCommandLineOptions(
          backend_arguments.size(), backend_arguments.data());
      backend_options_initialized = true;
    }
  }
  if (!options.optimization_selected) arguments.push_back("-O2");
  if (options.unsigned_char) arguments.push_back("-fno-signed-char");
  if (!options.standard_selected) {
    arguments.push_back(language == "c++" ? "-std=gnu++17" : "-std=gnu17");
  }
  if (language == "c++") {
    // Process-target C++ deliberately retains libc++'s normal visibility
    // annotations.  Header-defined implementation details are hidden and
    // therefore stay in each DSO, while its public, out-of-line ABI remains
    // unresolved for the single runtime provider owned by the executable.
    if (!options.exceptions_disabled) {
      arguments.push_back("-fcxx-exceptions");
      arguments.push_back("-fexceptions");
    }
  }
  if (!options.preprocess_only && options.debug_info != DebugInfoKind::None) {
    arguments.push_back(options.debug_info == DebugInfoKind::Full
                            ? "-debug-info-kind=standalone"
                            : "-debug-info-kind=line-tables-only");
    arguments.push_back("-dwarf-version=5");
  }
  arguments.insert(arguments.end(), options.frontend_options.begin(),
                   options.frontend_options.end());
  if (!options.preprocess_only && options.dependency_output) {
    arguments.insert(arguments.end(), {
        "-dependency-file", dependency_file(options, source),
        "-MT", dependency_target(options, source),
    });
    if (options.include_system_dependencies) {
      arguments.push_back("-sys-header-deps");
    }
    if (options.phony_dependencies) arguments.push_back("-MP");
  }
  if (!output.empty()) arguments.insert(arguments.end(), {"-o", output});
  arguments.insert(arguments.end(), {"-x", language, source});
  const std::vector<const char *> pointers = argument_pointers(arguments);

  auto diagnostic_ids = clang::DiagnosticIDs::create();
  clang::DiagnosticOptions diagnostic_options;
  auto *diagnostic_buffer = new clang::TextDiagnosticBuffer;
  clang::DiagnosticsEngine parsing_diagnostics(
      diagnostic_ids, diagnostic_options, diagnostic_buffer);

  auto invocation = std::make_shared<clang::CompilerInvocation>();
  const bool parsed = clang::CompilerInvocation::CreateFromArgs(
      *invocation, pointers, parsing_diagnostics, "dolly-cc");

  auto pch = std::make_shared<clang::PCHContainerOperations>();
  pch->registerWriter(
      std::make_unique<clang::ObjectFilePCHContainerWriter>());
  pch->registerReader(
      std::make_unique<clang::ObjectFilePCHContainerReader>());
  clang::CompilerInstance compiler(std::move(invocation), std::move(pch));
  // LLVM's getRealFileSystem() is process-global. Dolly runs many independent
  // compiler jobs in one long-lived Wasm userspace, including jobs launched by
  // package build frontends. Give each synchronous job its own physical VFS so
  // frontend-local filesystem state cannot leak into the next invocation.
  auto physical_filesystem = llvm::IntrusiveRefCntPtr<llvm::vfs::FileSystem>(
      llvm::vfs::createPhysicalFileSystem());
  compiler.createVirtualFileSystem(std::move(physical_filesystem),
                                   diagnostic_buffer);
  compiler.createDiagnostics();
  diagnostic_buffer->FlushDiagnostics(compiler.getDiagnostics());

  return parsed && clang::ExecuteCompilerInvocation(&compiler);
}

// Whether assembly text holds only line markers, comments and blank lines.
bool assembles_nothing(const std::string &path) {
  auto buffer = llvm::MemoryBuffer::getFile(path);
  if (!buffer) return false;
  for (llvm::StringRef rest = (*buffer)->getBuffer(); !rest.empty();) {
    auto [line, next] = rest.split('\n');
    line = line.trim();
    if (!line.empty() && !line.starts_with("#") && !line.starts_with("//")) return false;
    rest = next;
  }
  return true;
}

// Dolly has no WebAssembly assembler. Assembly that preprocesses to nothing,
// such as x86 code behind #if, still yields an empty object as with Clang;
// any real assembly fails explicitly.
bool run_frontend(const std::string &source, const std::string &language,
                  const std::string &output,
                  const DriverOptions &options) {
  if (options.preprocess_only ||
      (language != "assembler" && language != "assembler-with-cpp")) {
    return run_clang(source, language, output, options);
  }
  std::string text = source;
  if (language == "assembler-with-cpp") {
    DriverOptions preprocessing = options;
    preprocessing.preprocess_only = true;
    text = output + ".s";
    if (!run_clang(source, language, text, preprocessing)) return false;
  }
  const bool empty = assembles_nothing(text);
  if (text != source) std::remove(text.c_str());
  if (!empty) {
    std::fprintf(stderr, "dolly-cc: %s: WebAssembly assembly is unsupported\n",
                 source.c_str());
    return false;
  }
  const std::string blank = output + ".c";
  FILE *file = std::fopen(blank.c_str(), "w");
  if (file == nullptr) return false;
  std::fclose(file);
  DriverOptions compiling = options;
  compiling.dependency_output = false;
  const bool compiled = run_clang(blank, "c", output, compiling);
  std::remove(blank.c_str());
  return compiled;
}

bool link_side_module(const std::string &output,
                      const std::vector<std::string> &inputs,
                      const std::vector<std::string> &linker_options,
                      bool bind_defined_locally, bool strip_debug) {
  std::vector<std::string> arguments = {
      "wasm-ld",
      "-o", output,
      "-Bdynamic",
      // Parallel section merging can assign equal-priority chunks in
      // scheduler order. Stable module-cache snapshots require fixed bytes.
      "--threads=1",
      "--shared-memory",
      "--no-check-features",
      "--export=__wasm_call_ctors",
      "--unresolved-symbols=import-dynamic",
      "-shared",
      "--stack-first",
      "--extra-features=extended-const",
      "--export-dynamic",
  };
  if (strip_debug) arguments.push_back("--strip-debug");
  // Keep header-defined C++ implementations local to the resident plugin.
  // It has no separate C++ runtime; all remaining imports must fit the ABI.
  if (bind_defined_locally) arguments.push_back("-Bsymbolic");
  arguments.push_back("-L/usr/lib");
  arguments.insert(arguments.end(), inputs.begin(), inputs.end());
  arguments.insert(arguments.end(), linker_options.begin(), linker_options.end());
  arguments.insert(arguments.end(), {
      "-mwasm64",
  });
  const std::vector<const char *> pointers = argument_pointers(arguments);
  const lld::DriverDef driver = {lld::Flavor::Wasm, &lld::wasm::link};
  const lld::Result result =
      lld::lldMain(pointers, llvm::outs(), llvm::errs(), {driver});
  return result.retCode == 0 && result.canRunAgain;
}

// Every host module's client archive in the process sysroot. The linker pulls
// only referenced members, so a program records only the modules it uses.
std::vector<std::string> host_client_libraries() {
  std::vector<std::string> libraries;
  DIR *directory = opendir(kProcessSysroot);
  while (dirent *entry = directory == nullptr ? nullptr : readdir(directory)) {
    const std::string name = entry->d_name;
    if (name.size() > 11 && name.rfind("libdolly-", 0) == 0 && name != "libdolly-process.a" &&
        name.compare(name.size() - 2, 2, ".a") == 0) {
      libraries.push_back("-l" + name.substr(3, name.size() - 5));
    }
  }
  if (directory != nullptr) closedir(directory);
  std::sort(libraries.begin(), libraries.end());
  return libraries;
}

bool link_process_executable(const std::string &output,
                             const std::vector<std::string> &inputs,
                             const std::vector<std::string> &linker_options,
                             bool needs_cxx_runtime,
                             bool export_dynamic,
                             bool strip_debug, bool pthread) {
  const std::string sysroot = std::string(kProcessSysroot) + (pthread ? "/threads" : "");
  std::vector<std::string> arguments = {
      "wasm-ld",
      "-o", output,
      "-Bstatic",
      "--threads=1",
      "--import-memory",
      "--shared-memory",
      "--export=__trap",
      "--export=__stack_pointer",
      "--export-table",
      "--growable-table",
      // Match the conventional Linux soft stack limit. Real build systems and
      // language runtimes routinely place buffers larger than WASI's tiny
      // historical 64 KiB default on the stack.
      "-z", "stack-size=8388608",
      "--max-memory=8589934592",
      "--initial-memory=16777216",
      "--no-stack-first",
      "--table-base=1",
      "--global-base=1024",
      "--extra-features=extended-const",
      "-L/usr/lib",
  };
  arguments.push_back(export_dynamic ? "--export-dynamic"
                                     : "--no-export-dynamic");
  if (pthread) arguments.push_back("--export=dolly_thread_start");
  if (strip_debug) arguments.push_back("--strip-debug");
  if (export_dynamic) {
    // A host of loadable modules: this export selects the dso@0 client and
    // its record from libdolly-dso.a. Without it dlopen is libc's refusal.
    arguments.push_back("--export=__dolly_dso_allocate");
    auto symbols = llvm::MemoryBuffer::getFile(
        kProcessDynamicProviderSymbols, false, false);
    if (!symbols) {
      std::fprintf(stderr,
                   "dolly-cc: cannot read process runtime provider symbols: %s\n",
                   symbols.getError().message().c_str());
      return false;
    }
    size_t count = 0;
    llvm::StringRef contents = symbols.get()->getBuffer();
    while (!contents.empty()) {
      auto [line, remainder] = contents.split('\n');
      contents = remainder;
      line = line.trim();
      if (line.empty()) continue;
      arguments.push_back("--export-if-defined=" + line.str());
      count++;
    }
    if (count == 0) {
      std::fputs("dolly-cc: process runtime provider symbol set is empty\n",
                 stderr);
      return false;
    }
  }
  arguments.insert(arguments.end(), inputs.begin(), inputs.end());
  arguments.insert(arguments.end(), {
      "--whole-archive",
      sysroot + "/libdolly-process.a",
      "--no-whole-archive",
      sysroot + "/crt1.o",
      "-L" + sysroot,
      "-L" + std::string(kProcessSysroot),
  });
  const std::vector<std::string> clients = host_client_libraries();
  arguments.insert(arguments.end(), clients.begin(), clients.end());
  if (pthread) arguments.insert(arguments.end(), {
      "-lstandalonewasm-mt-memgrow", "-lstubs", "-lc-mt",
      "-ldlmalloc-mt", "-lclang_rt.builtins-wasmsjlj-mt",
  });
  else arguments.insert(arguments.end(), {
      "-lstandalonewasm-ww-memgrow",
      "-lstubs",
      "-lc-ww",
      "-ldlmalloc-ww",
      "-lclang_rt.builtins-wasmsjlj-ww",
  });
  if (needs_cxx_runtime || export_dynamic) {
    // A process which hosts DSOs owns one C++ runtime for the complete
    // address space. The provider symbol manifest above makes every public
    // archive definition an explicit export root even when the executable
    // itself is C (CPython is).
    arguments.insert(arguments.end(), {
        pthread ? "-lc++-mt-wasmexcept" : "-lc++-ww-wasmexcept",
        pthread ? "-lc++abi-mt-wasmexcept" : "-lc++abi-ww-wasmexcept",
    });
  }
  arguments.push_back(pthread ? "-lunwind-mt-wasmexcept" : "-lunwind-ww-wasmexcept");
  arguments.insert(arguments.end(), linker_options.begin(), linker_options.end());
  arguments.insert(arguments.end(), {
      "-mwasm64",
      "-mllvm", "-combiner-global-alias-analysis=false",
      "-mllvm", "-wasm-enable-sjlj",
      "-mllvm", "-wasm-use-legacy-eh=0",
      "-mllvm", "-disable-lsr",
      "-mllvm", "-wasm-enable-eh",
  });
  const std::vector<const char *> pointers = argument_pointers(arguments);
  const lld::DriverDef driver = {lld::Flavor::Wasm, &lld::wasm::link};
  const lld::Result result =
      lld::lldMain(pointers, llvm::outs(), llvm::errs(), {driver});
  return result.retCode == 0 && result.canRunAgain;
}

bool link_process_shared_object(const std::string &output,
                                const std::vector<std::string> &inputs,
                                const std::vector<std::string> &linker_options,
                                bool strip_debug) {
  std::vector<std::string> arguments = {
      "wasm-ld",
      "-o", output,
      "-Bdynamic",
      "--threads=1",
      "--shared-memory",
      "--no-check-features",
      "--export=__wasm_call_ctors",
      "--export-dynamic",
      "--unresolved-symbols=import-dynamic",
      "-shared",
      // Dolly intentionally has no ELF-style symbol interposition. Bind a
      // DSO's own definitions locally so template instantiations and other
      // implementation details do not become imports from the executable.
      // Truly undefined libc, Python, and C++ ABI symbols remain imports.
      "-Bsymbolic",
      "--stack-first",
      "--max-memory=8589934592",
      "--extra-features=extended-const",
      "-L" + std::string(kProcessSysroot),
      "-L/usr/lib",
  };
  if (strip_debug) arguments.push_back("--strip-debug");
  arguments.insert(arguments.end(), inputs.begin(), inputs.end());
  // Compiler builtins are implementation details of the DSO. libc, libc++,
  // libc++abi, the allocator, and Dolly runtime symbols deliberately remain
  // dynamic imports resolved from the owning -rdynamic process.  There must
  // be exactly one instance of their mutable runtime state per process.
  arguments.push_back("-lclang_rt.builtins-wasmsjlj-ww");
  arguments.insert(arguments.end(), linker_options.begin(), linker_options.end());
  arguments.insert(arguments.end(), {
      "-mwasm64",
      "-mllvm", "-combiner-global-alias-analysis=false",
      "-mllvm", "-wasm-enable-sjlj",
      "-mllvm", "-wasm-use-legacy-eh=0",
      "-mllvm", "-disable-lsr",
      "-mllvm", "-wasm-enable-eh",
  });
  const std::vector<const char *> pointers = argument_pointers(arguments);
  const lld::DriverDef driver = {lld::Flavor::Wasm, &lld::wasm::link};
  const lld::Result result =
      lld::lldMain(pointers, llvm::outs(), llvm::errs(), {driver});
  return result.retCode == 0 && result.canRunAgain;
}

std::string error_text(llvm::Error error) {
  std::string text;
  llvm::raw_string_ostream stream(text);
  llvm::logAllUnhandledErrors(std::move(error), stream);
  stream.flush();
  return text;
}

bool load_wasm(const std::string &path, LoadedWasm &loaded) {
  auto bytes = llvm::MemoryBuffer::getFile(path, false, false);
  if (!bytes) {
    std::fprintf(stderr, "dolly-cc: could not read %s: %s\n",
                 path.c_str(), bytes.getError().message().c_str());
    return false;
  }
  llvm::Error error = llvm::Error::success();
  auto object = std::make_unique<llvm::object::WasmObjectFile>(
      bytes.get()->getMemBufferRef(), error);
  if (error) {
    const std::string message = error_text(std::move(error));
    std::fprintf(stderr, "dolly-cc: invalid Wasm file %s: %s\n",
                 path.c_str(), message.c_str());
    return false;
  }
  loaded.bytes = std::move(bytes.get());
  loaded.object = std::move(object);
  return true;
}

std::string interface_key(llvm::StringRef module, llvm::StringRef field) {
  return module.str() + "\n" + field.str();
}

// A function or tag type whose value types LLVM models completely.
const llvm::wasm::WasmSignature *callable_type(const LoadedWasm &loaded,
                                               uint32_t index) {
  const llvm::ArrayRef<llvm::wasm::WasmSignature> types = loaded.object->types();
  if (index >= types.size() ||
      types[index].Kind == llvm::wasm::WasmSignature::Placeholder) {
    return nullptr;
  }
  const auto modeled = [](llvm::wasm::ValType type) {
    return type != llvm::wasm::ValType::OTHERREF;
  };
  return llvm::all_of(types[index].Params, modeled) &&
                 llvm::all_of(types[index].Returns, modeled)
             ? &types[index]
             : nullptr;
}

bool same_callable_type(const llvm::wasm::WasmSignature *left,
                        const llvm::wasm::WasmSignature *right) {
  return left != nullptr && right != nullptr && left->Params == right->Params &&
         left->Returns == right->Returns;
}

const char *wat_value_type(llvm::wasm::ValType type) {
  switch (type) {
    case llvm::wasm::ValType::I32: return "i32";
    case llvm::wasm::ValType::I64: return "i64";
    case llvm::wasm::ValType::F32: return "f32";
    case llvm::wasm::ValType::F64: return "f64";
    case llvm::wasm::ValType::V128: return "v128";
    case llvm::wasm::ValType::FUNCREF: return "funcref";
    case llvm::wasm::ValType::EXTERNREF: return "externref";
    case llvm::wasm::ValType::EXNREF: return "exnref";
    default: return "unknown";
  }
}

void print_value_types(const char *label,
                       llvm::ArrayRef<llvm::wasm::ValType> types) {
  if (types.empty()) return;
  std::fprintf(stderr, " (%s", label);
  for (llvm::wasm::ValType type : types) std::fprintf(stderr, " %s", wat_value_type(type));
  std::fputc(')', stderr);
}

void print_import_signature(const LoadedWasm &loaded,
                            const llvm::wasm::WasmImport &entry) {
  const llvm::wasm::WasmSignature *signature =
      callable_type(loaded, entry.SigIndex);
  if (entry.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION || signature == nullptr) {
    return;
  }
  std::fprintf(stderr, "  (import \"%s\" \"%s\" (func",
               entry.Module.str().c_str(), entry.Field.str().c_str());
  print_value_types("param", signature->Params);
  print_value_types("result", signature->Returns);
  std::fputs("))\n", stderr);
}

bool provider_limits_satisfy(const llvm::wasm::WasmLimits &provider,
                             const llvm::wasm::WasmLimits &required,
                             bool dynamic_minimum) {
  constexpr uint8_t shape_flags = llvm::wasm::WASM_LIMITS_FLAG_IS_SHARED |
                                  llvm::wasm::WASM_LIMITS_FLAG_IS_64;
  if ((provider.Flags & shape_flags) != (required.Flags & shape_flags)) return false;
  if (!dynamic_minimum && provider.Minimum < required.Minimum) return false;
  const bool required_has_max =
      (required.Flags & llvm::wasm::WASM_LIMITS_FLAG_HAS_MAX) != 0;
  const bool provider_has_max =
      (provider.Flags & llvm::wasm::WASM_LIMITS_FLAG_HAS_MAX) != 0;
  if (required_has_max &&
      (!provider_has_max || provider.Maximum > required.Maximum)) {
    return false;
  }
  return true;
}

bool provider_import_satisfies(
    const LoadedWasm &provider_object,
    const llvm::wasm::WasmImport &provider,
    const LoadedWasm &required_object,
    const llvm::wasm::WasmImport &required) {
  if (provider.Kind != required.Kind) return false;
  switch (provider.Kind) {
    case llvm::wasm::WASM_EXTERNAL_FUNCTION:
    case llvm::wasm::WASM_EXTERNAL_TAG:
      return same_callable_type(callable_type(provider_object, provider.SigIndex),
                                callable_type(required_object, required.SigIndex));
    case llvm::wasm::WASM_EXTERNAL_GLOBAL:
      return provider.Global == required.Global;
    case llvm::wasm::WASM_EXTERNAL_MEMORY:
      return provider_limits_satisfy(provider.Memory, required.Memory, false);
    case llvm::wasm::WASM_EXTERNAL_TABLE:
      return provider.Table.ElemType == required.Table.ElemType &&
             provider_limits_satisfy(provider.Table.Limits,
                                     required.Table.Limits, true);
    default:
      return false;
  }
}

const llvm::wasm::WasmSignature *function_signature(
    const LoadedWasm &loaded, uint32_t function_index) {
  uint32_t imported_index = 0;
  for (const llvm::wasm::WasmImport &entry : loaded.object->imports()) {
    if (entry.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION) continue;
    if (imported_index == function_index) return callable_type(loaded, entry.SigIndex);
    imported_index++;
  }
  for (const llvm::wasm::WasmFunction &function : loaded.object->functions()) {
    if (function.Index == function_index) {
      return callable_type(loaded, function.SigIndex);
    }
  }
  return nullptr;
}

bool is_mutable_i64_global(const llvm::wasm::WasmImport &entry) {
  return entry.Kind == llvm::wasm::WASM_EXTERNAL_GLOBAL &&
         entry.Global.Type == llvm::wasm::WASM_TYPE_I64 && entry.Global.Mutable;
}

bool validate_side_module_loaded(const std::string &path,
                                 const LoadedWasm &contract,
                                 const LoadedWasm &command) {
  auto first_section = command.object->section_begin();
  if (first_section == command.object->section_end()) {
    std::fprintf(stderr, "dolly-cc: %s has no sections\n", path.c_str());
    return false;
  }
  llvm::Expected<llvm::StringRef> first_name = first_section->getName();
  if (!first_name || *first_name != "dylink.0") {
    if (!first_name) llvm::consumeError(first_name.takeError());
    std::fprintf(stderr, "dolly-cc: %s does not begin with dylink.0\n",
                 path.c_str());
    return false;
  }

  std::map<std::string, const llvm::wasm::WasmImport *> allowed_imports;
  for (const llvm::wasm::WasmImport &entry : contract.object->imports()) {
    const std::string key = interface_key(entry.Module, entry.Field);
    if (!allowed_imports.emplace(key, &entry).second) {
      std::fprintf(stderr, "dolly-cc: duplicate contract import %s.%s\n",
                   entry.Module.str().c_str(), entry.Field.str().c_str());
      return false;
    }
  }

  bool has_memory = false;
  bool imports_valid = true;
  for (const llvm::wasm::WasmImport &entry : command.object->imports()) {
    const std::string key = interface_key(entry.Module, entry.Field);
    if (key == interface_key("env", "memory")) has_memory = true;
    const auto allowed = allowed_imports.find(key);
    if (allowed == allowed_imports.end()) {
      std::fprintf(stderr,
                   "dolly-cc: import is outside the kernel-plugin contract: %s.%s\n",
                   entry.Module.str().c_str(), entry.Field.str().c_str());
      print_import_signature(command, entry);
      imports_valid = false;
      continue;
    }
    if (!provider_import_satisfies(contract, *allowed->second,
                                   command, entry)) {
      std::fprintf(stderr, "dolly-cc: incompatible import: %s.%s\n",
                   entry.Module.str().c_str(), entry.Field.str().c_str());
      std::fputs("dolly-cc: contract requires\n", stderr);
      print_import_signature(contract, *allowed->second);
      std::fputs("dolly-cc: module imports\n", stderr);
      print_import_signature(command, entry);
      imports_valid = false;
    }
  }
  if (!imports_valid) return false;
  if (!has_memory) {
    std::fprintf(stderr, "dolly-cc: %s does not import env.memory\n", path.c_str());
    return false;
  }
  return true;
}

// The kernel plugin loader resolves imports only against the kernel's exports:
// a plugin has no needed libraries.
bool validate_kernel_plugin(const std::string &path) {
  LoadedWasm contract;
  LoadedWasm module;
  if (!load_wasm(kKernelContractPath, contract) || !load_wasm(path, module)) {
    return false;
  }
  if (!module.object->dylinkInfo().Needed.empty()) {
    std::fprintf(stderr, "dolly-cc: a kernel plugin cannot need libraries: %s\n",
                 path.c_str());
    return false;
  }
  return validate_side_module_loaded(path, contract, module);
}

bool process_section(const LoadedWasm &executable, llvm::StringRef name,
                     const unsigned char *expected, size_t expected_size,
                     size_t &matches) {
  matches = 0;
  for (const llvm::object::SectionRef &section : executable.object->sections()) {
    const llvm::object::WasmSection &wasm =
        executable.object->getWasmSection(section);
    if (wasm.Type != llvm::wasm::WASM_SEC_CUSTOM || wasm.Name != name) continue;
    ++matches;
    if (wasm.Content.size() != expected_size ||
        std::memcmp(wasm.Content.data(), expected, expected_size) != 0) {
      return false;
    }
  }
  return true;
}

void encode_u64_le(uint64_t value, unsigned char output[8]) {
  for (unsigned byte = 0; byte < 8; ++byte) {
    output[byte] = static_cast<unsigned char>(value >> (byte * 8));
  }
}

bool process_memory_requirements(const LoadedWasm &executable,
                                 unsigned char output[16]) {
  for (const llvm::wasm::WasmImport &entry : executable.object->imports()) {
    if (entry.Module == "env" && entry.Field == "memory" &&
        entry.Kind == llvm::wasm::WASM_EXTERNAL_MEMORY) {
      encode_u64_le(entry.Memory.Minimum, output);
      encode_u64_le(entry.Memory.Maximum, output + 8);
      return true;
    }
  }
  return false;
}

bool validate_process_executable(const std::string &path) {
  LoadedWasm executable;
  if (!load_wasm(path, executable)) return false;

  for (const llvm::object::SectionRef &section : executable.object->sections()) {
    const llvm::object::WasmSection &wasm =
        executable.object->getWasmSection(section);
    if (wasm.Type == llvm::wasm::WASM_SEC_CUSTOM && wasm.Name == "dylink.0") {
      std::fprintf(stderr, "dolly-cc: process executable %s is a side module\n",
                   path.c_str());
      return false;
    }
  }

  size_t import_count = 0;
  bool found_memory = false;
  bool found_call = false;
  for (const llvm::wasm::WasmImport &entry : executable.object->imports()) {
    ++import_count;
    if (entry.Module == "env" && entry.Field == "memory" &&
        entry.Kind == llvm::wasm::WASM_EXTERNAL_MEMORY) {
      constexpr uint8_t required_flags =
          llvm::wasm::WASM_LIMITS_FLAG_HAS_MAX |
          llvm::wasm::WASM_LIMITS_FLAG_IS_SHARED |
          llvm::wasm::WASM_LIMITS_FLAG_IS_64;
      if ((entry.Memory.Flags & required_flags) != required_flags ||
          entry.Memory.Minimum < 1 ||
          entry.Memory.Maximum > kProcessMaximumMemoryPages ||
          entry.Memory.Minimum > entry.Memory.Maximum) {
        std::fprintf(stderr,
                     "dolly-cc: process executable %s has incompatible memory64 limits\n",
                     path.c_str());
        return false;
      }
      found_memory = true;
      continue;
    }
    if (entry.Module == "dolly_process_0" && entry.Field == "call" &&
        entry.Kind == llvm::wasm::WASM_EXTERNAL_FUNCTION) {
      using llvm::wasm::ValType;
      const llvm::wasm::WasmSignature call(
          {ValType::I64},
          {ValType::I32, ValType::I64, ValType::I64, ValType::I64, ValType::I64});
      if (!same_callable_type(callable_type(executable, entry.SigIndex), &call)) {
        std::fprintf(stderr,
                     "dolly-cc: process executable %s has an incompatible call import\n",
                     path.c_str());
        return false;
      }
      found_call = true;
      continue;
    }
    std::fprintf(stderr, "dolly-cc: process import is outside dolly-process-0: %s.%s\n",
                 entry.Module.str().c_str(), entry.Field.str().c_str());
    print_import_signature(executable, entry);
    return false;
  }
  if (import_count != 2 || !found_memory || !found_call) {
    std::fprintf(stderr,
                 "dolly-cc: process executable %s does not import exactly memory and call\n",
                 path.c_str());
    return false;
  }

  // The loader starts every thread of a program that links the threads client
  // at dolly_thread_start, so refuse here what it would refuse to run.
  bool thread_client = false, thread_entry = false;
  for (const llvm::object::SectionRef &section : executable.object->sections()) {
    const llvm::object::WasmSection &wasm =
        executable.object->getWasmSection(section);
    if (wasm.Type != llvm::wasm::WASM_SEC_CUSTOM || wasm.Name != "dolly.host") continue;
    for (size_t offset = 0; offset + DOLLY_HOST_RECORD_BYTES <= wasm.Content.size();
         offset += DOLLY_HOST_RECORD_BYTES) {
      if (std::strncmp(reinterpret_cast<const char *>(wasm.Content.data() + offset),
                       "threads", DOLLY_HOST_NAME_BYTES) == 0) thread_client = true;
    }
  }
  for (const llvm::wasm::WasmExport &entry : executable.object->exports()) {
    if (entry.Name == "dolly_thread_start") thread_entry = true;
  }
  if (thread_client && !thread_entry) {
    std::fputs("dolly-cc: this program uses <dolly/threads.h> without a thread entry: build "
               "with -pthread, or export dolly_thread_start from your own runtime\n", stderr);
    return false;
  }

  const llvm::wasm::WasmExport *start = nullptr;
  for (const llvm::wasm::WasmExport &entry : executable.object->exports()) {
    if (entry.Name != "_start") continue;
    if (start != nullptr || entry.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION) {
      std::fprintf(stderr, "dolly-cc: process executable %s has an invalid _start\n",
                   path.c_str());
      return false;
    }
    start = &entry;
  }
  const llvm::wasm::WasmSignature no_arguments;
  if (start == nullptr ||
      !same_callable_type(function_signature(executable, start->Index),
                          &no_arguments)) {
    std::fprintf(stderr, "dolly-cc: process executable %s lacks _start()\n",
                 path.c_str());
    return false;
  }

  size_t digest_matches = 0, memory_matches = 0;
  unsigned char memory_requirements[16];
  if (!process_memory_requirements(executable, memory_requirements) ||
      !process_section(executable, "dolly.process", DOLLY_PROCESS_ABI_DIGEST,
                       sizeof(DOLLY_PROCESS_ABI_DIGEST), digest_matches) ||
      !process_section(executable, "dolly.process.memory", memory_requirements,
                       sizeof(memory_requirements), memory_matches) ||
      digest_matches != 0 || memory_matches != 0) {
    std::fprintf(stderr, "dolly-cc: process executable %s is already stamped\n",
                 path.c_str());
    return false;
  }
  return true;
}

bool validate_process_shared_object(const std::string &path) {
  LoadedWasm module;
  if (!load_wasm(path, module)) return false;
  auto first_section = module.object->section_begin();
  if (first_section == module.object->section_end()) return false;
  llvm::Expected<llvm::StringRef> first_name = first_section->getName();
  if (!first_name || *first_name != "dylink.0") {
    if (!first_name) llvm::consumeError(first_name.takeError());
    std::fprintf(stderr,
                 "dolly-cc: process shared object %s does not begin with dylink.0\n",
                 path.c_str());
    return false;
  }
  for (llvm::StringRef needed : module.object->dylinkInfo().Needed) {
    if (needed.empty() || needed.contains('/') || needed.contains("..")) {
      std::fprintf(stderr, "dolly-cc: invalid needed library name: %s\n",
                   needed.str().c_str());
      return false;
    }
  }

  bool found_memory = false;
  for (const llvm::wasm::WasmImport &entry : module.object->imports()) {
    if (entry.Module == "env" && entry.Field == "memory" &&
        entry.Kind == llvm::wasm::WASM_EXTERNAL_MEMORY) {
      constexpr uint8_t required_flags =
          llvm::wasm::WASM_LIMITS_FLAG_HAS_MAX |
          llvm::wasm::WASM_LIMITS_FLAG_IS_SHARED |
          llvm::wasm::WASM_LIMITS_FLAG_IS_64;
      if (found_memory || (entry.Memory.Flags & required_flags) != required_flags ||
          entry.Memory.Minimum > kProcessInitialMemoryPages ||
          entry.Memory.Maximum < kProcessMaximumMemoryPages) {
        std::fprintf(stderr,
                     "dolly-cc: process shared object %s has incompatible memory64\n",
                     path.c_str());
        return false;
      }
      found_memory = true;
      continue;
    }
    if (entry.Module == "env" &&
        (entry.Field == "__memory_base" || entry.Field == "__table_base")) {
      if (entry.Kind != llvm::wasm::WASM_EXTERNAL_GLOBAL ||
          entry.Global.Type != llvm::wasm::WASM_TYPE_I64 ||
          entry.Global.Mutable) return false;
      continue;
    }
    if (entry.Module == "env" && entry.Field == "__stack_pointer") {
      if (!is_mutable_i64_global(entry)) return false;
      continue;
    }
    if (entry.Module == "env" &&
        entry.Field == "__indirect_function_table") {
      if (entry.Kind != llvm::wasm::WASM_EXTERNAL_TABLE ||
          entry.Table.ElemType != llvm::wasm::ValType::FUNCREF ||
          (entry.Table.Limits.Flags & llvm::wasm::WASM_LIMITS_FLAG_IS_64) == 0) {
        return false;
      }
      continue;
    }
    // Ordinary process symbols live in the executable/DSO namespace. They are
    // not browser imports; the process-local loader resolves them by exact
    // WebAssembly type before instantiation.
    if (entry.Module == "env" &&
        (entry.Kind == llvm::wasm::WASM_EXTERNAL_FUNCTION ||
         entry.Kind == llvm::wasm::WASM_EXTERNAL_TAG)) {
      continue;
    }
    if ((entry.Module == "GOT.mem" || entry.Module == "GOT.func") &&
        is_mutable_i64_global(entry)) {
      continue;
    }
    std::fprintf(stderr,
                 "dolly-cc: process shared-object import is outside its namespace: %s.%s\n",
                 entry.Module.str().c_str(), entry.Field.str().c_str());
    return false;
  }
  if (!found_memory) {
    std::fprintf(stderr, "dolly-cc: process shared object %s does not import memory\n",
                 path.c_str());
    return false;
  }

  size_t dso_stamp_matches = 0, executable_stamp_matches = 0;
  if (!process_section(module, "dolly.process.dso", DOLLY_PROCESS_ABI_DIGEST,
                       sizeof(DOLLY_PROCESS_ABI_DIGEST), dso_stamp_matches) ||
      !process_section(module, "dolly.process", DOLLY_PROCESS_ABI_DIGEST,
                       sizeof(DOLLY_PROCESS_ABI_DIGEST), executable_stamp_matches) ||
      dso_stamp_matches != 0 || executable_stamp_matches != 0) {
    std::fprintf(stderr, "dolly-cc: process shared object %s is already stamped\n",
                 path.c_str());
    return false;
  }
  return true;
}

void append_uleb(std::vector<unsigned char> &bytes, uint64_t value) {
  do {
    unsigned char byte = static_cast<unsigned char>(value & 0x7f);
    value >>= 7;
    if (value != 0) byte |= 0x80;
    bytes.push_back(byte);
  } while (value != 0);
}

bool append_custom_section(const std::string &path, const char *name,
                           const unsigned char *data, size_t size) {
  const size_t name_size = std::strlen(name);
  std::vector<unsigned char> payload;
  append_uleb(payload, name_size);
  payload.insert(payload.end(), name, name + name_size);
  payload.insert(payload.end(), data, data + size);
  std::vector<unsigned char> section = {llvm::wasm::WASM_SEC_CUSTOM};
  append_uleb(section, payload.size());
  section.insert(section.end(), payload.begin(), payload.end());

  FILE *file = std::fopen(path.c_str(), "ab");
  if (file == nullptr) {
    std::fprintf(stderr, "dolly-cc: %s: %s\n", path.c_str(),
                 std::strerror(errno));
    return false;
  }
  bool ok = std::fwrite(section.data(), 1, section.size(), file) == section.size();
  if (std::fclose(file) != 0) ok = false;
  if (!ok) std::fprintf(stderr, "dolly-cc: could not stamp %s\n", path.c_str());
  return ok;
}

bool stamp_process_executable(const std::string &output) {
  static_assert(sizeof(DOLLY_PROCESS_ABI_DIGEST) == 32);
  LoadedWasm executable;
  if (!load_wasm(output, executable)) return false;
  unsigned char memory_requirements[16];
  if (!process_memory_requirements(executable, memory_requirements)) return false;
  return append_custom_section(output, "dolly.process",
                               DOLLY_PROCESS_ABI_DIGEST,
                               sizeof(DOLLY_PROCESS_ABI_DIGEST)) &&
         append_custom_section(output, "dolly.process.memory",
                               memory_requirements,
                               sizeof(memory_requirements));
}

bool stamp_process_shared_object(const std::string &output) {
  static_assert(sizeof(DOLLY_PROCESS_ABI_DIGEST) == 32);
  return append_custom_section(output, "dolly.process.dso",
                               DOLLY_PROCESS_ABI_DIGEST,
                               sizeof(DOLLY_PROCESS_ABI_DIGEST));
}

bool stamp_kernel_plugin(const std::string &output) {
  static_assert(sizeof(DOLLY_KERNEL_PLUGIN_ABI_DIGEST) == 32);
  return append_custom_section(output, "dolly.abi", DOLLY_KERNEL_PLUGIN_ABI_DIGEST,
                               sizeof(DOLLY_KERNEL_PLUGIN_ABI_DIGEST));
}

bool publish_file(const std::string &source, const std::string &output) {
  if (std::rename(source.c_str(), output.c_str()) == 0) return true;

  // WasmFS cannot rename across every backend boundary (notably /tmp into a
  // preloaded /usr directory). Build tools start dependents only after this
  // command exits, so they never observe this bounded publication fallback.
  FILE *input = std::fopen(source.c_str(), "rb");
  if (input == nullptr) {
    std::fprintf(stderr, "dolly-cc: could not open staged output: %s\n",
                 std::strerror(errno));
    return false;
  }
  std::remove(output.c_str());
  FILE *target = std::fopen(output.c_str(), "wb");
  if (target == nullptr) {
    std::fprintf(stderr, "dolly-cc: could not publish %s: %s\n",
                 output.c_str(), std::strerror(errno));
    std::fclose(input);
    return false;
  }

  unsigned char buffer[16384];
  bool ok = true;
  size_t count;
  while ((count = std::fread(buffer, 1, sizeof(buffer), input)) != 0) {
    if (std::fwrite(buffer, 1, count, target) != count) {
      ok = false;
      break;
    }
  }
  if (std::ferror(input)) ok = false;
  if (std::fclose(input) != 0) ok = false;
  if (std::fclose(target) != 0) ok = false;
  if (!ok) {
    std::fprintf(stderr, "dolly-cc: could not publish %s\n", output.c_str());
    std::remove(output.c_str());
  }
  return ok;
}

void cleanup(const std::vector<std::string> &paths) {
  for (const std::string &path : paths) std::remove(path.c_str());
}

std::string single_source_language(const DriverOptions &options,
                                  int default_language) {
  return options.inputs.size() == 1
             ? source_language(options.inputs[0], default_language,
                               options.forced_language)
             : "";
}

int preprocess(const DriverOptions &options, int default_language) {
  const std::string language = single_source_language(options, default_language);
  if (options.compile_only || language.empty()) {
    std::fputs("dolly-cc: -E requires exactly one source input\n", stderr);
    return 64;
  }
  if (!run_frontend(options.inputs[0], language, options.output, options)) {
    std::fprintf(stderr, "dolly-cc: preprocessing failed: %s\n",
                 options.inputs[0].c_str());
    return 1;
  }
  return 0;
}

int compile_only(const DriverOptions &options, int default_language) {
  const std::string language = single_source_language(options, default_language);
  if (language.empty()) {
    std::fputs("dolly-cc: -c requires exactly one source input\n", stderr);
    return 64;
  }
  // Like Clang, the default object lands in the working directory.
  const std::string output = options.output.empty()
                                 ? input_stem(options.inputs[0]) + ".o"
                                 : options.output;
  const std::string staged = temporary_path(output, 0, ".o");
  std::remove(staged.c_str());
  if (!run_frontend(options.inputs[0], language, staged, options)) {
    std::fprintf(stderr, "dolly-cc: compilation failed: %s\n",
                 options.inputs[0].c_str());
    std::remove(staged.c_str());
    return 1;
  }
  const bool published = publish_file(staged, output);
  std::remove(staged.c_str());
  return published ? 0 : 1;
}

int compile_and_link(const DriverOptions &options, int default_language) {
  if (options.pthread && (options.shared_library || options.kernel_plugin || options.export_dynamic)) {
    std::fputs("dolly-cc: -pthread requires a static process; shared libraries and -rdynamic are unsupported\n", stderr);
    return 64;
  }
  if (options.kernel_plugin &&
      !options.shared_library) {
    std::fputs("dolly-cc: --dolly-kernel-plugin requires -shared\n", stderr);
    return 64;
  }
  if (options.kernel_plugin && options.link_cxx_runtime) {
    std::fputs("dolly-cc: the C++ runtime belongs to processes, not kernel plugins\n", stderr);
    return 64;
  }
  const std::string output = options.output.empty() ? "a.out" : options.output;
  std::vector<std::string> temporary_objects;
  std::vector<std::string> link_inputs;
  bool needs_cxx_runtime = options.link_cxx_runtime ||
      (default_language == DOLLY_TOOLCHAIN_CXX && !options.no_standard_cxx_runtime);
  for (size_t index = 0; index < options.inputs.size(); index++) {
    const std::string &input = options.inputs[index];
    const std::string language = source_language(
        input, default_language, options.forced_language);
    if (language.empty()) {
      link_inputs.push_back(input);
      continue;
    }
    const std::string object = temporary_path(output, index, ".o");
    std::remove(object.c_str());
    if (language == "c++" && !options.no_standard_cxx_runtime) needs_cxx_runtime = true;
    if (!run_frontend(input, language, object, options)) {
      std::fprintf(stderr, "dolly-cc: compilation failed: %s\n", input.c_str());
      temporary_objects.push_back(object);
      cleanup(temporary_objects);
      return 1;
    }
    temporary_objects.push_back(object);
    link_inputs.push_back(object);
  }

  // Compiler-generated helpers are part of the target runtime, not Dolly's
  // platform substrate. A plugin links them so operations such as 128-bit
  // multiplication do not become kernel-plugin imports; processes get them
  // from their link profile.
  if (options.kernel_plugin) {
    link_inputs.push_back("/usr/lib/libclang_rt.builtins.a");
  }

  const std::string linked =
      temporary_path(output, options.inputs.size() + 1, ".wasm");
  std::remove(linked.c_str());
  const bool linked_ok = options.kernel_plugin
      ? link_side_module(linked, link_inputs, options.linker_options,
                         needs_cxx_runtime,
                         options.debug_info == DebugInfoKind::None)
      : (options.shared_library
             ? link_process_shared_object(linked, link_inputs,
                                          options.linker_options,
                                          options.debug_info == DebugInfoKind::None)
             : link_process_executable(linked, link_inputs,
                                       options.linker_options,
                                       needs_cxx_runtime,
                                       options.export_dynamic,
                                       options.debug_info == DebugInfoKind::None, options.pthread));
  if (!linked_ok) {
    std::fprintf(stderr, "dolly-cc: link failed: %s\n", output.c_str());
    cleanup(temporary_objects);
    std::remove(linked.c_str());
    return 1;
  }
  cleanup(temporary_objects);
  const bool valid = options.kernel_plugin
      ? validate_kernel_plugin(linked)
      : (options.shared_library
             ? validate_process_shared_object(linked)
             : validate_process_executable(linked));
  const bool stamped = valid && (options.kernel_plugin
      ? stamp_kernel_plugin(linked)
      : (options.shared_library ? stamp_process_shared_object(linked)
                                : stamp_process_executable(linked)));
  const bool published = stamped && publish_file(linked, output);
  std::remove(linked.c_str());
  return published ? 0 : 1;
}

int run_archive(int argc, const char *const *argv) {
  if (argc == 2 && std::strcmp(argv[1], "--help") == 0) {
    print_help(argv[0], DOLLY_TOOLCHAIN_AR);
    return 0;
  }
  if (argc == 2 && std::strcmp(argv[1], "--version") == 0) {
    std::puts("dolly ar: LLVM 24 deterministic GNU archives");
    return 0;
  }
  if (argc < 3) {
    print_help(argv[0], DOLLY_TOOLCHAIN_AR);
    return 64;
  }
  std::string operation = argv[1];
  if (!operation.empty() && operation[0] == '-') operation.erase(0, 1);
  // r replaces members of the same name, q appends, s alone rewrites the index.
  const bool replace = operation.find('r') != std::string::npos;
  const bool append = operation.find('q') != std::string::npos;
  if (operation.find_first_not_of("rqcsD") != std::string::npos || (replace && append) ||
      (!replace && !append && operation.find('s') == std::string::npos)) {
    std::fprintf(stderr,
                 "%s: only deterministic archive updates with r, q or s and [c][s][D] are supported\n",
                 argv[0]);
    return 64;
  }

  std::vector<llvm::NewArchiveMember> members;
  auto archive_bytes = llvm::MemoryBuffer::getFile(argv[2], false, false);
  if (archive_bytes) {
    auto archive = llvm::object::Archive::create((*archive_bytes)->getMemBufferRef());
    if (!archive) {
      std::fprintf(stderr, "%s: %s: %s\n", argv[0], argv[2],
                   error_text(archive.takeError()).c_str());
      return 1;
    }
    if ((*archive)->isThin()) {
      std::fprintf(stderr, "%s: %s: thin archive updates are unsupported\n", argv[0], argv[2]);
      return 1;
    }
    llvm::Error error = llvm::Error::success();
    for (const auto &child : (*archive)->children(error)) {
      auto member = llvm::NewArchiveMember::getOldMember(child, true);
      if (!member) {
        error = member.takeError();
        break;
      }
      members.push_back(std::move(*member));
    }
    if (error) {
      std::fprintf(stderr, "%s: %s: %s\n", argv[0], argv[2],
                   error_text(std::move(error)).c_str());
      return 1;
    }
  } else if (archive_bytes.getError() != std::errc::no_such_file_or_directory || (!replace && !append)) {
    std::fprintf(stderr, "%s: %s: %s\n", argv[0], argv[2],
                 archive_bytes.getError().message().c_str());
    return 1;
  }
  std::vector<bool> replaced(members.size(), false);
  for (int index = 3; index < argc; index++) {
    llvm::Expected<llvm::NewArchiveMember> member =
        llvm::NewArchiveMember::getFile(argv[index], true);
    if (!member) {
      std::fprintf(stderr, "%s: %s: %s\n", argv[0], argv[index],
                   error_text(member.takeError()).c_str());
      return 1;
    }
    member->MemberName = llvm::sys::path::filename(member->MemberName);
    size_t existing = append ? replaced.size() : 0;
    while (existing < replaced.size() &&
           (replaced[existing] || members[existing].MemberName != member->MemberName)) ++existing;
    if (existing == replaced.size()) members.push_back(std::move(*member));
    else {
      members[existing] = std::move(*member);
      replaced[existing] = true;
    }
  }

  const std::string staged = temporary_path(argv[2], 0, ".a");
  std::remove(staged.c_str());
  llvm::Error error = llvm::writeArchive(
      staged, members, llvm::SymtabWritingMode::NormalSymtab,
      llvm::object::Archive::K_GNU, true, false);
  if (error) {
    std::fprintf(stderr, "%s: could not create %s: %s\n", argv[0], argv[2],
                 error_text(std::move(error)).c_str());
    std::remove(staged.c_str());
    return 1;
  }
  const bool published = publish_file(staged, argv[2]);
  std::remove(staged.c_str());
  return published ? 0 : 1;
}

} // namespace

extern "C" int dolly_toolchain_main(int argc, char **argv,
                                      int default_language) {
  if (argc < 1 || argv == nullptr || argv[0] == nullptr ||
      (default_language != DOLLY_TOOLCHAIN_C &&
       default_language != DOLLY_TOOLCHAIN_CXX &&
       default_language != DOLLY_TOOLCHAIN_LD &&
       default_language != DOLLY_TOOLCHAIN_AR)) {
    return 64;
  }
  llvm::BumpPtrAllocator response_allocator;
  llvm::StringSaver response_saver(response_allocator);
  llvm::SmallVector<const char *, 16> arguments(argv, argv + argc);
  if (!llvm::cl::ExpandResponseFiles(response_saver,
          llvm::cl::TokenizeGNUCommandLine, arguments) || arguments.size() > INT_MAX)
    return 64;
  argc = static_cast<int>(arguments.size());
  if (default_language == DOLLY_TOOLCHAIN_AR) {
    return run_archive(argc, arguments.data());
  }
  DriverOptions options;
  const int parse_status = parse_driver_options(argc, arguments.data(), options,
                                                default_language);
  if (parse_status > 0) return 0;
  if (parse_status < 0) return 64;
  if (options.linker_version && options.inputs.empty() &&
      !options.compile_only && !options.preprocess_only) {
    std::puts("LLD 24.0.0 (Dolly wasm-ld)");
    return 0;
  }
  if (options.print_search_dirs && options.inputs.empty() &&
      !options.compile_only && !options.preprocess_only) {
    // Match the conventional GCC/Clang query shape used by Meson and other
    // build frontends. These are target paths inside Dolly's shared kernel
    // filesystem; no browser or host path is exposed.
    std::puts("install: /usr/lib/clang/24");
    std::puts("programs: =/usr/bin");
    std::puts("libraries: =/usr/lib:/usr/lib/dolly/process");
    return 0;
  }
  if (options.dump_macros && !options.preprocess_only) {
    std::fprintf(stderr, "%s: -dM requires -E\n", argv[0]);
    return 64;
  }
  if (options.inputs.empty()) {
    std::fprintf(stderr, "%s: no input files\n", argv[0]);
    return 64;
  }
  if (default_language == DOLLY_TOOLCHAIN_LD) {
    if (options.compile_only || options.preprocess_only) {
      std::fprintf(stderr, "%s: compilation options are not accepted by ld\n",
                   argv[0]);
      return 64;
    }
    if (!options.forced_language.empty() || !options.frontend_options.empty()) {
      std::fprintf(stderr, "%s: compilation options are not accepted by ld\n",
                   argv[0]);
      return 64;
    }
    for (const std::string &input : options.inputs) {
      if (!source_language(input, DOLLY_TOOLCHAIN_C, "").empty()) {
        std::fprintf(stderr, "%s: ld does not compile source input: %s\n",
                     argv[0], input.c_str());
        return 64;
      }
    }
  }

  if (options.preprocess_only) {
    return preprocess(options, default_language);
  }
  return options.compile_only
             ? compile_only(options, default_language)
             : compile_and_link(options,
                                default_language == DOLLY_TOOLCHAIN_LD
                                    ? DOLLY_TOOLCHAIN_C
                                    : default_language);
}

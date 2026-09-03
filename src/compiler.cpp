#include <cerrno>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <dlfcn.h>
#include <limits.h>
#include <unistd.h>
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
#include <llvm/BinaryFormat/Wasm.h>
#include <llvm/Object/Archive.h>
#include <llvm/Object/ArchiveWriter.h>
#include <llvm/Object/Wasm.h>
#include <llvm/Support/Error.h>
#include <llvm/Support/CommandLine.h>
#include <llvm/Support/MemoryBuffer.h>
#include <llvm/Support/TargetSelect.h>
#include <llvm/Support/VirtualFileSystem.h>
#include <llvm/Support/raw_ostream.h>

#include <dolly/toolchain.h>

#include "dolly-abi-digest.h"

LLD_HAS_DRIVER(wasm)

namespace {

constexpr const char *kContractPath = "/usr/lib/dolly/dolly-0.wasm";

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
  bool dependency_output = false;
  bool include_system_dependencies = false;
  bool end_options = false;
  bool edge_interrupt_safepoints = true;
  bool exceptions_disabled = false;
  bool optimization_selected = false;
  bool export_dynamic = false;
  bool shared_library = false;
  bool standard_selected = false;
  DebugInfoKind debug_info = DebugInfoKind::None;
  std::string output;
  std::string forced_language;
  std::string dependency_file;
  std::string dependency_target;
  std::vector<std::string> frontend_options;
  std::vector<std::string> inputs;
  std::vector<std::string> linker_options;
};

struct RawSignature {
  bool callable = false;
  std::vector<uint8_t> returns;
  std::vector<uint8_t> params;
};

struct LoadedWasm {
  std::unique_ptr<llvm::MemoryBuffer> bytes;
  std::unique_ptr<llvm::object::WasmObjectFile> object;
  bool signatures_parsed = false;
  std::vector<RawSignature> signatures;
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

bool is_object(const std::string &path) {
  return ends_with(path, ".o");
}

bool is_archive(const std::string &path) {
  return ends_with(path, ".a");
}

bool is_linker_option(const std::string &argument) {
  return starts_with(argument, "-L") || starts_with(argument, "-l");
}

std::string inferred_language(const std::string &path,
                              int default_language,
                              const std::string &forced_language) {
  if (!forced_language.empty()) return forced_language;
  if (default_language == DOLLY_TOOLCHAIN_CXX) return "c++";
  if (ends_with(path, ".cc") || ends_with(path, ".cpp") ||
      ends_with(path, ".cxx") || ends_with(path, ".C")) {
    return "c++";
  }
  return "c";
}

std::string object_output_for(const std::string &source) {
  const size_t slash = source.find_last_of('/');
  const size_t dot = source.find_last_of('.');
  if (dot != std::string::npos &&
      (slash == std::string::npos || dot > slash)) {
    return source.substr(0, dot) + ".o";
  }
  return source + ".o";
}

std::string temporary_path(unsigned long long job, size_t index,
                           const char *suffix) {
  char path[128];
  std::snprintf(path, sizeof(path), "/tmp/dolly-cc-%llu-%zu%s",
                job, index, suffix);
  return path;
}

void print_help(const char *program, int driver_mode) {
  if (driver_mode == DOLLY_TOOLCHAIN_LD) {
    std::printf("usage: %s [-o FILE] [-L DIR] [-l NAME] INPUT.o|INPUT.a...\n",
                program);
    return;
  }
  if (driver_mode == DOLLY_TOOLCHAIN_AR) {
    std::printf("usage: %s rcs ARCHIVE MEMBER.o...\n", program);
    return;
  }
  std::printf(
      "usage: %s [OPTIONS] INPUT...\n"
      "  -c                 compile one source file without linking\n"
      "  -E                 preprocess one source file without compiling\n"
      "  -dM                print macro definitions in -E mode\n"
      "  -shared            build a loadable Dolly shared object\n"
      "  -rdynamic          export command symbols for later shared objects\n"
      "  -o FILE            write the object or executable to FILE\n"
      "  -x c|c++           override source language\n"
      "  -std=STANDARD      select a C or C++ language standard\n"
      "  -O0|-O1|-O2|-O3|-Os|-Oz\n"
      "                     select optimization level\n"
      "  -I DIR, -D NAME, -U NAME, -include FILE\n"
      "                     pass a preprocessing option\n"
      "  -funsigned-char    use unsigned plain char\n"
      "  -fdolly-runtime-interrupt-handler\n"
      "                     use a runtime-owned interrupt poller instead of edge safepoints\n"
      "  -fno-sanitize-coverage\n"
      "                     omit Dolly edge safepoints from a support-library object\n"
      "  -fno-exceptions    compile C++ without exception throwing or catching\n"
      "  -fno-rtti          compile C++ without runtime type information\n"
      "  -Wall, -Wextra, -Werror, -Wno-NAME\n"
      "                     configure diagnostics\n"
      "  --help             display this help\n"
      "  --version          display the embedded toolchain version\n",
      program);
}

bool take_option_value(int argc, char **argv, int &index,
                       const char *option, std::string &value) {
  if (index + 1 >= argc) {
    std::fprintf(stderr, "%s: %s requires an argument\n", argv[0], option);
    return false;
  }
  value = argv[++index];
  return true;
}

int parse_driver_options(int argc, char **argv, DriverOptions &options,
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
      std::puts("dolly toolchain: Clang/LLD 24, wasm64-unknown-emscripten");
      return 1;
    } else if (argument == "-c") {
      options.compile_only = true;
    } else if (argument == "-E") {
      options.preprocess_only = true;
    } else if (argument == "-dM") {
      options.dump_macros = true;
    } else if (argument == "-MD" || argument == "-MMD") {
      options.dependency_output = true;
      options.include_system_dependencies = argument == "-MD";
    } else if (argument == "-MF") {
      if (!take_option_value(argc, argv, index, "-MF",
                             options.dependency_file)) return -1;
    } else if (argument == "-MQ" || argument == "-MT") {
      if (!take_option_value(argc, argv, index, argument.c_str(),
                             options.dependency_target)) return -1;
    } else if (argument == "-shared") {
      options.shared_library = true;
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
    } else if (starts_with(argument, "-std=")) {
      options.standard_selected = true;
      options.frontend_options.push_back(argument);
    } else if (argument == "-O0" || argument == "-O1" ||
               argument == "-O2" || argument == "-O3" ||
               argument == "-Os" || argument == "-Oz") {
      options.optimization_selected = true;
      options.frontend_options.push_back(argument);
    } else if (argument == "-funsigned-char") {
      // Clang's public driver spelling maps to this cc1/frontend spelling.
      options.frontend_options.push_back("-fno-signed-char");
    } else if (argument == "-fdolly-runtime-interrupt-handler") {
      // Language runtimes with a native bytecode interrupt hook can unwind and
      // release their own heap safely. Their hook must call
      // dolly_interrupt_poll(); the target-level edge callback is omitted so
      // it cannot longjmp past runtime cleanup first.
      options.edge_interrupt_safepoints = false;
    } else if (argument == "-fno-sanitize-coverage") {
      // Runtime support archives are not executable commands and are linked
      // into instrumented callers. Avoid multiplying compile time and object
      // size by inserting a callback on every libc++ control-flow edge.
      options.edge_interrupt_safepoints = false;
    } else if (argument == "-fno-exceptions") {
      // Emscripten's ordinary default is -fignore-exceptions. Bootstrap
      // libraries and build tools can opt into the smaller, explicit
      // no-exception target profile used by Dolly version 0.
      options.exceptions_disabled = true;
    } else if (argument == "-fno-rtti") {
      options.frontend_options.push_back("-fno-rtti");
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
    } else if (argument == "-m64" || argument == "-sMEMORY64=1") {
      // Dolly has one fixed wasm64 target. CPython sysconfig retains these
      // ordinary Emscripten driver assertions; accepting them cannot switch
      // pointer width or enable a browser capability.
    } else if (argument == "-fPIC" || argument == "-fpic" ||
               argument == "-pthread" || argument == "-pipe") {
      // Dolly objects are always PIC and the version-0 runtime is serialized.
    } else if (argument == "-fdiagnostics-color=always") {
      options.frontend_options.push_back("-fcolor-diagnostics");
    } else if (argument == "-fdiagnostics-color=never") {
      options.frontend_options.push_back("-fno-color-diagnostics");
    } else if (argument == "-fdiagnostics-color=auto") {
      // Diagnostics are emitted through the active in-Wasm descriptor. Clang's
      // auto decision has no native terminal to query, so retain plain output.
    } else if (starts_with(argument, "-fvisibility=")) {
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
               (starts_with(argument, "-W") &&
                !starts_with(argument, "-Wl,"))) {
      options.frontend_options.push_back(argument);
    } else if (argument == "-I" || argument == "-D" ||
               argument == "-U" || argument == "-include" ||
               argument == "-isystem") {
      std::string value;
      if (!take_option_value(argc, argv, index, argument.c_str(), value)) return -1;
      options.frontend_options.push_back(argument);
      options.frontend_options.push_back(value);
    } else if ((starts_with(argument, "-I") || starts_with(argument, "-D") ||
                starts_with(argument, "-U")) && argument.size() > 2) {
      options.frontend_options.push_back(argument);
    } else if (argument == "-L" || argument == "-l") {
      std::string value;
      if (!take_option_value(argc, argv, index, argument.c_str(), value)) return -1;
      options.inputs.push_back(argument + value);
    } else if ((starts_with(argument, "-L") || starts_with(argument, "-l")) &&
               argument.size() > 2) {
      options.inputs.push_back(argument);
    } else if (starts_with(argument, "-Wl,")) {
      size_t begin = 4;
      while (begin <= argument.size()) {
        const size_t comma = argument.find(',', begin);
        const std::string option = argument.substr(
            begin, comma == std::string::npos ? std::string::npos : comma - begin);
        // ELF sonames and as-needed have no meaning for Emscripten side modules.
        if (option == "--version" || option == "-v") {
          options.linker_version = true;
        } else if (!option.empty() && !starts_with(option, "-h") &&
            option != "--no-as-needed" && option != "--as-needed" &&
            option != "--no-undefined") {
          // Dolly validates the exact typed import set after linking, which is
          // the target-equivalent of --no-undefined for permitted ABI imports.
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

bool run_frontend(const std::string &source, const std::string &language,
                  const std::string &output,
                  const DriverOptions &options) {
  if (const char *trace = std::getenv("DOLLY_CC_TRACE");
      trace != nullptr && std::strcmp(trace, "1") == 0) {
    if (FILE *trace_file = std::fopen("/tmp/dolly-cc-trace.log", "w")) {
      std::fprintf(trace_file, "dolly-cc: compiling %s as %s", source.c_str(),
                   language.c_str());
      for (const std::string &option : options.frontend_options) {
        std::fprintf(trace_file, " %s", option.c_str());
      }
      std::fputc('\n', trace_file);
      std::fclose(trace_file);
    }
  }
  static bool targets_initialized = false;
  if (!targets_initialized) {
    llvm::InitializeAllTargets();
    llvm::InitializeAllTargetMCs();
    llvm::InitializeAllAsmPrinters();
    llvm::InitializeAllAsmParsers();
    targets_initialized = true;
  }

  std::vector<std::string> arguments = {
      "-triple", "wasm64-unknown-emscripten",
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
        "-mrelocation-model", "pic",
        "-pic-level", "2",
        "-mframe-pointer=none",
        "-ffp-contract=on",
        "-mconstructor-aliases",
    });
  }
  arguments.insert(arguments.end(), {
      "-target-cpu", "generic",
      "-target-feature", "+mutable-globals",
      "-target-feature", "+atomics",
      "-target-feature", "+bulk-memory",
      "-resource-dir", "/usr/lib/clang/24",
      "-D", "main=dolly_main",
      "-D", "exit=dolly_exit",
      "-D", "fclose=dolly_fclose",
      "-D", "system=dolly_system",
      "-D", "popen=dolly_popen",
      "-D", "pclose=dolly_pclose",
      "-D", "__assert_fail=dolly_assert_fail",
      "-D", "atexit=dolly_atexit",
      "-D", "chmod=dolly_chmod",
      "-D", "umask=dolly_umask",
      "-D", "getpass=dolly_getpass",
      "-D", "getrandom=dolly_getrandom",
      "-D", "isatty=dolly_isatty",
      "-D", "fork=dolly_fork",
      "-D", "execve=dolly_execve",
      "-D", "execvp=dolly_execvp",
      "-D", "execl=dolly_execl",
      "-D", "execlp=dolly_execlp",
      "-D", "waitpid=dolly_waitpid",
      "-D", "wait=dolly_wait_any",
      "-D", "kill=dolly_kill",
      "-D", "setsid=dolly_setsid",
      "-D", "getpgid=dolly_getpgid",
      "-D", "tcgetpgrp=dolly_tcgetpgrp",
      "-D", "alarm=dolly_alarm",
      "-D", "sleep=dolly_sleep",
      "-D", "setitimer=dolly_setitimer",
      "-D", "select=dolly_select",
      "-D", "_exit=dolly__exit",
      "-D", "socket=dolly_socket",
      "-D", "connect=dolly_connect",
      "-D", "recv=dolly_recv",
      "-D", "setsockopt=dolly_setsockopt",
      "-D", "shutdown=dolly_shutdown",
      "-D", "gethostbyname=dolly_gethostbyname",
      "-D", "getservbyname=dolly_getservbyname",
      "-D", "dlopen=dolly_dlopen",
      "-D", "dlsym=dolly_dlsym",
      "-D", "dlerror=dolly_dlerror",
      "-D", "dlclose=dolly_dlclose",
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
      "-fvisibility=hidden",
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
      const char *backend_arguments[] = {
          "dolly-cc",
          "-combiner-global-alias-analysis=false",
          "-enable-emscripten-sjlj",
          "-disable-lsr",
      };
      llvm::cl::ParseCommandLineOptions(
          sizeof(backend_arguments) / sizeof(backend_arguments[0]),
          backend_arguments);
      backend_options_initialized = true;
    }
  }
  if (!options.preprocess_only && options.edge_interrupt_safepoints) {
    // Browser Wasm cannot preempt a running function the way a kernel can.
    // Edge callbacks are Dolly's target-level SIGINT safepoints, including
    // loop backedges; the callback itself lives in the main runtime.
    arguments.insert(arguments.end(), {
        "-fsanitize-coverage-type=3",
        "-fsanitize-coverage-trace-pc",
        "-fsanitize-coverage-no-prune",
    });
  }
  if (!options.optimization_selected) arguments.push_back("-O2");
  if (!options.standard_selected) {
    arguments.push_back(language == "c++" ? "-std=c++23" : "-std=c17");
  }
  if (language == "c++") {
    // Dolly links a command-local libc++ built with hidden, strong target
    // definitions. Keep libc++'s inline/template definitions hidden too, so
    // wasm-ld does not turn weak default-visible definitions back into main-
    // module imports as Emscripten SIDE_MODULE normally expects.
    arguments.insert(arguments.end(), {
        "-D", "_LIBCPP_DISABLE_VISIBILITY_ANNOTATIONS",
    });
    if (!options.exceptions_disabled) {
      // Emscripten's default exception profile accepts throw/catch syntax but
      // lowers it through the target's ignored-exception mode. Clang cc1 has
      // no `-fno-exceptions` spelling: disabling means omitting this option.
      arguments.push_back("-fignore-exceptions");
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
  if (!options.preprocess_only && options.dependency_output &&
      !options.dependency_file.empty()) {
    arguments.insert(arguments.end(), {
        "-dependency-file", options.dependency_file,
    });
    if (!options.dependency_target.empty()) {
      arguments.insert(arguments.end(), {"-MT", options.dependency_target});
    }
    if (options.include_system_dependencies) {
      arguments.push_back("-sys-header-deps");
    }
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

bool link_side_module(const std::string &output,
                      const std::vector<std::string> &inputs,
                      const std::vector<std::string> &linker_options,
                      bool export_dynamic, bool bind_defined_locally) {
  std::vector<std::string> arguments = {
      "wasm-ld",
      "-o", output,
      "-Bdynamic",
      // Parallel section merging can assign equal-priority chunks in
      // scheduler order. Stable module-cache snapshots require fixed bytes.
      "--threads=1",
      "--shared-memory",
      // The pinned non-threaded libc++ archives intentionally lack the
      // atomics/bulk-memory feature marker. Dolly's final side module uses
      // shared memory64, while those serialized library objects contain no
      // pthread behavior. This is the same deliberate mix accepted when
      // linking the main runtime.
      "--no-check-features",
      "--export=__wasm_call_ctors",
      "--unresolved-symbols=import-dynamic",
      "-shared",
      "--stack-first",
      "--extra-features=extended-const",
  };
  arguments.push_back(export_dynamic ? "--export-dynamic" : "--no-export-dynamic");
  // A C++ command carries its pinned libc++ implementation. Without symbolic
  // binding, wasm-ld keeps references to those default-visible definitions as
  // preemptible dynamic imports, which would leak libc++ into dolly-0.
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

bool load_wasm(const std::string &path, LoadedWasm &loaded);

enum class EntryForm {
  Missing,
  NoArguments,
  Arguments,
  ArgumentsAndEnvironment,
  Unsupported,
};

EntryForm object_entry_form(const std::string &path, std::string &entry_symbol) {
  LoadedWasm loaded;
  if (!load_wasm(path, loaded)) return EntryForm::Unsupported;

  EntryForm result = EntryForm::Missing;
  for (const llvm::object::SymbolRef &symbol : loaded.object->symbols()) {
    llvm::Expected<llvm::StringRef> name = symbol.getName();
    if (!name) {
      llvm::consumeError(name.takeError());
      return EntryForm::Unsupported;
    }
    const bool c_entry = *name == "dolly_main";
    const bool cxx_entry = name->starts_with("_Z10dolly_main");
    if (!c_entry && !cxx_entry) continue;

    const llvm::object::WasmSymbol &wasm_symbol =
        loaded.object->getWasmSymbol(symbol);
    if (!wasm_symbol.isTypeFunction() || wasm_symbol.isUndefined() ||
        wasm_symbol.Signature == nullptr) {
      continue;
    }
    if (result != EntryForm::Missing) return EntryForm::Unsupported;

    const llvm::wasm::WasmSignature &signature = *wasm_symbol.Signature;
    if (signature.Returns.size() != 1 ||
        signature.Returns[0] != llvm::wasm::ValType::I32) {
      return EntryForm::Unsupported;
    }
    if (signature.Params.empty()) {
      result = EntryForm::NoArguments;
    } else if (signature.Params.size() == 2 &&
               signature.Params[0] == llvm::wasm::ValType::I32 &&
               signature.Params[1] == llvm::wasm::ValType::I64) {
      result = EntryForm::Arguments;
    } else if (signature.Params.size() == 3 &&
               signature.Params[0] == llvm::wasm::ValType::I32 &&
               signature.Params[1] == llvm::wasm::ValType::I64 &&
               signature.Params[2] == llvm::wasm::ValType::I64) {
      result = EntryForm::ArgumentsAndEnvironment;
    } else {
      return EntryForm::Unsupported;
    }
    entry_symbol = name->str();
  }
  return result;
}

EntryForm linked_entry_form(const std::vector<std::string> &inputs,
                            std::string &entry_symbol) {
  EntryForm result = EntryForm::Missing;
  for (const std::string &input : inputs) {
    if (!is_object(input)) continue;
    std::string current_symbol;
    const EntryForm current = object_entry_form(input, current_symbol);
    if (current == EntryForm::Unsupported) return current;
    if (current == EntryForm::Missing) continue;
    if (result != EntryForm::Missing) return EntryForm::Unsupported;
    result = current;
    entry_symbol = std::move(current_symbol);
  }
  return result;
}

bool write_entry_wrapper(const std::string &path, EntryForm form,
                         const std::string &entry_symbol) {
  const char *parameters = nullptr;
  const char *call = nullptr;
  const char *environment = "";
  switch (form) {
    case EntryForm::NoArguments:
      parameters = "void";
      call = "(void)argc; (void)argv; return dolly_source_main();";
      break;
    case EntryForm::Arguments:
      parameters = "int, char **";
      call = "return dolly_source_main(argc, argv);";
      break;
    case EntryForm::ArgumentsAndEnvironment:
      parameters = "int, char **, char **";
      call = "return dolly_source_main(argc, argv, environ);";
      environment = "extern char **environ;\n";
      break;
    default:
      return false;
  }

  FILE *file = std::fopen(path.c_str(), "wb");
  if (file == nullptr) return false;
  bool ok = std::fprintf(
                file,
                "%sextern int dolly_source_main(%s) __asm__(\"%s\");\n"
                "__attribute__((export_name(\"dolly_main\")))\n"
                "int dolly_entry(int argc, char **argv) { %s }\n",
                environment, parameters, entry_symbol.c_str(), call) >= 0;
  if (std::fclose(file) != 0) ok = false;
  if (!ok) std::remove(path.c_str());
  return ok;
}

std::string entry_wrapper_key(EntryForm form, const std::string &entry_symbol) {
  return std::to_string(static_cast<int>(form)) + "\n" + entry_symbol;
}

std::map<std::string, std::vector<unsigned char>> entry_wrapper_objects;

bool cache_entry_wrapper(EntryForm form, const char *entry_symbol,
                         size_t index) {
  const std::string source = temporary_path(0, index, "-entry-cache.c");
  const std::string object = temporary_path(0, index, "-entry-cache.o");
  std::remove(source.c_str());
  std::remove(object.c_str());
  DriverOptions options;
  options.edge_interrupt_safepoints = false;
  const bool compiled =
      write_entry_wrapper(source, form, entry_symbol) &&
      run_frontend(source, "c", object, options);
  std::remove(source.c_str());
  if (!compiled) {
    std::remove(object.c_str());
    return false;
  }
  llvm::ErrorOr<std::unique_ptr<llvm::MemoryBuffer>> buffer =
      llvm::MemoryBuffer::getFile(object);
  std::remove(object.c_str());
  if (!buffer) return false;
  const llvm::StringRef bytes = buffer.get()->getBuffer();
  entry_wrapper_objects.emplace(
      entry_wrapper_key(form, entry_symbol),
      std::vector<unsigned char>(bytes.bytes_begin(), bytes.bytes_end()));
  return true;
}

bool initialize_entry_wrapper_objects() {
  static bool initialized = false;
  if (initialized) return true;
  struct WrapperDefinition {
    EntryForm form;
    const char *c_symbol;
    const char *cxx_symbol;
  };
  static constexpr WrapperDefinition definitions[] = {
      {EntryForm::NoArguments, "dolly_main", "_Z10dolly_mainv"},
      {EntryForm::Arguments, "dolly_main", "_Z10dolly_mainiPPc"},
      {EntryForm::ArgumentsAndEnvironment, "dolly_main",
       "_Z10dolly_mainiPPcS0_"},
  };
  size_t index = 0;
  for (const WrapperDefinition &definition : definitions) {
    if (!cache_entry_wrapper(definition.form, definition.c_symbol, index++) ||
        !cache_entry_wrapper(definition.form, definition.cxx_symbol, index++)) {
      entry_wrapper_objects.clear();
      return false;
    }
  }
  initialized = true;
  return true;
}

bool write_cached_entry_wrapper(const std::string &path, EntryForm form,
                                const std::string &entry_symbol) {
  const auto found = entry_wrapper_objects.find(
      entry_wrapper_key(form, entry_symbol));
  if (found == entry_wrapper_objects.end()) return false;
  FILE *file = std::fopen(path.c_str(), "wb");
  if (file == nullptr) return false;
  const std::vector<unsigned char> &bytes = found->second;
  bool ok = std::fwrite(bytes.data(), 1, bytes.size(), file) == bytes.size();
  if (std::fclose(file) != 0) ok = false;
  if (!ok) std::remove(path.c_str());
  return ok;
}

std::string error_text(llvm::Error error) {
  std::string text;
  llvm::raw_string_ostream stream(text);
  llvm::logAllUnhandledErrors(std::move(error), stream);
  stream.flush();
  return text;
}

class WasmByteReader {
 public:
  WasmByteReader(const uint8_t *bytes, size_t size)
      : bytes_(bytes), size_(size) {}

  bool empty() const { return offset_ == size_; }
  size_t remaining() const { return size_ - offset_; }

  bool read_u8(uint8_t &value) {
    if (offset_ == size_) return false;
    value = bytes_[offset_++];
    return true;
  }

  bool read_u32(uint32_t &value) {
    value = 0;
    for (unsigned shift = 0; shift < 35; shift += 7) {
      uint8_t byte = 0;
      if (!read_u8(byte)) return false;
      if (shift == 28 && (byte & 0xf0) != 0) return false;
      value |= static_cast<uint32_t>(byte & 0x7f) << shift;
      if ((byte & 0x80) == 0) return true;
    }
    return false;
  }

  bool skip(size_t count) {
    if (count > remaining()) return false;
    offset_ += count;
    return true;
  }

  bool subreader(size_t count, WasmByteReader &reader) {
    if (count > remaining()) return false;
    reader = WasmByteReader(bytes_ + offset_, count);
    offset_ += count;
    return true;
  }

 private:
  const uint8_t *bytes_ = nullptr;
  size_t size_ = 0;
  size_t offset_ = 0;
};

bool is_callable_value_type(uint8_t type) {
  return type == 0x7f || type == 0x7e || type == 0x7d || type == 0x7c ||
         type == 0x7b || type == 0x70 || type == 0x6f;
}

bool read_signature_vector(WasmByteReader &reader,
                           std::vector<uint8_t> &types) {
  uint32_t count = 0;
  if (!reader.read_u32(count) || count > reader.remaining()) return false;
  types.reserve(count);
  for (uint32_t index = 0; index < count; index++) {
    uint8_t type = 0;
    if (!reader.read_u8(type) || !is_callable_value_type(type)) return false;
    types.push_back(type);
  }
  return true;
}

bool skip_field_definition(WasmByteReader &reader) {
  uint8_t storage_type = 0;
  uint32_t mutable_field = 0;
  if (!reader.read_u8(storage_type)) return false;
  if (storage_type == llvm::wasm::WASM_TYPE_NULLABLE ||
      storage_type == llvm::wasm::WASM_TYPE_NONNULLABLE) {
    // Heap types are signed LEB33. Reading their bytes as an unsigned LEB is
    // sufficient while skipping because only termination and bounds matter.
    uint32_t heap_type = 0;
    if (!reader.read_u32(heap_type)) return false;
  }
  return reader.read_u32(mutable_field);
}

bool parse_raw_signatures(llvm::MemoryBufferRef buffer,
                          std::vector<RawSignature> &signatures) {
  const auto *bytes = reinterpret_cast<const uint8_t *>(buffer.getBufferStart());
  WasmByteReader reader(bytes, buffer.getBufferSize());
  static constexpr uint8_t header[] = {
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  };
  for (uint8_t expected : header) {
    uint8_t actual = 0;
    if (!reader.read_u8(actual) || actual != expected) return false;
  }

  bool saw_type_section = false;
  while (!reader.empty()) {
    uint8_t section_id = 0;
    uint32_t section_size = 0;
    if (!reader.read_u8(section_id) || !reader.read_u32(section_size)) {
      return false;
    }
    WasmByteReader section(nullptr, 0);
    if (!reader.subreader(section_size, section)) return false;
    if (section_id != llvm::wasm::WASM_SEC_TYPE) continue;
    if (saw_type_section) return false;
    saw_type_section = true;

    uint32_t count = 0;
    if (!section.read_u32(count) || count > section.remaining()) return false;
    signatures.reserve(count);
    uint64_t remaining_types = count;
    while (remaining_types-- != 0) {
      uint8_t form = 0;
      RawSignature signature;
      if (!section.read_u8(form)) return false;
      if (form == llvm::wasm::WASM_TYPE_REC) {
        uint32_t recursive_types = 0;
        if (!section.read_u32(recursive_types) || recursive_types == 0 ||
            remaining_types + recursive_types > UINT32_MAX) {
          return false;
        }
        remaining_types += recursive_types;
        signatures.push_back(std::move(signature));
        continue;
      }
      if (form == llvm::wasm::WASM_TYPE_SUB ||
          form == llvm::wasm::WASM_TYPE_SUB_FINAL) {
        uint32_t super_types = 0;
        if (!section.read_u32(super_types) || super_types > 1) return false;
        if (super_types == 1) {
          uint32_t super_index = 0;
          if (!section.read_u32(super_index)) return false;
        }
        if (!section.read_u8(form)) return false;
      }
      if (form == llvm::wasm::WASM_TYPE_FUNC) {
        signature.callable = true;
        if (!read_signature_vector(section, signature.params) ||
            !read_signature_vector(section, signature.returns)) {
          return false;
        }
      } else if (form == llvm::wasm::WASM_TYPE_STRUCT) {
        uint32_t fields = 0;
        if (!section.read_u32(fields) || fields > section.remaining()) return false;
        while (fields-- != 0) {
          if (!skip_field_definition(section)) return false;
        }
      } else if (form == llvm::wasm::WASM_TYPE_ARRAY) {
        if (!skip_field_definition(section)) return false;
      } else {
        return false;
      }
      signatures.push_back(std::move(signature));
    }
    if (!section.empty()) return false;
  }
  return saw_type_section;
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
  std::vector<RawSignature> signatures;
  const bool signatures_parsed =
      parse_raw_signatures(bytes.get()->getMemBufferRef(), signatures);
  loaded.bytes = std::move(bytes.get());
  loaded.object = std::move(object);
  loaded.signatures_parsed = signatures_parsed;
  loaded.signatures = std::move(signatures);
  return true;
}

std::string interface_key(llvm::StringRef module, llvm::StringRef field) {
  return module.str() + "\n" + field.str();
}

const char *wat_value_type(uint8_t type) {
  switch (type) {
    case 0x7f: return "i32";
    case 0x7e: return "i64";
    case 0x7d: return "f32";
    case 0x7c: return "f64";
    case 0x7b: return "v128";
    case 0x70: return "funcref";
    case 0x6f: return "externref";
    default: return "unknown";
  }
}

void print_import_signature(const LoadedWasm &loaded,
                            const llvm::wasm::WasmImport &entry) {
  if (entry.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION ||
      entry.SigIndex >= loaded.signatures.size()) {
    return;
  }
  const RawSignature &signature = loaded.signatures[entry.SigIndex];
  std::fprintf(stderr, "  (import \"%s\" \"%s\" (func",
               entry.Module.str().c_str(), entry.Field.str().c_str());
  if (!signature.params.empty()) {
    std::fputs(" (param", stderr);
    for (uint8_t type : signature.params)
      std::fprintf(stderr, " %s", wat_value_type(type));
    std::fputc(')', stderr);
  }
  if (!signature.returns.empty()) {
    std::fputs(" (result", stderr);
    for (uint8_t type : signature.returns)
      std::fprintf(stderr, " %s", wat_value_type(type));
    std::fputc(')', stderr);
  }
  std::fputs("))\n", stderr);
}

bool same_signature(const LoadedWasm &left,
                    uint32_t left_index,
                    const LoadedWasm &right,
                    uint32_t right_index) {
  if (left_index >= left.signatures.size() ||
      right_index >= right.signatures.size()) {
    return false;
  }
  return left.signatures[left_index].callable &&
         right.signatures[right_index].callable &&
         left.signatures[left_index].params == right.signatures[right_index].params &&
         left.signatures[left_index].returns == right.signatures[right_index].returns;
}

bool same_callable_signature(const RawSignature &left,
                             const RawSignature &right) {
  return left.callable && right.callable && left.params == right.params &&
         left.returns == right.returns;
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
      return same_signature(provider_object, provider.SigIndex,
                            required_object, required.SigIndex);
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

const RawSignature *function_signature(
    const LoadedWasm &loaded, uint32_t function_index) {
  uint32_t imported_index = 0;
  for (const llvm::wasm::WasmImport &entry : loaded.object->imports()) {
    if (entry.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION) continue;
    if (imported_index == function_index) {
      return entry.SigIndex < loaded.signatures.size()
                 ? &loaded.signatures[entry.SigIndex]
                 : nullptr;
    }
    imported_index++;
  }
  for (const llvm::wasm::WasmFunction &function : loaded.object->functions()) {
    if (function.Index == function_index) {
      return function.SigIndex < loaded.signatures.size()
                 ? &loaded.signatures[function.SigIndex]
                 : nullptr;
    }
  }
  return nullptr;
}

bool same_export_type(const LoadedWasm &left_object,
                      const llvm::wasm::WasmExport &left,
                      const LoadedWasm &right_object,
                      const llvm::wasm::WasmExport &right) {
  if (left.Kind != right.Kind) return false;
  if (left.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION) return false;
  const RawSignature *left_signature =
      function_signature(left_object, left.Index);
  const RawSignature *right_signature =
      function_signature(right_object, right.Index);
  return left_signature != nullptr && right_signature != nullptr &&
         same_callable_signature(*left_signature, *right_signature);
}

bool provider_export_satisfies_import(
    const LoadedWasm &provider_object,
    const llvm::wasm::WasmExport &provider,
    const LoadedWasm &required_object,
    const llvm::wasm::WasmImport &required) {
  if (provider.Kind != required.Kind) return false;
  if (provider.Kind == llvm::wasm::WASM_EXTERNAL_FUNCTION) {
    const RawSignature *signature =
        function_signature(provider_object, provider.Index);
    return signature != nullptr &&
           required.SigIndex < required_object.signatures.size() &&
           same_callable_signature(
               *signature, required_object.signatures[required.SigIndex]);
  }
  // Function imports cover CPython's callable API. Data references use the
  // dynamic linker's typed GOT.mem relocations and never become browser
  // imports, so no other direct provider-import form is accepted here.
  return false;
}

bool is_mutable_i64_global(const llvm::wasm::WasmImport &entry) {
  return entry.Kind == llvm::wasm::WASM_EXTERNAL_GLOBAL &&
         entry.Global.Type == llvm::wasm::WASM_TYPE_I64 && entry.Global.Mutable;
}

bool is_loader_relocation(
    const llvm::wasm::WasmImport &entry,
    const std::map<std::string, const llvm::wasm::WasmExport *> &command_exports,
    const std::map<std::string, const llvm::wasm::WasmImport *> &allowed_imports) {
  if ((entry.Module != "GOT.func" && entry.Module != "GOT.mem") ||
      !is_mutable_i64_global(entry)) {
    return false;
  }

  const auto self = command_exports.find(entry.Field.str());
  if (self != command_exports.end()) {
    return entry.Module == "GOT.func"
               ? self->second->Kind == llvm::wasm::WASM_EXTERNAL_FUNCTION
               : self->second->Kind == llvm::wasm::WASM_EXTERNAL_GLOBAL;
  }
  if (entry.Module != "GOT.func") return false;
  const auto allowed = allowed_imports.find(interface_key("env", entry.Field));
  return allowed != allowed_imports.end() &&
         allowed->second->Kind == llvm::wasm::WASM_EXTERNAL_FUNCTION;
}

bool validate_side_module_loaded(const std::string &path,
                                 const LoadedWasm &contract,
                                 const LoadedWasm &command,
                                 bool require_command_exports,
                                 const std::vector<LoadedWasm> *providers = nullptr,
                                 bool allow_unresolved_provider = false) {
  if (!contract.signatures_parsed || !command.signatures_parsed) {
    std::fprintf(stderr,
                 "dolly-cc: unsupported callable type section in %s\n",
                 path.c_str());
    return false;
  }
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

  std::map<std::string, const llvm::wasm::WasmExport *> required_exports;
  for (const llvm::wasm::WasmExport &entry : contract.object->exports()) {
    if (!required_exports.emplace(entry.Name.str(), &entry).second) {
      std::fprintf(stderr, "dolly-cc: duplicate contract export %s\n",
                   entry.Name.str().c_str());
      return false;
    }
  }

  std::map<std::string, const llvm::wasm::WasmExport *> command_exports;
  for (const llvm::wasm::WasmExport &entry : command.object->exports()) {
    if (!command_exports.emplace(entry.Name.str(), &entry).second) {
      std::fprintf(stderr, "dolly-cc: duplicate command export %s\n",
                   entry.Name.str().c_str());
      return false;
    }
  }

  bool has_memory = false;
  bool imports_valid = true;
  for (const llvm::wasm::WasmImport &entry : command.object->imports()) {
    const std::string key = interface_key(entry.Module, entry.Field);
    if (key == interface_key("env", "memory")) has_memory = true;
    bool provider_relocation = false;
    if (providers != nullptr && is_mutable_i64_global(entry) &&
        (entry.Module == "GOT.func" || entry.Module == "GOT.mem")) {
      const uint8_t expected_kind = entry.Module == "GOT.func"
                                        ? llvm::wasm::WASM_EXTERNAL_FUNCTION
                                        : llvm::wasm::WASM_EXTERNAL_GLOBAL;
      for (const LoadedWasm &provider : *providers) {
        for (const llvm::wasm::WasmExport &candidate :
             provider.object->exports()) {
          if (candidate.Name == entry.Field && candidate.Kind == expected_kind) {
            provider_relocation = true;
            break;
          }
        }
        if (provider_relocation) break;
      }
    }
    if (is_loader_relocation(entry, command_exports, allowed_imports) ||
        provider_relocation ||
        (!require_command_exports &&
         (entry.Module == "GOT.func" || entry.Module == "GOT.mem") &&
         is_mutable_i64_global(entry))) {
      continue;
    }
    const auto allowed = allowed_imports.find(key);
    if (allowed == allowed_imports.end()) {
      bool supplied = false;
      if (entry.Module == "env" && providers != nullptr) {
        for (const LoadedWasm &provider : *providers) {
          for (const llvm::wasm::WasmExport &candidate :
               provider.object->exports()) {
            if (candidate.Name == entry.Field &&
                provider_export_satisfies_import(
                    provider, candidate, command, entry)) {
              supplied = true;
              break;
            }
          }
          if (supplied) break;
        }
      }
      if (supplied) continue;
      if (allow_unresolved_provider && entry.Module == "env") continue;
      std::fprintf(stderr, "dolly-cc: import is outside dolly-0: %s.%s\n",
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
  if (!require_command_exports) return true;
  for (const auto &[name, required] : required_exports) {
    const auto actual = command_exports.find(name);
    if (actual == command_exports.end()) {
      std::fprintf(stderr, "dolly-cc: missing required export: %s\n", name.c_str());
      return false;
    }
    if (!same_export_type(contract, *required,
                          command, *actual->second)) {
      std::fprintf(stderr, "dolly-cc: incompatible export: %s\n", name.c_str());
      return false;
    }
  }
  return true;
}

bool has_contract_stamp_loaded(const std::string &path,
                               const LoadedWasm &command);

bool load_needed_providers(const LoadedWasm &consumer,
                           const LoadedWasm &contract,
                           std::vector<LoadedWasm> &providers) {
  for (llvm::StringRef needed : consumer.object->dylinkInfo().Needed) {
    if (needed.empty() || needed.contains('/') || needed.contains("..")) {
      std::fprintf(stderr, "dolly-cc: invalid needed library name: %s\n",
                   needed.str().c_str());
      return false;
    }
    const std::string path = "/usr/lib/" + needed.str();
    LoadedWasm provider;
    if (!load_wasm(path, provider) ||
        !validate_side_module_loaded(
            path, contract, provider, false,
            providers.empty() ? nullptr : &providers, false) ||
        !has_contract_stamp_loaded(path, provider)) {
      std::fprintf(stderr, "dolly-cc: invalid needed library: %s\n",
                   path.c_str());
      return false;
    }
    providers.push_back(std::move(provider));
  }
  return true;
}

bool validate_command(const std::string &path) {
  LoadedWasm contract;
  LoadedWasm command;
  std::vector<LoadedWasm> providers;
  return load_wasm(kContractPath, contract) && load_wasm(path, command) &&
         load_needed_providers(command, contract, providers) &&
         validate_side_module_loaded(
             path, contract, command, true,
             providers.empty() ? nullptr : &providers, false);
}

bool validate_shared_object(const std::string &path) {
  LoadedWasm contract;
  LoadedWasm module;
  std::vector<LoadedWasm> providers;
  if (!load_wasm(kContractPath, contract) || !load_wasm(path, module) ||
      !load_needed_providers(module, contract, providers)) {
    return false;
  }
  return validate_side_module_loaded(
      path, contract, module, false,
      providers.empty() ? nullptr : &providers, providers.empty());
}

bool has_contract_stamp_loaded(const std::string &path,
                               const LoadedWasm &command) {
  size_t matches = 0;
  for (const llvm::object::SectionRef &section : command.object->sections()) {
    const llvm::object::WasmSection &wasm =
        command.object->getWasmSection(section);
    if (wasm.Type != llvm::wasm::WASM_SEC_CUSTOM || wasm.Name != "dolly.abi") {
      continue;
    }
    matches++;
    if (wasm.Content.size() != sizeof(DOLLY_ABI_DIGEST) ||
        std::memcmp(wasm.Content.data(), DOLLY_ABI_DIGEST,
                    sizeof(DOLLY_ABI_DIGEST)) != 0) {
      std::fprintf(stderr, "dolly-cc: %s has the wrong dolly.abi stamp\n",
                   path.c_str());
      return false;
    }
  }
  if (matches != 1) {
    std::fprintf(stderr,
                 "dolly-cc: %s must contain exactly one dolly.abi stamp\n",
                 path.c_str());
    return false;
  }
  return true;
}

bool has_contract_stamp(const std::string &path) {
  LoadedWasm command;
  return load_wasm(path, command) && has_contract_stamp_loaded(path, command);
}

bool validate_executable(const std::string &path) {
  LoadedWasm contract;
  LoadedWasm command;
  std::vector<LoadedWasm> providers;
  return load_wasm(kContractPath, contract) && load_wasm(path, command) &&
         load_needed_providers(command, contract, providers) &&
         validate_side_module_loaded(
             path, contract, command, true,
             providers.empty() ? nullptr : &providers, false) &&
         has_contract_stamp_loaded(path, command);
}

bool validate_stamped_shared_object(const std::string &path) {
  LoadedWasm contract;
  LoadedWasm module;
  std::vector<LoadedWasm> providers;
  if (!load_wasm(kContractPath, contract)) return false;
  return load_wasm(path, module) &&
         load_needed_providers(module, contract, providers) &&
         validate_side_module_loaded(
             path, contract, module, false,
             providers.empty() ? nullptr : &providers, false) &&
         has_contract_stamp_loaded(path, module);
}

bool preload_dependencies(const std::string &path) {
  LoadedWasm contract;
  LoadedWasm consumer;
  std::vector<LoadedWasm> providers;
  if (!load_wasm(kContractPath, contract) || !load_wasm(path, consumer) ||
      !load_needed_providers(consumer, contract, providers)) {
    return false;
  }
  for (llvm::StringRef needed : consumer.object->dylinkInfo().Needed) {
    char previous_directory[PATH_MAX];
    if (getcwd(previous_directory, sizeof(previous_directory)) == nullptr ||
        chdir("/usr/lib") != 0) {
      std::fprintf(stderr, "dolly: could not enter /usr/lib for dependency load\n");
      return false;
    }
    void *handle = dlopen(needed.str().c_str(), RTLD_NOW | RTLD_GLOBAL);
    const char *load_error = handle == nullptr ? dlerror() : nullptr;
    const bool restored = chdir(previous_directory) == 0;
    if (handle == nullptr || !restored) {
      std::fprintf(stderr, "dolly: could not preload %s: %s\n",
                   needed.str().c_str(),
                   load_error == nullptr ? "could not restore working directory"
                                         : load_error);
      return false;
    }
  }
  return true;
}

bool stamp_command(const std::string &output) {
  static_assert(sizeof(DOLLY_ABI_DIGEST) == 32);
  // A custom section is: id 0, payload length, name length/name, then data.
  static constexpr unsigned char prefix[] = {
      0, 42, 9, 'd', 'o', 'l', 'l', 'y', '.', 'a', 'b', 'i'};
  FILE *file = std::fopen(output.c_str(), "ab");
  if (file == nullptr) {
    std::fprintf(stderr, "dolly-cc: %s: %s\n", output.c_str(),
                 std::strerror(errno));
    return false;
  }
  bool ok = std::fwrite(prefix, 1, sizeof(prefix), file) == sizeof(prefix) &&
            std::fwrite(DOLLY_ABI_DIGEST, 1, sizeof(DOLLY_ABI_DIGEST), file) ==
                sizeof(DOLLY_ABI_DIGEST);
  if (std::fclose(file) != 0) ok = false;
  if (!ok) std::fprintf(stderr, "dolly-cc: could not stamp %s\n", output.c_str());
  return ok;
}

bool publish_file(const std::string &source, const std::string &output) {
  if (std::rename(source.c_str(), output.c_str()) == 0) return true;

  // WasmFS cannot rename across every backend boundary (notably /tmp into a
  // preloaded /usr directory). Dolly executes compiler jobs synchronously, so
  // no command can observe this bounded cross-backend publication fallback.
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

int preprocess(const DriverOptions &options, int default_language) {
  if (options.compile_only || options.inputs.size() != 1 ||
      is_object(options.inputs[0]) || is_archive(options.inputs[0]) ||
      is_linker_option(options.inputs[0])) {
    std::fputs("dolly-cc: -E requires exactly one source input\n", stderr);
    return 64;
  }
  const std::string language = inferred_language(
      options.inputs[0], default_language, options.forced_language);
  if (!run_frontend(options.inputs[0], language, options.output, options)) {
    std::fprintf(stderr, "dolly-cc: preprocessing failed: %s\n",
                 options.inputs[0].c_str());
    return 1;
  }
  return 0;
}

int compile_only(const DriverOptions &options, int default_language,
                 unsigned long long job) {
  if (options.inputs.size() != 1 || is_object(options.inputs[0]) ||
      is_archive(options.inputs[0]) || is_linker_option(options.inputs[0])) {
    std::fputs("dolly-cc: -c requires exactly one source input\n", stderr);
    return 64;
  }
  const std::string output = options.output.empty()
                                 ? object_output_for(options.inputs[0])
                                 : options.output;
  const std::string staged = temporary_path(job, 0, ".o");
  std::remove(staged.c_str());
  const std::string language = inferred_language(
      options.inputs[0], default_language, options.forced_language);
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

int compile_and_link(const DriverOptions &options, int default_language,
                     unsigned long long job) {
  if (!initialize_entry_wrapper_objects()) {
    std::fputs("dolly-cc: could not initialize command entry adapters\n", stderr);
    return 1;
  }
  const std::string output = options.output.empty() ? "a.out" : options.output;
  std::vector<std::string> temporary_objects;
  std::vector<std::string> link_inputs;
  bool needs_cxx_runtime = default_language == DOLLY_TOOLCHAIN_CXX;
  for (size_t index = 0; index < options.inputs.size(); index++) {
    const std::string &input = options.inputs[index];
    if (is_object(input) || is_archive(input) || is_linker_option(input)) {
      link_inputs.push_back(input);
      continue;
    }
    const std::string object = temporary_path(job, index, ".o");
    std::remove(object.c_str());
    const std::string language = inferred_language(
        input, default_language, options.forced_language);
    if (language == "c++") needs_cxx_runtime = true;
    if (!run_frontend(input, language, object, options)) {
      std::fprintf(stderr, "dolly-cc: compilation failed: %s\n", input.c_str());
      temporary_objects.push_back(object);
      cleanup(temporary_objects);
      return 1;
    }
    temporary_objects.push_back(object);
    link_inputs.push_back(object);
  }

  if (!options.shared_library) {
    std::string entry_symbol;
    const EntryForm entry_form = linked_entry_form(link_inputs, entry_symbol);
    if (entry_form == EntryForm::Missing) {
      std::fputs("dolly-cc: no main function found in object inputs\n", stderr);
      cleanup(temporary_objects);
      return 1;
    }
    if (entry_form == EntryForm::Unsupported) {
      std::fputs(
          "dolly-cc: main must return int and accept (), (int, char **), "
          "or (int, char **, char **)\n",
          stderr);
      cleanup(temporary_objects);
      return 1;
    }

    const std::string wrapper_object =
        temporary_path(job, options.inputs.size(), "-entry.o");
    std::remove(wrapper_object.c_str());
    if (!write_cached_entry_wrapper(
            wrapper_object, entry_form, entry_symbol)) {
      std::fputs("dolly-cc: could not create the command entry adapter\n", stderr);
      cleanup(temporary_objects);
      std::remove(wrapper_object.c_str());
      return 1;
    }
    temporary_objects.push_back(wrapper_object);
    link_inputs.push_back(wrapper_object);
  }

  if (needs_cxx_runtime) {
    // These libraries are rebuilt from the pinned Emscripten sources inside
    // Dolly. Their target patch makes the upstream main-module override points
    // strong, allowing ordinary lazy archive selection without exposing the
    // C++ implementation through the stable dolly-0 substrate.
    link_inputs.push_back("/usr/lib/libc++.a");
    link_inputs.push_back("/usr/lib/libc++abi.a");
    link_inputs.push_back("/usr/lib/libclang_rt.builtins.a");
  }

  const std::string linked =
      temporary_path(job, options.inputs.size() + 1, ".wasm");
  std::remove(linked.c_str());
  if (!link_side_module(linked, link_inputs, options.linker_options,
                        options.shared_library || options.export_dynamic,
                        needs_cxx_runtime)) {
    std::fprintf(stderr, "dolly-cc: link failed: %s\n", output.c_str());
    cleanup(temporary_objects);
    std::remove(linked.c_str());
    return 1;
  }
  cleanup(temporary_objects);
  const bool valid = options.shared_library
                         ? validate_shared_object(linked)
                         : validate_command(linked);
  const bool published = valid && stamp_command(linked) &&
                         publish_file(linked, output);
  std::remove(linked.c_str());
  return published ? 0 : 1;
}

int run_archive(int argc, char **argv, unsigned long long job) {
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
  if (operation.find('r') == std::string::npos ||
      operation.find_first_not_of("rcsD") != std::string::npos) {
    std::fprintf(stderr,
                 "%s: only deterministic archive creation with r[c][s][D] is supported\n",
                 argv[0]);
    return 64;
  }

  std::vector<llvm::NewArchiveMember> members;
  members.reserve(static_cast<size_t>(argc - 3));
  for (int index = 3; index < argc; index++) {
    llvm::Expected<llvm::NewArchiveMember> member =
        llvm::NewArchiveMember::getFile(argv[index], true);
    if (!member) {
      std::fprintf(stderr, "%s: %s: %s\n", argv[0], argv[index],
                   error_text(member.takeError()).c_str());
      return 1;
    }
    members.push_back(std::move(*member));
  }

  const std::string staged = temporary_path(job, 0, ".a");
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
  // Commands execute synchronously and remove staged outputs before return.
  // A stable name also keeps LLD tie-breakers independent of cache hits.
  constexpr unsigned long long job = 0;
  if (default_language == DOLLY_TOOLCHAIN_AR) {
    return run_archive(argc, argv, job);
  }
  DriverOptions options;
  const int parse_status = parse_driver_options(argc, argv, options,
                                                default_language);
  if (parse_status > 0) return 0;
  if (parse_status < 0) return 64;
  if (options.linker_version && options.inputs.empty() &&
      !options.compile_only && !options.preprocess_only) {
    std::puts("LLD 24.0.0 (Dolly wasm-ld)");
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
      if (!is_object(input) && !is_archive(input) && !is_linker_option(input)) {
        std::fprintf(stderr, "%s: expected an object, archive, or library input: %s\n",
                     argv[0], input.c_str());
        return 64;
      }
    }
  }

  if (options.preprocess_only) {
    return preprocess(options, default_language);
  }
  return options.compile_only
             ? compile_only(options, default_language, job)
             : compile_and_link(options,
                                default_language == DOLLY_TOOLCHAIN_LD
                                    ? DOLLY_TOOLCHAIN_C
                                    : default_language,
                                job);
}

extern "C" int dolly_toolchain_validate_executable(const char *path) {
  if (path == nullptr || path[0] == '\0') return 0;
  return validate_executable(path);
}

extern "C" int dolly_toolchain_validate_shared_library(const char *path) {
  if (path == nullptr || path[0] == '\0') return 0;
  return validate_stamped_shared_object(path);
}

extern "C" int dolly_toolchain_preload_dependencies(const char *path) {
  if (path == nullptr || path[0] == '\0') return 0;
  return preload_dependencies(path);
}

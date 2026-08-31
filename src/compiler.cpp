#include <cerrno>
#include <cstdio>
#include <cstring>
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
#include <llvm/Support/MemoryBuffer.h>
#include <llvm/Support/TargetSelect.h>
#include <llvm/Support/raw_ostream.h>

#include <dolly/toolchain.h>

#include "dolly-abi-digest.h"

LLD_HAS_DRIVER(wasm)

namespace {

constexpr const char *kContractPath = "/usr/lib/dolly/dolly-0.wasm";
unsigned long long next_job = 1;

struct DriverOptions {
  bool compile_only = false;
  bool end_options = false;
  bool edge_interrupt_safepoints = true;
  bool optimization_selected = false;
  bool standard_selected = false;
  std::string output;
  std::string forced_language;
  std::vector<std::string> frontend_options;
  std::vector<std::string> inputs;
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
    } else if (argument == "-fno-strict-aliasing") {
      // This public Clang driver spelling maps to the cc1 option below. Some
      // upstream sources use representation-compatible typed views and need
      // Clang's relaxed type-based alias analysis.
      options.frontend_options.push_back("-relaxed-aliasing");
    } else if (argument == "-g" || argument == "-pedantic" ||
               argument == "-pedantic-errors" || starts_with(argument, "-W")) {
      options.frontend_options.push_back(argument);
    } else if (argument == "-I" || argument == "-D" ||
               argument == "-U" || argument == "-include") {
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

bool compile_object(const std::string &source, const std::string &language,
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
      "-triple", "wasm64-unknown-emscripten",
      "-emit-obj",
      "-clear-ast-before-backend",
      "-disable-llvm-verifier",
      "-discard-value-names",
      "-mrelocation-model", "pic",
      "-pic-level", "2",
      "-mframe-pointer=none",
      "-ffp-contract=on",
      "-mconstructor-aliases",
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
      "-isysroot", "/",
      "-internal-isystem", "/usr/lib/clang/24/include",
      "-internal-isystem", "/usr/include/c++/v1",
      "-internal-isystem", "/usr/include/wasm64-emscripten",
      "-internal-isystem", "/usr/include",
      "-fvisibility=hidden",
      "-fgnuc-version=4.2.1",
      "-fignore-exceptions",
      "-vectorize-loops",
      "-vectorize-slp",
      "-mllvm", "-combiner-global-alias-analysis=false",
      "-mllvm", "-enable-emscripten-sjlj",
      "-mllvm", "-disable-lsr",
  };
  if (options.edge_interrupt_safepoints) {
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
  arguments.insert(arguments.end(), options.frontend_options.begin(),
                   options.frontend_options.end());
  arguments.insert(arguments.end(), {"-o", output, "-x", language, source});
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
  compiler.createVirtualFileSystem(llvm::vfs::getRealFileSystem(),
                                   diagnostic_buffer);
  compiler.createDiagnostics();
  diagnostic_buffer->FlushDiagnostics(compiler.getDiagnostics());

  return parsed && clang::ExecuteCompilerInvocation(&compiler);
}

bool link_command(const std::string &output,
                  const std::vector<std::string> &inputs) {
  std::vector<std::string> arguments = {
      "wasm-ld",
      "-o", output,
      "-Bdynamic",
      "--shared-memory",
      "--export=__wasm_call_ctors",
      "--unresolved-symbols=import-dynamic",
      "-shared",
      "--no-export-dynamic",
      "--stack-first",
      "--extra-features=extended-const",
  };
  arguments.push_back("-L/usr/lib");
  arguments.insert(arguments.end(), inputs.begin(), inputs.end());
  arguments.insert(arguments.end(), {
      "-mwasm64",
      "-mllvm", "-combiner-global-alias-analysis=false",
      "-mllvm", "-enable-emscripten-sjlj",
      "-mllvm", "-disable-lsr",
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
  const bool ok =
      std::fprintf(
          file,
          "%sextern int dolly_source_main(%s) __asm__(\"%s\");\n"
          "__attribute__((export_name(\"dolly_main\")))\n"
          "int dolly_entry(int argc, char **argv) { %s }\n",
          environment, parameters, entry_symbol.c_str(), call) >= 0 &&
      std::fclose(file) == 0;
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

const char *wat_value_type(llvm::wasm::ValType type) {
  switch (type) {
    case llvm::wasm::ValType::I32: return "i32";
    case llvm::wasm::ValType::I64: return "i64";
    case llvm::wasm::ValType::F32: return "f32";
    case llvm::wasm::ValType::F64: return "f64";
    case llvm::wasm::ValType::FUNCREF: return "funcref";
    case llvm::wasm::ValType::EXTERNREF: return "externref";
    default: return "unknown";
  }
}

void print_import_signature(const llvm::object::WasmObjectFile &object,
                            const llvm::wasm::WasmImport &entry) {
  if (entry.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION ||
      entry.SigIndex >= object.types().size()) {
    return;
  }
  const llvm::wasm::WasmSignature &signature = object.types()[entry.SigIndex];
  std::fprintf(stderr, "  (import \"%s\" \"%s\" (func",
               entry.Module.str().c_str(), entry.Field.str().c_str());
  if (!signature.Params.empty()) {
    std::fputs(" (param", stderr);
    for (llvm::wasm::ValType type : signature.Params)
      std::fprintf(stderr, " %s", wat_value_type(type));
    std::fputc(')', stderr);
  }
  if (!signature.Returns.empty()) {
    std::fputs(" (result", stderr);
    for (llvm::wasm::ValType type : signature.Returns)
      std::fprintf(stderr, " %s", wat_value_type(type));
    std::fputc(')', stderr);
  }
  std::fputs("))\n", stderr);
}

bool same_signature(const llvm::object::WasmObjectFile &left_object,
                    uint32_t left_index,
                    const llvm::object::WasmObjectFile &right_object,
                    uint32_t right_index) {
  if (left_index >= left_object.types().size() ||
      right_index >= right_object.types().size()) {
    return false;
  }
  return left_object.types()[left_index] == right_object.types()[right_index];
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
    const llvm::object::WasmObjectFile &provider_object,
    const llvm::wasm::WasmImport &provider,
    const llvm::object::WasmObjectFile &required_object,
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

const llvm::wasm::WasmSignature *function_signature(
    const llvm::object::WasmObjectFile &object, uint32_t function_index) {
  uint32_t imported_index = 0;
  for (const llvm::wasm::WasmImport &entry : object.imports()) {
    if (entry.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION) continue;
    if (imported_index == function_index) {
      return entry.SigIndex < object.types().size()
                 ? &object.types()[entry.SigIndex]
                 : nullptr;
    }
    imported_index++;
  }
  for (const llvm::wasm::WasmFunction &function : object.functions()) {
    if (function.Index == function_index) {
      return function.SigIndex < object.types().size()
                 ? &object.types()[function.SigIndex]
                 : nullptr;
    }
  }
  return nullptr;
}

bool same_export_type(const llvm::object::WasmObjectFile &left_object,
                      const llvm::wasm::WasmExport &left,
                      const llvm::object::WasmObjectFile &right_object,
                      const llvm::wasm::WasmExport &right) {
  if (left.Kind != right.Kind) return false;
  if (left.Kind != llvm::wasm::WASM_EXTERNAL_FUNCTION) return false;
  const llvm::wasm::WasmSignature *left_signature =
      function_signature(left_object, left.Index);
  const llvm::wasm::WasmSignature *right_signature =
      function_signature(right_object, right.Index);
  return left_signature != nullptr && right_signature != nullptr &&
         *left_signature == *right_signature;
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

bool validate_command_loaded(const std::string &path,
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
    if (is_loader_relocation(entry, command_exports, allowed_imports)) continue;
    const auto allowed = allowed_imports.find(key);
    if (allowed == allowed_imports.end()) {
      std::fprintf(stderr, "dolly-cc: import is outside dolly-0: %s.%s\n",
                   entry.Module.str().c_str(), entry.Field.str().c_str());
      print_import_signature(*command.object, entry);
      imports_valid = false;
      continue;
    }
    if (!provider_import_satisfies(*contract.object, *allowed->second,
                                   *command.object, entry)) {
      std::fprintf(stderr, "dolly-cc: incompatible import: %s.%s\n",
                   entry.Module.str().c_str(), entry.Field.str().c_str());
      imports_valid = false;
    }
  }
  if (!imports_valid) return false;
  if (!has_memory) {
    std::fprintf(stderr, "dolly-cc: %s does not import env.memory\n", path.c_str());
    return false;
  }
  for (const auto &[name, required] : required_exports) {
    const auto actual = command_exports.find(name);
    if (actual == command_exports.end()) {
      std::fprintf(stderr, "dolly-cc: missing required export: %s\n", name.c_str());
      return false;
    }
    if (!same_export_type(*contract.object, *required,
                          *command.object, *actual->second)) {
      std::fprintf(stderr, "dolly-cc: incompatible export: %s\n", name.c_str());
      return false;
    }
  }
  return true;
}

bool validate_command(const std::string &path) {
  LoadedWasm contract;
  LoadedWasm command;
  return load_wasm(kContractPath, contract) && load_wasm(path, command) &&
         validate_command_loaded(path, contract, command);
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
  return load_wasm(kContractPath, contract) && load_wasm(path, command) &&
         validate_command_loaded(path, contract, command) &&
         has_contract_stamp_loaded(path, command);
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
  if (!compile_object(options.inputs[0], language, staged, options)) {
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
  const std::string output = options.output.empty() ? "a.out" : options.output;
  std::vector<std::string> temporary_objects;
  std::vector<std::string> link_inputs;
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
    if (!compile_object(input, language, object, options)) {
      std::fprintf(stderr, "dolly-cc: compilation failed: %s\n", input.c_str());
      temporary_objects.push_back(object);
      cleanup(temporary_objects);
      return 1;
    }
    temporary_objects.push_back(object);
    link_inputs.push_back(object);
  }

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

  const std::string wrapper_source =
      temporary_path(job, options.inputs.size(), "-entry.c");
  const std::string wrapper_object =
      temporary_path(job, options.inputs.size(), "-entry.o");
  std::remove(wrapper_source.c_str());
  std::remove(wrapper_object.c_str());
  DriverOptions wrapper_options;
  if (!write_entry_wrapper(wrapper_source, entry_form, entry_symbol) ||
      !compile_object(wrapper_source, "c", wrapper_object, wrapper_options)) {
    std::fputs("dolly-cc: could not create the command entry adapter\n", stderr);
    cleanup(temporary_objects);
    std::remove(wrapper_source.c_str());
    std::remove(wrapper_object.c_str());
    return 1;
  }
  std::remove(wrapper_source.c_str());
  temporary_objects.push_back(wrapper_object);
  link_inputs.push_back(wrapper_object);

  const std::string linked =
      temporary_path(job, options.inputs.size() + 1, ".wasm");
  std::remove(linked.c_str());
  if (!link_command(linked, link_inputs)) {
    std::fprintf(stderr, "dolly-cc: link failed: %s\n", output.c_str());
    cleanup(temporary_objects);
    std::remove(linked.c_str());
    return 1;
  }
  cleanup(temporary_objects);
  const bool published = validate_command(linked) && stamp_command(linked) &&
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
  if (argc < 4) {
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
  const unsigned long long job = next_job++;
  if (default_language == DOLLY_TOOLCHAIN_AR) {
    return run_archive(argc, argv, job);
  }
  DriverOptions options;
  const int parse_status = parse_driver_options(argc, argv, options,
                                                default_language);
  if (parse_status > 0) return 0;
  if (parse_status < 0) return 64;
  if (options.inputs.empty()) {
    std::fprintf(stderr, "%s: no input files\n", argv[0]);
    return 64;
  }
  if (default_language == DOLLY_TOOLCHAIN_LD) {
    if (options.compile_only) {
      std::fprintf(stderr, "%s: -c is not a linker option\n", argv[0]);
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

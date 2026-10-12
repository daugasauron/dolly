#!/usr/bin/env python3
"""Prints a CMakeLists.txt for //Mojo/tools/mojo:mojo, read from Modular's BUILD.bazel files.

Usage: bazel-to-cmake.py MODULAR_ROOT > CMakeLists.txt

The CMake project takes MOJO_SOURCE (Modular's tree), MOJO_LLVM (bin, lib and
include of the LLVM, MLIR and Clang build), FMT, XXHASH and OPENTELEMETRY
(source trees) and MOJO_PORT (port/ beside this script).
"""
import glob as filesystem_glob, os, shlex, sys

ROOT = sys.argv[1]
START = "//Mojo/tools/mojo:mojo"
# The public build's values (bazel/api.bzl): no accelerator runtime, no kernel profiling.
OVERRIDE_DEFINES = {"MOJO_COMPILER_ACCELERATOR_SUPPORT": "0", "MODULAR_KGEN_PROFILING_ENABLED": "0", "MLRT_ACCELERATOR_SUPPORT": "0"}
# A select() takes its default, the release configuration, or what upstream
# gives Linux: only the suffix of a shared library is chosen by operating system.
SELECT_ORDER = ["//conditions:default", "//:modular_config_release", "@platforms//os:linux"]
# Libraries whose sources need Crashpad, OpenTelemetry's SDK with its OTLP
# exporters, or Bazel's runfiles: port/ implements their headers without them.
PORTED = {"//Support:CrashReporting": "CrashReporting.cpp", "//Support:Telemetry": "Telemetry.cpp", "//Support:BazelRunfiles": "BazelRunfiles.cpp"}
# The compiler options of dependencies outside the tree. LLVM's headers are
# MOJO_LLVM/include; OpenTelemetry's API takes the standard library's types, as
# its Bazel default does; TCMalloc's three entry points are port/tcmalloc/tcmalloc.h.
EXTERNAL = {"@fmt": ["-I${FMT}/include"], "@xxhash": ["-I${XXHASH}"],
            "@opentelemetry-cpp//api": ["-I${OPENTELEMETRY}/api/include", "-I${OPENTELEMETRY}/sdk/include",
                                        "-DOPENTELEMETRY_STL_VERSION=2020"],
            "//bazel/internal:tcmalloc_numa_aware": ["-I${MOJO_PORT}"], "//bazel/internal:tcmalloc_want_numa_aware": []}
PREAMBLE = """cmake_minimum_required(VERSION 3.20)
project(mojo C CXX)
set(CMAKE_CXX_STANDARD 20)
# What Bazel's toolchain passes that a program depends on (bazel/internal/cc-toolchain/args).
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fno-exceptions -fno-rtti -DLLVM_BUILD_STATIC")
find_package(Python3 REQUIRED COMPONENTS Interpreter)
set(S ${MOJO_SOURCE})
set(B ${CMAKE_BINARY_DIR})
# Bazel compiles from the workspace root, with generated files beside sources.
include_directories(${S} ${B} ${MOJO_LLVM}/include)
file(GLOB LLVM_ARCHIVES ${MOJO_LLVM}/lib/*.a)
add_library(third-party STATIC ${FMT}/src/format.cc ${XXHASH}/xxhash.c)
target_include_directories(third-party PRIVATE ${FMT}/include)"""

rules = {}


def select(branches):
    flat = {key: value for keys, value in branches.items() for key in (keys if isinstance(keys, tuple) else (keys,))}
    for key in SELECT_ORDER:
        if key in flat:
            return flat[key]
    return type(next(iter(flat.values())))()


def package_environment(package):
    directory = os.path.join(ROOT, package)

    def glob(include, exclude=(), **_):
        def expand(patterns):
            return {os.path.relpath(path, directory) for pattern in patterns
                    for path in filesystem_glob.glob(os.path.join(directory, pattern), recursive=True) if os.path.isfile(path)}

        def in_subpackage(path):
            parents = [path.rsplit("/", depth)[0] for depth in range(1, path.count("/") + 1)]
            return any(os.path.exists(os.path.join(directory, parent, "BUILD.bazel")) for parent in parents)
        return sorted(path for path in expand(include) - expand(exclude) if not in_subpackage(path))

    def rule(kind):
        def declare(name=None, **attributes):
            rules[f"//{package}:{name}"] = {"kind": kind, "package": package, **attributes}
        return declare

    def cc(kind):
        def declare(name=None, internal_deps=(), defines=(), local_defines=(), **attributes):
            def overridden(values):
                return [f"{value.split('=')[0]}={OVERRIDE_DEFINES.get(value.split('=')[0], value.partition('=')[2])}" for value in values]
            if name in ("Profiling", "ProfilerHostGlue"):  # bazel/api.bzl
                attributes, defines, local_defines = {"deps": ["//Support:TimeProfiler"]}, (), ()
            rule(kind)(name=name, defines=overridden(defines), local_defines=overridden(local_defines), **attributes)
        return declare

    def tablegen(name, tbl_outs=(), tblgen=None, td_file=None, deps=(), includes=(), **_):
        rule("tablegen")(name=name, tbl_outs=tbl_outs, tblgen=tblgen, td_file=td_file, deps=list(deps), includes=list(includes))

    # The three macros of bazel/internal/tablegen.bzl.
    def mlir_dialect(name, dialect, td_file, extra_tbl_outs=(), deps=()):
        base = td_file.split(".")[0]
        tablegen(name, td_file=td_file, deps=deps, includes=["include"], tblgen="@llvm-project//mlir:mlir-tblgen", tbl_outs=[
            (["-gen-op-decls"], base + ".h.inc"), (["-gen-op-defs"], base + ".cpp.inc"),
            (["-gen-typedef-decls", "-typedefs-dialect=" + dialect], base + "Types.h.inc"),
            (["-gen-typedef-defs", "-typedefs-dialect=" + dialect], base + "Types.cpp.inc"),
            (["-gen-dialect-decls", "-dialect=" + dialect], base + "Dialect.h.inc"),
            (["-gen-dialect-defs", "-dialect=" + dialect], base + "Dialect.cpp.inc"), *extra_tbl_outs])

    def modular_passes(name, td_file, output_name=None, deps=()):
        output = output_name or os.path.basename(td_file).split(".")[0]
        tablegen(name, td_file=td_file, deps=deps, includes=["include"], tblgen="@llvm-project//mlir:mlir-tblgen",
                 tbl_outs=[(["-gen-pass-decls"] + (["-name", output_name] if output_name else []), f"{os.path.dirname(td_file)}/{output}.h.inc")])

    def driver_options(name, srcs, td_file, deps=(), includes=(), opts=(), **_):
        base = td_file.split(".")[0]
        rule("td_library")(name=name + ".td_library", srcs=srcs, includes=list(includes), deps=list(deps))
        tablegen(name + ".inc_gen", td_file=td_file, includes=includes, tblgen="@llvm-project//llvm:llvm-tblgen",
                 tbl_outs=[(["-gen-opt-parser-defs", *opts], base + ".inc")])
        tablegen(name + ".help_gen", td_file=td_file, tblgen="//Support/tools/driver-tblgen",
                 tbl_outs=[(["-gen-help-text", *opts], base + "HelpText.inc"), (["-gen-help-hidden-text", *opts], base + "HelpHiddenText.inc")])
        rule("cc_library")(name=name + ".inc_files", deps=[f":{name}.inc_gen", f":{name}.help_gen", f":{name}.td_library"])

    class Environment(dict):
        # Any other rule is recorded by its name; any other constant is empty.
        def __missing__(self, key):
            class Unknown(list):
                def __call__(self, *_, **attributes):
                    if "name" in attributes:
                        rule(key)(**attributes)
                keys = values = items = lambda self: []
            return Unknown()

    return Environment(
        glob=glob, select=select, selects=type("selects", (), {"with_or": staticmethod(select)}),
        load=lambda *_, **__: None, package=lambda **_: None, package_group=lambda **_: None, exports_files=lambda *_, **__: None,
        modular_cc_library=cc("cc_library"), modular_cc_binary=cc("cc_binary"), modular_shared_library=cc("cc_library"),
        gentbl_cc_library=tablegen, gentbl_mlir_dialect=mlir_dialect, gentbl_modular_passes=modular_passes,
        driver_option_tablegen=driver_options, td_library=rule("td_library"), mlir_nanobind=lambda **_: None,
        # bazel/config.bzl
        ASYNCRT_PROFILING_LOCAL_DEFINES=["MODULAR_ASYNCRT_MAX_PROFILING_LEVEL=0000000"],
        CONFIG_SECTION_LOCAL_DEFINES=["MAX_CONFIG_SECTION=max", "MOJO_CONFIG_SECTION=mojo-max"],
        KERNEL_PROFILING_LOCAL_DEFINES=["MODULAR_ENABLE_GPU_PROFILING=0", "MODULAR_ENABLE_GPU_PROFILING_DETAILED=0"])


loaded = set()


def load_package(package):
    path = os.path.join(ROOT, package, "BUILD.bazel")
    if package not in loaded and os.path.exists(path):
        loaded.add(package)
        # Starlark's BUILD dialect is Python; unknown names resolve through the environment.
        exec(compile(open(path).read(), path, "exec"), {}, package_environment(package))


def absolute(label, package):
    if label.startswith(":"):
        return f"//{package}{label}"
    if label.startswith("//") and ":" not in label:
        return f"{label}:{label.rsplit('/', 1)[-1]}"
    return label if label.startswith(("//", "@")) else f"//{package}:{label}"


order = []


def visit(label):
    if label in order or label in EXTERNAL or not label.startswith("//"):
        return
    package = label[2:].split(":")[0]
    load_package(package)
    rule = rules[label]
    references = [*rule.get("deps", ()), *(source for source in rule.get("srcs", ()) if source.startswith((":", "//"))),
                  *filter(None, [rule.get("tblgen"), rule.get("actual")])]
    rule["references"] = [absolute(reference, package) for reference in references]
    for reference in rule["references"]:
        visit(reference)
    # Every rule below this one, dependencies first, and this one last.
    rule["closure"] = list(dict.fromkeys([*(inner for reference in rule["references"] if reference in order
                                            for inner in rules[reference]["closure"]), label]))
    order.append(label)


def target(label):
    return label[2:].replace("/", ".").replace(":", ".")


def quoted(values):
    return " ".join('"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"' for value in values)


load_package("")
visit(START)
settings = {name.split(":")[1]: rule["build_setting_default"] for name, rule in rules.items() if "build_setting_default" in rule}
print(PREAMBLE)
# //Config:GeneratedVersion (bazel/internal/modular_versioned_expand_template.bzl);
# a label, the build type and the revision are what a build may set.
for product, prefixes in (("max", ("MAX", "MODULAR")), ("mojo", ("MOJO",))):
    version = settings[f"{product}_base_version"]
    for prefix in prefixes:
        for part, value in zip(("MAJOR", "MINOR", "PATCH"), version.split(".")):
            print(f"set({prefix}_VERSION_{part} {value})")
        print(f'set({prefix}_VERSION_LABEL "{settings[f"{product}_version_label"]}" CACHE STRING "")')
        print(f'set({prefix}_VERSION_STRING "{version}${{{prefix}_VERSION_LABEL}}")')
print(f'set(MODULAR_BUILD_TYPE_LOWER "{settings["release_type"]}" CACHE STRING "")')
print(f'set(MODULAR_VERSION_REVISION "{settings["modular_version_sha"]}" CACHE STRING "")')
print("configure_file(${S}/Config/include/GeneratedVersion.h.tmpl ${B}/Config/GeneratedVersion.h @ONLY)")

td_includes = sorted({os.path.normpath(f"{rules[label]['package']}/{include}") for label in order
                      if rules[label]["kind"] in ("tablegen", "td_library") for include in rules[label].get("includes", ())})
print("set(TD_INCLUDES -I${S} -I${MOJO_LLVM}/include " + " ".join("-I${S}/" + include for include in td_includes) + ")")
for label in order:
    rule, name = rules[label], target(label)
    package = rule["package"]
    if rule["kind"] == "tablegen":
        tool = {"@llvm-project//mlir:mlir-tblgen": "${MOJO_LLVM}/bin/mlir-tblgen", "@llvm-project//llvm:llvm-tblgen": "${MOJO_LLVM}/bin/llvm-tblgen"}.get(
            rule["tblgen"]) or target(absolute(rule["tblgen"], package))
        outputs = [f"${{B}}/{package}/{output}" for _, output in rule["tbl_outs"]]
        source = f"${{S}}/{package}/{rule['td_file']}"
        for (arguments, _), output in zip(rule["tbl_outs"], outputs):
            print(f"file(MAKE_DIRECTORY {os.path.dirname(output)})")
            print(f"add_custom_command(OUTPUT {output} COMMAND {tool} {' '.join(arguments)} ${{TD_INCLUDES}} -I{os.path.dirname(source)} "
                  f"{source} -o {output} DEPENDS {tool} {source})")
        print(f"add_custom_target({name} DEPENDS {' '.join(outputs)})")
        rule["include_directories"] = [f"${{B}}/{os.path.normpath(os.path.join(package, include))}" for include in rule["includes"]]
    elif rule["kind"] == "dialect_checksum":
        td_files = sorted(f"${{S}}/{rules[source]['package']}/{file}" for source in rule["references"] for file in rules[source]["srcs"])
        output = f"${{B}}/{package}/{rule.get('out', 'GeneratedDialectChecksum.h')}"
        print(f"add_custom_command(OUTPUT {output} COMMAND ${{Python3_EXECUTABLE}} ${{S}}/bazel/internal/gen_dialect_checksum.py -o {output} "
              f"{' '.join(td_files)} DEPENDS {' '.join(td_files)})")
        print(f"add_custom_target({name} DEPENDS {output})")
    elif rule["kind"] in ("cc_library", "cc_binary"):
        below = [rules[inner] for inner in rule["closure"]]
        sources = [f"${{S}}/{package}/{source}" for source in rule.get("srcs", ()) if source.endswith((".cpp", ".cc", ".c"))]
        if label in PORTED:
            sources = ["${MOJO_PORT}/" + PORTED[label]]
        # bazel/internal/modular_cc_library.bzl: headers under include/ are included from there.
        includes = [*rule.get("includes", ()), *filter(None, [rule.get("strip_include_prefix")])]
        if not rule.get("strip_include_prefix") and not rule.get("include_prefix") and (rule.get("hdrs") or [""])[0].startswith("include/"):
            includes.append("include")
        rule["include_directories"] = [f"${{{tree}}}/{os.path.normpath(os.path.join(package, include))}" for include in includes for tree in "SB"]
        rule["options"] = [option for reference in rule["references"] for option in EXTERNAL.get(reference, ())]
        # A cc_library is an archive, whose members a link takes as needed; alwayslink takes them all.
        rule["library"] = ("OBJECT" if rule.get("alwayslink") else "STATIC") if sources and rule["kind"] == "cc_library" else None
        if rule["kind"] == "cc_binary":
            # As Bazel orders a link: a library before what it depends on. Where two define
            # a symbol the first is taken (Mojo:Compiler and Mojo:Support both do).
            libraries = [(target(inner), rules[inner].get("library")) for inner in reversed(rule["closure"])]
            objects = [f"$<TARGET_OBJECTS:{library}>" for library, kind in libraries if kind == "OBJECT"]
            print(f"add_executable({name} {' '.join(sources + objects)})")
            print(f"target_link_libraries({name} PRIVATE {' '.join(library for library, kind in libraries if kind == 'STATIC')} "
                  "third-party ${LLVM_ARCHIVES})")
        elif sources:
            print(f"add_library({name} {rule['library']} {' '.join(sources)})")
        if not sources:
            continue
        directories = [directory for inner in below for directory in inner.get("include_directories", ())]
        directories += [f"${{B}}/{option[len('-I$(GENDIR)/'):]}" for option in rule.get("copts", ()) if option.startswith("-I$(GENDIR)/")]
        if directories:
            print(f"target_include_directories({name} PRIVATE {' '.join(dict.fromkeys(directories))})")
        options = [option for inner in below for option in inner.get("options", ())]
        if options:
            print(f"target_compile_options({name} PRIVATE {' '.join(dict.fromkeys(options))})")
        definitions = [value for inner in below for value in inner.get("defines", ())] + list(rule.get("local_defines", ()))
        if definitions:
            print(f"target_compile_definitions({name} PRIVATE {quoted(shlex.split(value)[0] for value in definitions)})")
        generated = [target(inner) for inner in rule["closure"] if rules[inner]["kind"] in ("tablegen", "dialect_checksum")]
        if generated:
            print(f"add_dependencies({name} {' '.join(generated)})")
print(f"set_target_properties({target(START)} PROPERTIES OUTPUT_NAME mojo)")

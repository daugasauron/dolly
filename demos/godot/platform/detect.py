# Godot's platform for Dolly: wasm64 executables built by Dolly's cc inside Dolly.
# demos/godot/Dollyfile-godot-build places this directory as platform/dolly.
import os
from typing import TYPE_CHECKING

from platform_methods import validate_arch

if TYPE_CHECKING:
    from SCons.Script.SConscript import SConsEnvironment


def get_name():
    return "Dolly"


def can_build():
    return os.path.exists("/usr/include/dolly/process.h")


def get_tools(env: "SConsEnvironment"):
    return ["cc", "c++", "ar", "link", "textfile"]


def get_opts():
    return []


def get_doc_classes():
    return []


def get_doc_path():
    return "doc_classes"


def get_flags():
    return {
        "arch": "wasm64",
        "target": "template_release",
        # One thread: with a second, threads@0 holds the memory at its maximum.
        "threads": False,
        # godot runs the project of a directory it is given (--path), not
        # only a pack beside it.
        "disable_path_overrides": False,
        "vulkan": False,
        "opengl3": False,
        "builtin_pcre2_with_jit": False,
        "module_raycast_enabled": False,
    }


def configure(env: "SConsEnvironment"):
    validate_arch(env["arch"], get_name(), ["wasm64"])
    env["CC"] = "cc"
    env["CXX"] = "c++"
    # Dolly's ar is LLVM's, which writes the symbol index itself: no ranlib.
    env["AR"] = "ar"
    env["RANLIBCOM"] = ""
    if env["threads"]:
        env.Append(CCFLAGS=["-pthread"])
        env.Append(LINKFLAGS=["-pthread"])
    env.Prepend(CPPPATH=["#platform/dolly"])
    env.Append(CPPDEFINES=["DOLLY_ENABLED", "UNIX_ENABLED", ("_FILE_OFFSET_BITS", 64)])

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
    from SCons.Variables import BoolVariable

    return [BoolVariable("webgpu", "The Mobile and Forward+ renderers on gpu@0's WebGPU (RenderingDevice)", True)]


def get_doc_classes():
    return []


def get_doc_path():
    return "doc_classes"


def get_flags():
    return {
        "arch": "wasm64",
        "target": "template_release",
        # godot runs the project of a directory it is given (--path), not
        # only a pack beside it.
        "disable_path_overrides": False,
        "vulkan": False,
        "opengl3": True,
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
    # A window on the X server DISPLAY names (demos/x11's x11-window, over Xlib), local stream
    # sockets (sockets@0), by path: X's connection, the editor's debugger and the game it runs;
    # and the fingers on a touchscreen (touch@0).
    env.Append(LIBS=["x11-window", "X11", "xcb", "Xau", "dolly-sockets", "dolly-touch"])
    if env["webgpu"]:
        # The driver on gpu@0 and its shader container, which translates with spirv-wgsl.
        env.Append(CPPDEFINES=["RD_ENABLED", "WEBGPU_ENABLED"])
        env.Append(LIBS=["spirv-wgsl"])
    if env["opengl3"]:
        # The Compatibility renderer on Mesa's OpenGL, linked in: EGL and its
        # gallium driver, softpipe (the mesa package). GLAD takes the functions
        # from eglGetProcAddress.
        env.Prepend(CPPPATH=["#thirdparty/glad"])
        env.Append(CPPDEFINES=["GLES3_ENABLED", "GLAD_ENABLED", "GLAD_GLES2", "EGL_ENABLED", "EGL_STATIC"])
        env.Append(LIBS=["EGL", "gallium_dri", "z", "m"])

# Python

Source-built CPython with libffi, `_ctypes` and C/C++ extension builds, plus the Bonnie package installer.

## Images

- `python`: CPython, Bonnie and native-extension tools.
- `python-runtime`: CPython and its native-extension SDK.

## Sources

| Component | Outside-browser preparation | Inside-Dolly result |
| --- | --- | --- |
| CPython 3.14 | A pinned upstream tree is configured for Dolly's wasm64 target; matching frozen headers and generated build files are archived | The `cpython.dm` leaf compiles every target object and `/usr/bin/python`; entropy uses Dolly's in-Wasm source, while Python `Thread` targets execute serially and never create host or browser threads |
| Bonnie | Dolly C source is served independently | The later `bonnie.dm` leaf builds `/usr/bin/bonnie` against libcurl and the already sealed CPython layer, so installer changes do not rebuild the interpreter |

## Bonnie and compatibility

`bonnie install PACKAGE` resolves runtime and PEP 517 build requirements,
verifies downloads, builds/stages wheels and publishes the prepared transaction.
`list`, `freeze`, `show` and `check` inspect installed metadata.

CPython identifies as `sys.platform == "dolly"`, not Pyodide. Process-local
DSOs and libffi support `_ctypes` and C/C++ extensions. Socket construction
fails explicitly; an importable networking package is not proof its transport
works. Fork and actual threads are absent; the Python compatibility path runs
Thread targets serially.

Source builds of NumPy 2.5.2 and Pandas 3.0.5 have passed fresh-interpreter
array/groupby checks. This is evidence for those configurations, not arbitrary
native-wheel compatibility. Emscripten/Pyodide wheels are not interchangeable
with Dolly's process ABI.

`/etc/bonnie/build.toml`, defined by `bonnie.dm`, supplies package
PEP 517 settings. Normalized package names select tables of strings or nonempty
string arrays. NumPy uses Meson's debug/no-CPU-optimization configuration to keep
generated sources within the browser compiler's resource budget.

Other packages keep upstream defaults. Bonnie owns serial compilation,
`build-dir` and `compile-args`; package policy cannot override these.
The bundled pip frontend runs in a child Python process. Logs and scratch live
in its transaction directory and are removed after completion. Full resolver
backtracking and a frozen public wheel/SOABI policy remain open.

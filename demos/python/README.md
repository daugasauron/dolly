# Python

CPython 3.14 compiled inside Dolly with libffi, `_ctypes` and C/C++ extension
builds, plus the Bonnie package installer.

## Images

- `python`: CPython, Bonnie and native-extension tools.
- `python-runtime`: CPython and its native-extension SDK.

Open `/python/`; build with `npm run image -- python`.

## Use

- `bonnie install PACKAGE` resolves runtime and PEP 517 build requirements,
  verifies downloads, builds wheels and installs them; `list`, `freeze`, `show`
  and `check` inspect installed metadata.
- `sys.platform` is `"dolly"`. Emscripten/Pyodide wheels are not compatible.
- Per-package build settings live in `/etc/bonnie/build.toml`
  ([`bonnie.dm`](bonnie.dm)).

## Key files

- [`cpython.dm`](cpython.dm), [`cpython-dolly.patch`](cpython-dolly.patch),
  [`prepare-cpython.sh`](prepare-cpython.sh): the interpreter; preparation only
  configures the pinned tree.
- [`libffi.dm`](libffi.dm), [`libffi-dolly.c`](libffi-dolly.c): FFI over process-local calls.
- [`bonnie.c`](bonnie.c), [`bonnie.py`](bonnie.py): the installer, built after the
  interpreter so installer changes do not rebuild it.
- Tests: [`test/`](test/).

## Limits

- Sockets fail explicitly; fork is absent; `threading.Thread` targets run serially.
- NumPy 2.5.2 and Pandas 3.0.5 build from source; other native packages may not.
  NumPy uses Meson's debug, no-CPU-optimization build to fit the compiler budget.
- No full resolver backtracking.

Test: `npm run test:demos -- python` ([`test/`](test/)).

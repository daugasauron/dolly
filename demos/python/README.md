# Python

CPython 3.14 compiled inside Dolly with libffi, `_ctypes` and C/C++ extension
builds, plus stock pip over Dolly's HTTP broker.

## Images

- `python`: `python3` and `pip` (CPython), with the `cc` package pip builds native packages with.
- `libffi`: libffi with Dolly's target: calls and closures of signatures known at run time, through `dso@0`.

Install it with `INSTALL` or `amy install python`; build with
`npm run image -- python`.

## Use

- `pip install PACKAGE` installs wheels and builds sdists (PEP 517, isolated
  build environments). An sdist with C code needs the compiler, which the
  package installs. One built with Meson (NumPy, Pandas) needs Ninja too,
  which is the session's to install: `amy install python ninja`.
- `urllib.request` and `requests`, including pip's vendored copy, send
  through `env.dolly_http_dispatch` and its browser policy.
- `sys.platform` is `"dolly"`. Emscripten/Pyodide wheels are not compatible.
- Build settings for every sdist live in `/etc/pip.conf` ([`Dollyfile-python`](Dollyfile-python)).

## Key files

- [`Dollyfile-python`](Dollyfile-python), [`cpython-dolly.patch`](cpython-dolly.patch),
  [`prepare-cpython.sh`](prepare-cpython.sh): the interpreter; preparation only
  configures the pinned tree.
- [`Dollyfile-libffi`](Dollyfile-libffi), [`libffi-dolly.c`](libffi-dolly.c): FFI over process-local calls.
- [`cpython-http.c`](cpython-http.c), [`cpython-transport.py`](cpython-transport.py):
  the built-in `_dolly_http` (start, poll, cancel of
  [`http.h`](../../host/http/http.h)) and `_dolly_transport`, which `site.py`
  imports so that urllib and requests use it, in venvs too.
- [`Dollyfile-python`](Dollyfile-python): pip and its configuration, a later image step.
- Tests: [`test/`](test/).

## Limits

- Network sockets and `ssl` fail explicitly (`socket.socket()` raises
  `EAFNOSUPPORT`), so do httpx, aiohttp and other network clients. `asyncio`
  runs, and `AF_UNIX` stream sockets connect processes inside Dolly. Fork is
  absent; `threading.Thread` targets run serially.
- The browser owns TLS, redirects and content decoding: client certificates
  and custom TLS verification fail.
- NumPy 2.5.2 and Pandas 3.0.5 build from source with Meson's debug build;
  other native packages may not.

Test: `npm run test:demos -- python` ([`test/`](test/)).

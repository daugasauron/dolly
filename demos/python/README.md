# Python

CPython 3.14 compiled inside Dolly with libffi, `_ctypes` and C/C++ extension
builds, plus stock pip over Dolly's HTTP broker.

## Images

- `python`: CPython, pip and native-extension tools.
- `python-runtime`: CPython and its native-extension SDK.

Open `/python/`; build with `npm run image -- python`.

## Use

- `pip install PACKAGE` installs wheels and builds sdists (PEP 517, isolated
  build environments). `urllib.request` and `requests`, including pip's vendored
  copy, send through `env.dolly_http_dispatch` and its browser policy.
- `sys.platform` is `"dolly"`. Emscripten/Pyodide wheels are not compatible.
- Build settings for every sdist live in `/etc/pip.conf` ([`pip.dm`](pip.dm)).

## Key files

- [`cpython.dm`](cpython.dm), [`cpython-dolly.patch`](cpython-dolly.patch),
  [`prepare-cpython.sh`](prepare-cpython.sh): the interpreter; preparation only
  configures the pinned tree.
- [`libffi.dm`](libffi.dm), [`libffi-dolly.c`](libffi-dolly.c): FFI over process-local calls.
- [`cpython-http.c`](cpython-http.c): the built-in `_dolly_http` (start, poll,
  cancel of [`http.h`](../../host/http/http.h)).
- [`pip.dm`](pip.dm), [`dolly_http.py`](dolly_http.py): pip and the transports
  (installed at startup by `dolly-http.pth`), a later image step so their
  changes do not rebuild the interpreter.
- Tests: [`test/`](test/).

## Limits

- Sockets and `ssl` fail explicitly, so do httpx, aiohttp and other socket or
  asyncio clients; fork is absent; `threading.Thread` targets run serially.
- The browser owns TLS, redirects and content decoding: client certificates
  and custom TLS verification fail.
- NumPy 2.5.2 and Pandas 3.0.5 build from source with Meson's debug build;
  other native packages may not.

Test: `npm run test:demos -- python` ([`test/`](test/)).

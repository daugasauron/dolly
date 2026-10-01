# Python

CPython 3.14 compiled inside Dolly with libffi, `_ctypes` and C/C++ extension
builds, plus stock pip over Dolly's HTTP broker.

## Images

- `python`: CPython, pip and the native-extension SDK, as a package.

Install it with `INSTALL` or `amy install python`; build with
`npm run image -- python`.

## Use

- `pip install PACKAGE` installs wheels and builds sdists (PEP 517, isolated
  build environments). `urllib.request` and `requests`, including pip's vendored
  copy, send through `env.dolly_http_dispatch` and its browser policy.
- `sys.platform` is `"dolly"`. Emscripten/Pyodide wheels are not compatible.
- Build settings for every sdist live in `/etc/pip.conf` ([`Dollyfile-python`](Dollyfile-python)).

## Key files

- [`Dollyfile-python`](Dollyfile-python), [`cpython-dolly.patch`](cpython-dolly.patch),
  [`prepare-cpython.sh`](prepare-cpython.sh): the interpreter; preparation only
  configures the pinned tree.
- [`Dollyfile-python`](Dollyfile-python), [`libffi-dolly.c`](libffi-dolly.c): FFI over process-local calls.
- [`cpython-http.c`](cpython-http.c), [`cpython-transport.py`](cpython-transport.py):
  the built-in `_dolly_http` (start, poll, cancel of
  [`http.h`](../../host/http/http.h)) and `_dolly_transport`, which `site.py`
  imports so that urllib and requests use it, in venvs too.
- [`Dollyfile-python`](Dollyfile-python): pip and its configuration, a later image step.
- Tests: [`test/`](test/).

## Limits

- Sockets and `ssl` fail explicitly, so do httpx, aiohttp and other socket or
  asyncio clients; fork is absent; `threading.Thread` targets run serially.
- The browser owns TLS, redirects and content decoding: client certificates
  and custom TLS verification fail.
- NumPy 2.5.2 and Pandas 3.0.5 build from source with Meson's debug build;
  other native packages may not.

Test: `npm run test:demos -- python` ([`test/`](test/)).

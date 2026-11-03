# Python

CPython 3.14 compiled inside Dolly with libffi, `_ctypes` and C/C++ extension
builds, plus stock pip over Dolly's HTTP broker.

## Images

- `python`: `python3` and `pip` (CPython), with the `cc` package pip builds native packages with.
- `libffi`: libffi with Dolly's target: calls and closures of signatures known at run time, through `dso@0`.
- `python-data`: Python with NumPy, pandas, Matplotlib and seaborn, built once: a session imports them at once.
- `python-data-build`: A build stage: NumPy, pandas, Matplotlib and what they need, compiled in Dolly from PyPI's releases, one root per library for `COPY`.
- `openblas`: OpenBLAS's BLAS and LAPACK for wasm64, its generic C kernels and C translation of LAPACK, static, found by pkg-config as `openblas`.

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
- pip's settings live in `/etc/pip.conf` ([`Dollyfile-python`](Dollyfile-python)); sdists build
  as upstream builds its wheels.

## The data libraries

`python-data-build` compiles each native library in Dolly from its PyPI sdist,
at the settings of upstream's wheels (meson-python's `buildtype=release`), and
installs every library, native or pure Python, into a root of its own,
`/opt/python-data/NAME`, laid out as `/` is. One row takes one library into an
image, and the libraries it needs are rows of their own:

```text
FROM /vX.Y.Z/Dollyfile SHA256
INSTALL /vX.Y.Z/demos/python/Dollyfile-python SHA256
COPY /vX.Y.Z/demos/python/Dollyfile-python-data-build SHA256 /opt/python-data/numpy /
```

| Root | Version | Needs the roots |
| --- | --- | --- |
| `numpy` | 2.5.4 | |
| `pandas` | 3.0.5 | `numpy`, `python-dateutil`, `tzdata` |
| `matplotlib` | 3.10.9, with the `freetype` package's FreeType 2.14.3 and its Qhull | `numpy`, `pillow`, `kiwisolver`, `contourpy`, `cycler`, `fonttools`, `pyparsing`, `packaging`, `python-dateutil`, `tzdata` |
| `seaborn` | 0.13.2 | `pandas` and `matplotlib`, with theirs |
| `pillow` | 13.0.0, with zlib, libjpeg and the `freetype` package | |
| `contourpy` | 1.4.0 | `numpy` |
| `kiwisolver`, `cycler`, `fonttools`, `pyparsing`, `packaging`, `python-dateutil`, `tzdata` | 1.5.1, 0.12.1, 4.68.0, 3.3.3, 26.3, 4.0.0, 2026.6 | `python-dateutil` needs `tzdata` |
| `markupsafe`, `jinja2`, `et-xmlfile`, `openpyxl`, `tabulate` (pandas' HTML, Excel and Markdown) | 3.0.3, 3.1.6, 2.0.0, 3.1.5, 0.10.0 | `jinja2` needs `markupsafe`, `openpyxl` `et-xmlfile` |

Every image that takes a root needs `python` installed; pip lists and
uninstalls what the roots hold. `python-data` takes them all.

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
- [`Dollyfile-openblas`](Dollyfile-openblas), [`openblas-dolly.patch`](openblas-dolly.patch): OpenBLAS
  for a wasm that is not Emscripten, with LAPACK's subroutines returning void, as their callers
  declare them (WebAssembly traps a call of another type); the patch's head says why each change.
- [`Dollyfile-python-data-build`](Dollyfile-python-data-build): the data libraries, one root each,
  and why each build setting; [`Dollyfile-python-data`](Dollyfile-python-data): the image with
  them all.
- Tests: [`test/`](test/).

## Limits

- Network sockets and `ssl` fail explicitly (`socket.socket()` raises
  `EAFNOSUPPORT`), so do httpx, aiohttp and other network clients. `asyncio`
  runs, and `AF_UNIX` stream sockets connect processes inside Dolly. Fork is
  absent; `threading.Thread` targets run serially, and a `ThreadPoolExecutor` runs
  each item when it is submitted.
- The browser owns TLS, redirects and content decoding: client certificates
  and custom TLS verification fail.
- In a session pip builds NumPy and pandas from source as python-data-build
  does; other native packages may not build.
- python-data has no SciPy, nor scikit-learn or statsmodels, which need it:
  SciPy 1.18 builds without Fortran but needs BLAS and LAPACK, which no
  package holds yet (OpenBLAS's generic wasm build is the way). Matplotlib 3.11 bundles HarfBuzz, which takes Meson's
  threads, and Dolly has no threads in an extension module; pandas 3.1 needs
  Meson to read Clang's version from `cc --version`
  ([task](../../tasks/20261103-110906-pydata/TASK.md)).
- Matplotlib draws with Agg: `savefig` writes PNG, SVG or PDF files, and
  `show()` has no window to open.

Test: `npm run test:demos -- python` ([`test/`](test/)).

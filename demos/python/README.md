# Python

CPython 3.14 compiled inside Dolly with libffi, `_ctypes` and C/C++ extension
builds, plus stock pip over Dolly's HTTP broker.

## Images

- `python`: `python3` and `pip` (CPython), with the `cc` package pip builds native packages with.
- `libffi`: libffi with Dolly's target: calls and closures of signatures known at run time, through `dso@0`.
- `python-data`: Python with NumPy, pandas, Matplotlib and seaborn, built once: a session imports them at once.
- `numpy`: NumPy 2.5.4, the arrays and numerical routines of Python, compiled in Dolly.
- `pandas`: pandas 3.0.5 with NumPy, python-dateutil and tzdata, and Jinja, openpyxl and tabulate for its HTML, Excel and Markdown.
- `matplotlib`: Matplotlib 3.10.9, which draws with Agg into PNG, SVG and PDF files, with NumPy and Pillow.
- `seaborn`: seaborn 0.13.2, statistical plots on pandas and Matplotlib.
- `python-dateutil`: python-dateutil 4.0.0 and the IANA time zones of tzdata, for pandas and Matplotlib.
- `python-data-build`: A build stage: NumPy, pandas, Matplotlib and what they need, compiled in Dolly from PyPI's releases, one root per library for their packages' `COPY`.
- `openblas`: OpenBLAS's BLAS and LAPACK for wasm64, its SIMD128 kernels and C translation of LAPACK, static, found by pkg-config as `openblas`.

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
`/opt/python-data/NAME`, laid out as `/` is. The packages `numpy`,
`python-dateutil`, `pandas`, `matplotlib` and `seaborn` each `COPY` their roots
and `INSTALL` the packages they need, so one row takes a library into an image
with what it needs (`python` among them), and `amy install matplotlib` into a
session:

```text
INSTALL /vX.Y.Z/demos/python/Dollyfile-matplotlib SHA256
```

| Package | Its roots, at their versions | It installs |
| --- | --- | --- |
| `numpy` | `numpy` 2.5.4 | `python` |
| `python-dateutil` | `python-dateutil` 4.0.0, `tzdata` 2026.6 | `python` |
| `pandas` | `pandas` 3.0.5; for its HTML, Excel and Markdown `markupsafe` 3.0.3, `jinja2` 3.1.6, `et-xmlfile` 2.0.0, `openpyxl` 3.1.5, `tabulate` 0.10.0 | `numpy`, `python-dateutil` |
| `matplotlib` | `matplotlib` 3.10.9 (with the `freetype` package's FreeType 2.14.3 and its Qhull), `pillow` 13.0.0 (with zlib, libjpeg and FreeType), `kiwisolver` 1.5.1, `contourpy` 1.4.0, `cycler` 0.12.1, `fonttools` 4.68.0, `pyparsing` 3.3.3, `packaging` 26.3 | `numpy`, `python-dateutil` |
| `seaborn` | `seaborn` 0.13.2 | `pandas`, `matplotlib` |

pip lists and uninstalls what the packages hold. `python-data` installs them all.

Matplotlib draws with Agg: `savefig` writes PNG, SVG or PDF files, and
`plt.show()` has no window. A PNG written to the terminal as one kitty graphics
escape shows at the cursor, at its own size in the screen's pixels; `c=N` after
`f=100` scales it to N columns:

```python
import base64, matplotlib.pyplot as plt
plt.plot([1, 3, 2]); plt.savefig("/tmp/plot.png")
print(f"\033_Ga=T,f=100;{base64.b64encode(open('/tmp/plot.png', 'rb').read()).decode()}\033\\")
```

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
  with LAPACK's subroutines returning void, as their callers declare them (WebAssembly traps a call
  of another type); the patch's head says why each change.
- [`Dollyfile-python-data-build`](Dollyfile-python-data-build): the data libraries, one root each,
  and why each build setting; their packages ([`Dollyfile-numpy`](Dollyfile-numpy),
  [`Dollyfile-pandas`](Dollyfile-pandas), [`Dollyfile-matplotlib`](Dollyfile-matplotlib),
  [`Dollyfile-seaborn`](Dollyfile-seaborn), [`Dollyfile-python-dateutil`](Dollyfile-python-dateutil));
  [`Dollyfile-python-data`](Dollyfile-python-data): the image with them all.
- Tests: [`test/`](test/).

## Limits

- Network sockets and `ssl` fail explicitly (`socket.socket()` raises
  `EAFNOSUPPORT`), so do httpx, aiohttp and other network clients. `asyncio`
  runs, and `AF_UNIX` stream sockets connect processes inside Dolly. Fork is
  absent. Threads are Dolly's (`threads@0`), a Worker each, at most 32 a process; an
  extension module and a `ctypes` callback work in every thread.
- The browser owns TLS, redirects and content decoding: client certificates
  and custom TLS verification fail.
- In a session pip builds NumPy and pandas from source as python-data-build
  does; other native packages may not build.
- python-data has no SciPy yet, nor scikit-learn or statsmodels, which need it.
  SciPy 1.18 builds without Fortran on the `openblas` package, in 5 minutes in
  a session; python-data-build does not build it yet
  ([task](../../tasks/20261103-133557-scipy/TASK.md)).

Test: `npm run test:demos -- python` ([`test/`](test/)).

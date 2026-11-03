# A Python image with NumPy, Pandas, Matplotlib and the common libraries, built once, that other recipes COPY from

- STATUS: OPEN
- PRIORITY: 350
- TAGS: python,image,demo,packages

Owner (2026-11-03, high priority): "I want another demo image with a bunch of common python
libraries preinstalled (cached). pandas, numpy, matplotlib etc. Ideally, this also means this can
be used as a "build image" such that other builds can just copy the premade built packages using
Dollyfile syntax to get the specific python packages needed."

What exists (2026-11-03): CPython built in Dolly (`demos/python`); pip in a session builds NumPy
2.5.2 and Pandas 3.0.5 from their sdists with Dolly's `cc` and, for Meson projects, Ninja
(`demos/python/test/python-browser.mjs`, `DOLLY_PYTHON_PACKAGES=1` for Pandas; the recipe's
comments on flags). `COPY RECIPE SHA256 SOURCE DESTINATION` copies a retained file or tree out of
a completed image of any role (`docs/dollyfile.md`).

The shape to build:
- A build image (a toolchain's role) that compiles the libraries once, inside Dolly, from pinned
  sdists fetched by `SOURCE` (an image build reaches no index; pip installs from the staged files
  with `--no-index`), at the optimisation their upstream releases use, and keeps each library's
  installed tree so that another recipe can `COPY` exactly the ones it needs (a library and its
  dependencies, documented per library, or one directory per library).
- A demo application image FROM `python` with the set installed: a session imports them at once,
  with nothing to build or fetch. Its demo test opens it in Chromium and Firefox and runs a short
  script per library (a NumPy computation, a Pandas frame, a Matplotlib figure saved as PNG).
- The set: NumPy, Pandas (with python-dateutil, pytz/tzdata, six), Matplotlib (with Pillow,
  kiwisolver, contourpy, cycler, fonttools, pyparsing, packaging; its Agg backend, no GUI), and
  others common in data work if they build (SciPy needs Fortran: say what it would take).
- Sizes measured (each library's tree, the images' packs), build times, and what a recipe that
  `COPY`s only NumPy gets.

The owner, the same evening: "This image should also be available on npm so the python image can
be used for external systems that use npm only to run custom images locally." `scripts/package-npm.mjs`
packs images as `@daugasauron/dolly-image-NAME` (`default`, `pi-minimal`) and `dolly-build` builds a
recipe FROM an installed image package: the data image is packed so too, and a project made with npm
alone boots it and builds a recipe of its own on it (and, if the build image is packed, takes one
library from it), as `test/npm-browser.mjs` proves for `pi-minimal`. Nothing is published: the
owner publishes.

Done when: both images are in the catalog, built in a round; the demo test passes in Chromium and
Firefox; a recipe in the repository (or the test) shows `COPY` of one library from the build image
working; the image is an npm image package that an npm-only project boots and builds on, tested;
`demos/python/README.md` and the npm docs (`README.md`'s npm section, `docs/embedding.md`) say how
to use it.

## State (2026-11-04 01:20, branch `demo/pydata`)

Done but the catalog round: both images, their demo test (Chromium, Firefox, the NumPy-only
COPY), the npm package and its test (without its Pi part, see npm), the python fixes
(`6a0b03b77`, `c085280fb`), the DSO exception fix (`4e992e97a`), Pillow's FreeType
(`72a523d85`).

`demo/pydata-seed` is one commit on top: the seed fixes (`cc --version`, `patch -l -f`, the
`__small_` exports that Matplotlib's `_qhull` needs) and a demo-test step that imports every
extension module but the two Tk bindings. Built here from a fresh runtime (`system-build` to
python-data, 1911 s in a `bigbuild` slot): `core-browser.mjs` passes in Chromium and Firefox,
`cpp-browser.mjs` and `shell-browser.mjs` in Chromium, python-data's demo test in Chromium
(21.5 s) and Firefox (28.3 s) with the extensions step, and `matplotlib.tri` triangulates and
`tricontourf` draws. Not built there: the Rust, LLVM, Mojo, Pi, 0 A.D. and other chains, and
FFmpeg (whose test names `cc --version`'s line). This tree's dist holds `demo/pydata`'s
images again (rebuilt after the seed check, demo test passed); its catalog is narrowed to
python-data, default and libdolly-gpu, since the Rust chain cannot be rebuilt in a `build`
slot. Close this task when a round's python-data passes its test.

## Decisions

- Names: `python-data` (an application: what it adds to `python`, by the catalog's convention)
  and `python-data-build` (a toolchain, `family-build` as `cmake-build`, `classicube-build`).
  Both in `demos/python`, whose README, staging and test they share.
- Layout: each library is installed by pip into a root of its own, `/opt/python-data/NAME`
  (`pip install --root`, as `DESTDIR` is for Make), laid out as `/` is: `usr/lib/python3.14/
  site-packages/NAME` with its `.dist-info`, `usr/bin` for its commands. One row takes one
  library into an image, `COPY RECIPE SHA256 /opt/python-data/NAME /`: COPY merges directories,
  and the `.dist-info` records paths relative to site-packages, so pip in the image lists and
  uninstalls it. A library and its dependencies are separate roots, listed per library in
  `demos/python/README.md`; one root per library keeps each in the image once (a closure per
  root would hold NumPy in five roots). Libraries are not packages: the owner asked for a build
  image that recipes take single libraries from, and a package per library would be eighteen
  images whose rows a session never types.
- The toolchain keeps only `/opt/python-data` (FOLDER) beyond its base: the build tools
  (meson-python, Cython, pybind11, setuptools, setuptools-scm, cppy, versioneer) and the copies
  of each root into `/`, which later libraries build against (pandas needs NumPy's headers),
  are scratch, since the python package's site-packages FOLDER is not repeated.
- Build settings: upstream's release builds, meson-python's `buildtype=release` (-O3), as
  PyPI's wheels are built; `--no-build-isolation` with the tools installed once (isolation
  would build NumPy again inside each dependent's environment). The sessions' `/etc/pip.conf`
  had `setup-args=-Dbuildtype=debug` "within the compiler budget" (Bonnie's days): measured,
  NumPy 2.5.4's release build takes 141 s, as its debug build does, and its root is 21.8 MB
  against the debug build's 30.5 MB, so the setting is gone and sessions build as upstream
  does. (`pip --isolated` does not skip `/etc/pip.conf`: it ignores user configuration only.)
- Versions: each library's newest release on 2026-11-03 that builds in Dolly today: NumPy
  2.5.4, pandas 3.0.5 (3.1.0 needs Meson to see Clang's version, below), Matplotlib 3.10.9
  (3.11 needs threads in a DSO, below), Pillow 13.0.0, contourpy 1.4.0, kiwisolver 1.5.1,
  seaborn 0.13.2, and the pure-Python ones; setuptools-scm 9.2.2, which Matplotlib's `<10`
  admits.
- Sources: PyPI's sdists for the native libraries, wheels for the pure-Python ones and the
  tools, each a pin in `config/source-pins.sh`, a row of `config/upstreams.json` and a
  `SOURCE` of its own (as `demos/tools` stages Meson's wheel); the Qhull Matplotlib bundles at
  its `subprojects/qhull.wrap` pin, given to Meson as its package cache
  (`MESON_PACKAGE_CACHE_DIR`), so its wrap builds offline from it, unchanged. Packages of other
  demos: `libjpeg` (xonotic) for Pillow, `freetype` and `pkgconf` (zero-ad) for Matplotlib.

## Measurements (2026-11-03 23:12, this tree)

| Root `/opt/python-data/NAME` | Bytes | Files | Of them tests | Of them `.so` |
| --- | --- | --- | --- | --- |
| `pandas` 3.0.5 | 38.3 MB | 1523 | 13.1 MB | 16.7 MB |
| `numpy` 2.5.4 | 22.3 MB | 927 | 6.9 MB | 9.6 MB |
| `matplotlib` 3.10.9 | 22.3 MB | 600 | 2.0 MB | 5.3 MB |
| `fonttools` 4.68.0 | 4.9 MB | 368 | | |
| `pillow` 13.0.0 | 2.7 MB | 119 | | 1.5 MB |
| `kiwisolver` 1.5.1 | 1.9 MB | 12 | | 1.9 MB |
| `contourpy` 1.4.0 | 1.1 MB | 26 | | 0.9 MB |
| `seaborn` 0.13.2 | 1.0 MB | 60 | | |
| `tzdata`, `packaging`, `pyparsing`, `python-dateutil`, `cycler` | 1.9 MB | 728 | | |

- All roots: 96.4 MB. The tests are upstream's: their wheels install them (NumPy's
  `--tags=…,tests`), 22 MB of the 96.
- `python-data-build`: snapshot 315.2 MB, 9049 paths, packs 86.4 MB compressed; built in
  557 s in a `build` slot (its packages reused). `python-data`: 299.9 MB, 8528 paths, packs
  81.7 MB compressed (`default` 19.0 MB, `python` 49.7 MB, `cc` 134.4 MB, the roots), built in
  27 s from the toolchain.
- A recipe that COPYs only NumPy gets 22.3 MB in 927 files beside `default` and `python`.
- In a session (Chromium): NumPy builds in 141 s, pandas 237 s, Matplotlib 62-70 s, Pillow
  24 s; `import matplotlib.pyplot` takes 8.7 s the first time (the font cache) and 2.9 s
  after.

## npm

- `scripts/package-npm.mjs` packs `python-data` as `@daugasauron/dolly-image-python-data`
  (81.9 MB; `dolly-image-default` is 7.1 MB, `dolly-package-python` 51.1 MB), and every image
  package's README now gives the `FROM` row of a recipe built on it. `dolly-build` already
  builds a recipe `FROM` any installed image; `docs/embedding.md` says so. `init` stays Pi's.
- `test/npm-browser.mjs` gains a project made with npm alone: it installs what the package's
  README says, boots python-data (NumPy, pandas, Matplotlib), writes a recipe on the README's
  `FROM` row whose build runs Python with NumPy and pandas, builds it with `dolly-build` in the
  browser under test and boots it. Run here as an untracked copy without the Pi part (pi-minimal
  needs the Rust chain, which display.c's change already invalidates and a `build` slot cannot
  rebuild): Chromium 45.7 s, Firefox 52.9 s. The whole test is for the round.
- The build image is not packed: a recipe that COPYs from it needs its whole snapshot (315 MB,
  86 MB of packs) to take one root; an npm project builds on python-data instead.

## Findings (2026-11-03 evening, exploration session in Chromium)

Measured in a `system` + `python` + `libjpeg` session driven by
`build/pydata-evidence/explore.mjs` (commands and outputs beside it), one CPU (`os.cpu_count()`
is 1, so Ninja runs three jobs).

- CPython's `sysconfig` carried Emscripten's configure output: `CFLAGS` and `LDSHARED` held
  `-sMEMORY64=1`, `LDCXXSHARED` was `/emsdk/upstream/emscripten/emcc -shared`, `LINKFORSHARED`
  Emscripten's file systems. Dolly's `cc` refuses `-sMEMORY64=1` (status 64), so every
  setuptools extension failed: kiwisolver and Pillow, and any sdist with C code that is not a
  Meson project (NumPy and pandas use only Meson's own compiler detection). Fixed in
  `prepare-cpython.sh`: the Makefile loses Emscripten's `-s` settings and names `c++ -shared`
  and `-rdynamic`; the python recipe builds its check module from `sysconfig`'s `CC`, `CFLAGS`
  and `LDSHARED`, as setuptools does, so the build fails if they regress.
- Pillow's build hung (25 minutes in the image build, killed): Pillow sets setuptools'
  `parallel` to `os.cpu_count()`, 1 here, and setuptools then compiles its extensions in a
  `ThreadPoolExecutor`. Dolly's CPython runs a thread's target when the thread starts, so the
  pool's first worker ran the first item and then waited forever in `queue.get()` for the
  items submitted after it. Fixed in `cpython-dolly.patch`: on Dolly `submit()` runs the item
  at once in a worker context of its own (the serial equivalent of a pool), and the python
  recipe checks that three submitted items complete.
- No catch clause but `catch (...)` matched in a DSO: Matplotlib's `ft2font` failed to import
  with pybind11's "Caught an unknown exception!", and a pybind11 module whose function throws
  and catches `std::runtime_error` itself did the same. The code a catch compiles to hands the
  personality routine its exception table through libunwind's `__wasm_lpad_context`, a
  C++ `thread_local` of the process; the process exports it as its offset in the TLS block
  (0x48), the loader bound the DSO's `GOT.mem` entry to that offset, so the DSO wrote the
  table's address to address 0x48 and the personality, reading the real variable, found no
  table. Fixed in `host/dso/process.mjs` (not an image input): a `GOT.mem` entry of a process
  `thread_local` is what its Itanium ABI wrapper `_ZTW…` returns, which the process exports
  too; a process with DSOs has one thread. `test/fixtures/cpp-sdk.mjs`'s DSO host now calls
  the library's own try/catch (`cpp_sdk_check`). A C `_Thread_local` of the process has no
  wrapper and stays unresolvable by a DSO: the compiler would have to record which exports
  are TLS.
- pandas 3.1.0 asks Meson for `c_std=c17` and `cpp_std=c++20`, which Meson grants Clang from
  versions 6 and 10; Dolly's `cc --version` prints `dolly toolchain: Clang/LLD 24`, in which
  Meson finds no version ("unknown version"), so it offers C11 at most. pandas 3.0.5 asks for
  C11: it is the pin. The cause is in `src/commands/cc.c` and `cxx.c` (a seed input): `-v`
  alone already prints Clang's banner; `--version` alone should too, to stdout. Verified in a
  session with such a `cc` and `c++` built there: Meson reads `clang 24.0.0`, pandas 3.1.0
  configures with C17 and C++20 and compiles 150 of 155 steps, then stops in its bundled xsimd
  14.2.0, which declares no `xsimd::load_unaligned` for wasm64 without SIMD128. So pandas 3.1
  needs that too, and 3.0.5 stays the pin either way.
- Matplotlib 3.10.9 builds in 70 s, root 21.3 MB; Pillow 13.0.0 in 24 s with JPEG (IJG
  libjpeg 9f, the xonotic demo's package) and zlib, root 1.9 MB.
- Matplotlib 3.11 bundles HarfBuzz, libraqm and SheenBidi beside FreeType and applies diff
  files to them: Meson runs `patch -l -f -p1 -i FILE`, and Dolly's `patch` (git apply) refuses
  `-l` and `-f`. With those accepted (a shim in the session), the build reaches its link and
  stops at `dolly-cc: -pthread requires a static process`: HarfBuzz takes Meson's `threads`
  dependency, which Meson grants every POSIX system with `-pthread`, and Dolly has no threads
  in a DSO (process model, "Threads, DSOs and FFI"). Matplotlib 3.10.9, the maintained 3.10
  line, bundles only FreeType 2.6.1 and Qhull, with overlay directories and no diff files: it
  is the pin.
- Matplotlib 3.10.9's bundled FreeType 2.6.1 traps in Wasm ("function signature mismatch" in
  `af_autofitter_load_glyph` on the first text drawn): it calls the dummy writing system's
  `af_dummy_hints_apply`, which takes two parameters, through a pointer type of three; later
  FreeTypes fixed it. Matplotlib links the `freetype` package's FreeType 2.14.3 (zero-ad demo,
  with libpng and zlib) instead: `-Dsystem-freetype=true -Dprefer_static=true`, found by the
  `pkgconf` package's pkg-config, as distributions build it. Its figures then render: a 400 x
  300 PNG with the line drawn, in a session; first import 8.7 s (the font cache), then 2.9 s.
- With the seed fixes every extension module imports but Pillow's `_imagingtk`, which traps
  (a function signature mismatch: it looks up Tcl/Tk functions Dolly's python does not have),
  and Matplotlib's `_tkagg`, which raises ImportError: Dolly has no Tk.
- Every extension module's imports checked against what `/usr/bin/python` exports
  (`build/pydata-evidence/wheelhouse/dsocheck.py`): two refused. Pillow's `_imagingft` needs
  libpng (`png_create_read_struct`…): Pillow links `-lfreetype` alone and the freetype
  package's static library needs libpng and zlib, which its `freetype2.pc` requires; the build
  passes them in `LDFLAGS` (wasm-ld takes archives in any order). Matplotlib's `_qhull` needs
  `__small_sprintf`: LLVM rewrites `sprintf` calls without a floating-point conversion to it,
  and a `-rdynamic` host exports only `config/process-libc-provider.symbols`' reserved names.
  Fixed on `demo/pydata-seed` (a seed input); until a round builds it, `matplotlib.tri` fails
  to import in python-data. The owner's report met both
  ([mplreport](../20261103-141816-mplreport/TASK.md)).
- contourpy builds with `werror=true` by default, and Clang 24 reports `-Wunused-template` in
  pybind11 3.1's headers: `-Dwerror=false`, as a distribution builds it.
- Matplotlib's default `b_lto=true` asks for `-flto`, which Dolly's compiler refuses (it links
  no LTO bitcode): `-Db_lto=false`.
- NumPy 2.5.4 release build 141 s, root 21.8 MB; pandas 3.0.5 release build 237 s, root
  37.4 MB; fontTools 4.8 MB; seaborn 1.0 MB.
- SciPy 1.18.1 no longer needs Fortran: `-D_without-fortran=true` builds it without
  `scipy.odr`. It needs BLAS and LAPACK (OpenBLAS by default) and Pythran (or
  `-Duse-pythran=false`). OpenBLAS's `c_check` knows wasm (`ARCH_WASM`, its generic C
  kernels, which Pyodide builds for wasm32): what it would take is an OpenBLAS package built
  with `TARGET=GENERIC NOFORTRAN=1 C_LAPACK=1` for wasm64, found by pkg-config, then SciPy as
  pandas is built here. scikit-learn and statsmodels need SciPy: [scipy](../20261103-133557-scipy/TASK.md).

## Lessons

- Four Dolly bugs stood behind "pip builds NumPy and pandas": CPython's sysconfig still held
  Emscripten's flags, a thread pool deadlocked under serial threads, a DSO's catch clauses
  never matched, and a `-rdynamic` host did not export what LLVM's code calls. Each check
  passed because it did not take the path real software takes: the extension check module
  was built by a literal `cc` line instead of sysconfig's, and the DSO C++ test threw in the
  library and caught in the host, never inside the library. Build a check the way its real
  consumer builds it; one script that compares every extension's imports with the host's
  exports found the last two refusals at once.
- A long-lived session driven by numbered command files (the output posted back over the
  broker, `build/pydata-evidence/explore.mjs`) turned each experiment into seconds to minutes;
  an image build reruns every earlier step, hides pip's output behind its spinner, and
  waited up to an hour for a slot tonight. Explore in a session, then write the recipe once,
  and build several images in one command so one slot wait serves them.
- A comment's reason is a measurement waiting to be repeated: "Meson's debug build keeps NumPy
  within the compiler budget" dated from Bonnie; NumPy's release build now takes as long and
  makes a smaller tree. `pip --isolated` does not skip `/etc/pip.conf` either: read the
  command a tool actually runs (here the `meson setup` line) before trusting a flag.
- Version choice is where Dolly's gaps surface: the newest pandas and Matplotlib needed what
  Dolly reports wrongly or lacks (Clang's version, threads in a DSO, xsimd without SIMD128),
  and the older Matplotlib's FreeType had a function-pointer bug Wasm traps on. Pin the
  release line that builds and write the gap down with its cause.
- The owner's report and this task met the same four bugs independently, hours apart: a
  session with stock tools finds what a recipe author would hit, and it is cheap to run one.

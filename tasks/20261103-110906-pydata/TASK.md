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

## State (2026-11-03 22:20, branch `demo/pydata`)

Ready to merge: `6a0b03b77` (python's sysconfig and pip.conf) and `c085280fb` (thread pools).
In progress: the DSO loader's thread_local fix (verified in a session, test written), the two
images, their demo test and the npm package.

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
  `SOURCE` of its own (as `demos/tools` stages Meson's wheel); Matplotlib's bundled FreeType,
  HarfBuzz, libraqm, SheenBidi and Qhull at its `subprojects/*.wrap` pins, given to Meson as its
  package cache (`MESON_PACKAGE_CACHE_DIR`), so its wraps build offline from them, unchanged.

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
- contourpy builds with `werror=true` by default, and Clang 24 reports `-Wunused-template` in
  pybind11 3.1's headers: `-Dwerror=false`, as a distribution builds it.
- Matplotlib's default `b_lto=true` asks for `-flto`, which Dolly's compiler refuses (it links
  no LTO bitcode): `-Db_lto=false`.
- NumPy 2.5.4 release build 141 s, root 21.8 MB; pandas 3.0.5 release build 237 s, root
  37.4 MB; fontTools 4.8 MB; seaborn 1.0 MB.
- SciPy 1.18.1 no longer needs Fortran: `-D_without-fortran=true` builds it without
  `scipy.odr`. It needs BLAS and LAPACK (OpenBLAS by default): OpenBLAS has no wasm64 kernels
  (its generic C ones and `C_LAPACK=1`, `NOFORTRAN=1` would be the port), and its Pythran
  modules (or `-Duse-pythran=false`). scikit-learn and statsmodels need SciPy.

## Lessons

- Four Dolly bugs stood behind "pip builds NumPy and pandas": CPython's sysconfig still held
  Emscripten's flags, a thread pool deadlocked under serial threads, a DSO's catch clauses
  never matched, and patch lacked Meson's options. Each had a check that passed because it did
  not take the path real software takes: the extension check module was built by a literal
  `cc` line instead of sysconfig's, the DSO C++ test threw from the library and caught in the
  host, never inside the library. Build a check the way its real consumer builds it.
- A long-lived session driven by numbered command files (the output posted back over the
  broker, `build/pydata-evidence/explore.mjs`) turned each experiment into seconds to minutes;
  an image build reruns every earlier step and hides pip's output behind its spinner. Explore
  in a session, then write the recipe once.
- A comment's reason is a measurement waiting to be repeated: "Meson's debug build keeps NumPy
  within the compiler budget" dated from Bonnie; NumPy's release build now takes as long and
  makes a smaller tree. `pip --isolated` does not skip `/etc/pip.conf` either: read the
  command a tool actually runs (here the `meson setup` line) before trusting a flag.
- Version choice is where Dolly's gaps surface: the newest pandas and Matplotlib needed
  capabilities Dolly reports wrongly or lacks (Clang's version, threads in a DSO). Pinning the
  previous release line is fine when the gap is written down with its cause.

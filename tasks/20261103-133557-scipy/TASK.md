# SciPy in python-data: an OpenBLAS package for wasm64, then SciPy without Fortran

- STATUS: OPEN
- PRIORITY: 200
- TAGS: python,packages


## State (2026-11-03)

Open, not started. Found while building python-data
([pydata](../20261103-110906-pydata/TASK.md)).

SciPy 1.18.1 no longer needs Fortran: `-D_without-fortran=true` builds it without the
deprecated `scipy.odr` (its only Fortran sources). It needs BLAS and LAPACK, OpenBLAS by
default, and Pythran for some modules (or `-Duse-pythran=false`). OpenBLAS 0.3.34 (read
2026-11-04) knows wasm only under `__EMSCRIPTEN__` (`ctest.c` prints `ARCH_WASM` and, oddly,
`OS_WINDOWS` there), which Dolly's compiler does not define, and its wasm kernels
(`kernel/wasm`, `WASM128_GENERIC`) are SIMD128, which Dolly's target features do not enable;
`C_LAPACK=1` builds its LAPACK from the C translation, so no Fortran there.

What it would take: an OpenBLAS package (`NOFORTRAN=1 C_LAPACK=1 USE_THREAD=0`, static, PIC,
with an `openblas.pc`) for wasm64: either OpenBLAS's detection of a wasm that is not
Emscripten with its generic C kernels (`TARGET=GENERIC`), configured or proposed upstream, or
SIMD128 in Dolly's compiler for its wasm kernels; built and tested; SciPy's sdist in
python-data-build after NumPy, found through pkg-config (the `pkgconf` package is there
already), at its release settings; its root in python-data. scikit-learn and statsmodels
follow SciPy (scikit-learn also needs joblib, threadpoolctl and narwhals, pure Python).

Done when: python-data imports `scipy.linalg`, `scipy.optimize` and `scipy.stats` and its demo
test runs one computation of each in Chromium and Firefox.

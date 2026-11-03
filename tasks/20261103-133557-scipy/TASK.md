# SciPy in python-data: an OpenBLAS package for wasm64, then SciPy without Fortran

- STATUS: OPEN
- PRIORITY: 200
- TAGS: python,packages


## State (2026-11-03)

Open, not started. Found while building python-data
([pydata](../20261103-110906-pydata/TASK.md)).

SciPy 1.18.1 no longer needs Fortran: `-D_without-fortran=true` builds it without the
deprecated `scipy.odr` (its only Fortran sources). It needs BLAS and LAPACK, OpenBLAS by
default, and Pythran for some modules (or `-Duse-pythran=false`). OpenBLAS's `c_check` knows
wasm (`ARCH_WASM`) and has generic C kernels, which Pyodide builds for wasm32; `C_LAPACK=1`
builds its LAPACK from the C translation, so no Fortran there either.

What it would take: an OpenBLAS package (`TARGET=GENERIC NOFORTRAN=1 C_LAPACK=1 USE_THREAD=0`,
static, PIC, with an `openblas.pc`) built for wasm64 and tested; SciPy's sdist in
python-data-build after NumPy, found through pkg-config (the `pkgconf` package is there
already), at its release settings; its root in python-data. scikit-learn and statsmodels
follow SciPy (scikit-learn also needs joblib, threadpoolctl and narwhals, pure Python).

Done when: python-data imports `scipy.linalg`, `scipy.optimize` and `scipy.stats` and its demo
test runs one computation of each in Chromium and Firefox.

# Sourced by scripts/prepare-image-sources.sh.
if has_image libffi; then
  libffi_dir="$(demos/python/prepare-libffi.sh)"
  copy_static demos/python/libffi-dolly.c python/runtimes/libffi-dolly.c
  node scripts/build-source-tar.mjs "${static_dir}/python/libffi.tar" \
    "${libffi_dir}" /usr/src/libffi \
    "${libffi_dir}/include/ffi.h" /usr/include/ffi.h \
    "${libffi_dir}/include/ffitarget.h" /usr/include/ffitarget.h \
    "${libffi_dir}/LICENSE" /usr/share/licenses/libffi/LICENSE
fi
if has_image python; then
  cpython_dir="$(demos/python/prepare-cpython.sh)"
  for source in \
    cpython-platform.c cpython-extension-check.c \
    cpython-socket-stubs.c \
    cpython-process.c cpython-http.c cpython-subprocess.py \
    cpython-transport.py; do
    copy_static "demos/python/${source}" "python/runtimes/${source}"
  done
  node scripts/build-source-tar.mjs "${static_dir}/python/cpython.tar.gz" \
    "${cpython_dir}/Include" /usr/src/python/Include \
    "${cpython_dir}/Parser" /usr/src/python/Parser \
    "${cpython_dir}/Objects" /usr/src/python/Objects \
    "${cpython_dir}/Python" /usr/src/python/Python \
    "${cpython_dir}/Modules" /usr/src/python/Modules \
    "${cpython_dir}/Programs" /usr/src/python/Programs \
    "${cpython_dir}/Tools/freeze" /usr/src/python/Tools/freeze \
    "${cpython_dir}/Lib" /usr/src/python/Lib \
    "${cpython_dir}/Makefile" /usr/src/python/Makefile \
    "${cpython_dir}/Makefile.pre" /usr/src/python/Makefile.pre \
    "${cpython_dir}/Makefile.pre.in" /usr/src/python/Makefile.pre.in \
    "${cpython_dir}/pyconfig.h" /usr/src/python/pyconfig.h \
    "${cpython_dir}/config.status" /usr/src/python/config.status \
    "${cpython_dir}/configure" /usr/src/python/configure \
    "${cpython_dir}/LICENSE" /usr/share/licenses/cpython/LICENSE
fi
# The openblas package's: upstream's release archive and the two lines its
# build needs.
if has_image openblas; then
  copy_static "$(bash scripts/fetch-pinned-archive.sh openblas)" openblas/OpenBLAS-0.3.34.tar.gz
  copy_static demos/python/openblas-dolly.patch openblas/openblas-dolly.patch
fi
# python-data-build's inputs as PyPI and Qhull publish them (source pin, file
# name).
if has_image python-data-build; then
  while read -r python_data_pin python_data_file; do
    copy_static "$(bash scripts/fetch-pinned-archive.sh "${python_data_pin}")" "python-data/${python_data_file}"
  done <<'FILES'
numpy numpy-2.5.4.tar.gz
pandas pandas-3.0.5.tar.gz
matplotlib matplotlib-3.10.9.tar.gz
pillow pillow-13.0.0.tar.gz
kiwisolver kiwisolver-1.5.1.tar.gz
contourpy contourpy-1.4.0.tar.gz
cycler cycler-0.12.1-py3-none-any.whl
fonttools fonttools-4.68.0-py3-none-any.whl
pyparsing pyparsing-3.3.3-py3-none-any.whl
packaging packaging-26.3-py3-none-any.whl
dateutil python_dateutil-4.0.0-py3-none-any.whl
tzdata tzdata-2026.6-py2.py3-none-any.whl
seaborn seaborn-0.13.2-py3-none-any.whl
markupsafe markupsafe-3.0.3.tar.gz
jinja2 jinja2-3.1.6-py3-none-any.whl
et_xmlfile et_xmlfile-2.0.0-py3-none-any.whl
openpyxl openpyxl-3.1.5-py2.py3-none-any.whl
tabulate tabulate-0.10.0-py3-none-any.whl
meson_python meson_python-0.22.1-py3-none-any.whl
cython cython-3.3.1-py3-none-any.whl
pyproject_metadata pyproject_metadata-0.12.1-py3-none-any.whl
pybind11 pybind11-3.1.0-py3-none-any.whl
setuptools setuptools-84.2.1-py3-none-any.whl
setuptools_scm setuptools_scm-9.2.2-py3-none-any.whl
cppy cppy-1.3.1-py3-none-any.whl
versioneer versioneer-0.29-py3-none-any.whl
mpl_qhull qhull-8.0.2.tar.gz
FILES
fi

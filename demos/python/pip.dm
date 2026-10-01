DOLLY 5
MODULE pip

REQUIRES TOOL python

# urllib.request and requests (also pip's vendored copy) send through CPython's
# built-in _dolly_http client; dolly-http.pth installs the transports at startup.
SOURCE https://daugasauron.com/static/python/runtimes/dolly_http.py f07a8aedf34a620d34e8dbb640bb240245415632599d123bf4d98885c9a2b754 /usr/lib/python3.14/dolly_http.py
FILE /usr/lib/python3.14/dolly_http.py
FILE /usr/lib/python3.14/site-packages/dolly-http.pth
    import dolly_http

# CPython's bundled pip, installed offline without build-time bytecode.
SLOP python \
  /usr/lib/python3.14/ensurepip/_bundled/pip-26.2.1-py3-none-any.whl/pip \
  install \
  --no-compile \
  --no-index \
  --disable-pip-version-check \
  --root-user-action=ignore \
  /usr/lib/python3.14/ensurepip/_bundled/pip-26.2.1-py3-none-any.whl
FOLDER /usr/lib/python3.14/site-packages
EXPORTS TOOL pip
EXPORTS TOOL pip3

# The browser policy decides which indexes are reachable; skip pip's own
# PyPI version check. Dolly has one user, uid 0. Progress bars refresh from a
# thread, which would never yield under Dolly's serial threading. Meson's debug
# build keeps sdists such as NumPy (which adds -O3 otherwise) and Pandas within
# the compiler budget; pip reads one config setting from this file.
FILE /etc/pip.conf
    [global]
    disable-pip-version-check = true
    root-user-action = ignore
    progress-bar = off
    config-settings = setup-args=-Dbuildtype=debug

SLOP python \
  -c 'import _dolly_http, urllib.request, dolly_http; assert urllib.request.HTTPHandler.__module__ == "dolly_http"'
SLOP pip \
  --version

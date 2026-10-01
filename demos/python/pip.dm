DOLLY 6
MODULE pip

REQUIRES TOOL python

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
  -c 'import urllib.request; assert urllib.request.HTTPHandler.__module__ == "_dolly_transport"'
SLOP pip \
  --version

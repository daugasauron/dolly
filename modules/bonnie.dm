DOLLY 3
MODULE bonnie

REQUIRES HEADER curl
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES LIB    curl
REQUIRES TOOL   cc
REQUIRES TOOL   python
REQUIRES TOOL   rm

# Bonnie changes much faster than CPython. Keeping its source and result in a
# separate leaf lets module-prefix caching reuse the complete interpreter SDK.
SOURCE HOST /static/python/commands/bonnie.c  /tmp/bonnie/bonnie.c      a30a9a65692065136dacb87d59c970908d9d91cd2cfc108273ea0c8217db3b42
SOURCE HOST /static/python/runtimes/bonnie.py /usr/lib/bonnie/bonnie.py 40e8cb73a263843146b927c03ce3b56bd21302559783ab9bee073eeb8ddfbec1

# Upstream PEP 517 config-settings, selected by normalized package name.
# NumPy otherwise appends -O3 after CFLAGS on its generated ufunc sources.
# These supported Meson options keep cold browser builds bounded.
FILE /etc/bonnie/build.toml
    [numpy]
    setup-args = ["-Dbuildtype=debug", "-Ddisable-optimization=true"]

SLOP cc \
  -O0 \
  -std=c17 \
  /tmp/bonnie/bonnie.c \
  -o /usr/bin/bonnie \
  -lcurl

EXPORTS TOOL bonnie

SLOP bonnie \
  --version
SLOP bonnie \
  list
SLOP bonnie \
  freeze
SLOP bonnie \
  check

# The launcher and its implementation are one command. This private retained
# file is not a dependency name for downstream modules.
FILE /usr/lib/bonnie/bonnie.py

SLOP rm \
  -rf \
  /tmp/bonnie

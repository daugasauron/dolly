DOLLY 5
MODULE bonnie

REQUIRES HEADER curl
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES LIB    curl
REQUIRES TOOL   cc
REQUIRES TOOL   python
REQUIRES TOOL   rm

# Its callers reuse the completed Python runtime image before building Bonnie.
SOURCE https://daugasauron.com/static/python/commands/bonnie.c  a6d4c8f06f4b9de7a5d322b895e7c35e2a74180143aa7cb59d57470584b82f6c /tmp/bonnie/bonnie.c
SOURCE https://daugasauron.com/static/python/runtimes/bonnie.py a61601ebf9e4c349076b42eb169930462d9b53538ebcc8414c0bdecb4fb0e632 /usr/lib/bonnie/bonnie.py

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

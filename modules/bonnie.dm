DOLLY 2
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
SOURCE HOST /static/python/commands/bonnie.c  /tmp/bonnie/bonnie.c      ecd7d389c6dd7f2b37797d0d4c8e70bae4710ea84a65216b7c5fba68c6c91181
SOURCE HOST /static/python/runtimes/bonnie.py /usr/lib/bonnie/bonnie.py 079de79f90ec6c594726923ea19aeb6b394594ac8e7aef81e861dd1632b9137d

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

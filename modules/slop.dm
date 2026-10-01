DOLLY 5
MODULE slop

# Slop runs every SLOP step, so it is built before any shell exists: COMPILEC
# runs the seed compiler alone.
REQUIRES HEADER libc
REQUIRES HEADER runtime

SOURCE https://daugasauron.com/static/default/slop.c 00f5f3e1a9225454b112ed634158b4206357463cbecac704d836ecaacc13fa4a /tmp/slop/slop.c
COMPILEC /tmp/slop/slop.c /bin/slop

EXPORTS TOOL slop
EXPORTS ENV SHELL /bin/slop

DOLLY 5
MODULE slop

# Slop runs every SLOP step, so it is built before any shell exists: COMPILEC
# runs the seed compiler alone.
REQUIRES HEADER libc
REQUIRES HEADER runtime

SOURCE https://daugasauron.com/dist/static/default/slop.c bc83d460600e80590a007932a2cdebc6d6f561679cae0e3f6c51229a59b9e249 /tmp/slop/slop.c
COMPILEC /tmp/slop/slop.c /bin/slop

EXPORTS TOOL slop
EXPORTS ENV SHELL /bin/slop

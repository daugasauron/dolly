DOLLY 5
MODULE slop

# Slop runs every SLOP step, so it is built before any shell exists: COMPILEC
# runs the seed compiler alone.
REQUIRES HEADER libc
REQUIRES HEADER runtime

SOURCE https://daugasauron.com/dist/static/default/slop.c 8e35c95fb3e09bc7e7d882bb6f774c70275b9c2608f23b24365065fa2835a932 /tmp/slop/slop.c
COMPILEC /tmp/slop/slop.c /bin/slop

EXPORTS TOOL slop
EXPORTS ENV SHELL /bin/slop

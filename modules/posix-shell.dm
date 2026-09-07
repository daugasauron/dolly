DOLLY 3
MODULE posix-shell

# Conventional pathname for upstream scripts; the implementation is Slop.
REQUIRES TOOL slop
REQUIRES TOOL ln
SLOP ln -s slop /bin/sh
EXPORTS TOOL sh

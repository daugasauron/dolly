DOLLY 4
MODULE zig2-host-c

# Measurement shortcut, not a bootstrap path: zig2.c and compiler_rt.c emitted
# on the host by the same zig1 seed and config (host-zig2-c.sh), so the rest of
# the chain can be measured while zig1 cannot run in a browser Worker.
SOURCE HOST /static/zig-self-host/zig2.c        /tmp/zig/zig2.c        15c2044b13418cd56f2e484ed75f55994521ac3f8992e5435e65f3a8f88d35da
SOURCE HOST /static/zig-self-host/compiler_rt.c /tmp/zig/compiler_rt.c 4477d4a0cde8d6ede6c117d7de9016e06b7a042ebf4c20c298f5083c8f1e260c

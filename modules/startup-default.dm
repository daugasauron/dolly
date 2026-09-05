DOLLY 2
MODULE startup-default

# The runtime executes this ordinary Slop script before the image ENTRY.
FILE /home/dolly/.dollyrc
    printf '\033[33mDOLLY / DEFAULT\033[0m\n'
    printf 'Browser-contained wasm64 userspace; files and processes stay inside Dolly.\n'
    printf 'Try: help | ls /bin | git --version | zig version\n\n'

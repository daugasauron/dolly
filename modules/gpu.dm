DOLLY 3
MODULE gpu

REQUIRES HEADER libc
REQUIRES HEADER process
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL rm

SOURCE HOST /include/dolly/gpu.h /usr/include/dolly/gpu.h 04805a81cd69ba0605053cfe62bfd59f099820c1ffa46223ebb02cd9d5478e65
SOURCE HOST /include/dolly/gpu-abi.h /usr/include/dolly/gpu-abi.h c93ca57b395fe7811bf4e03cb11a1d1a769b0fefd010f672df14d0bbf7cff629
SOURCE HOST /static/gpu/client.c /usr/src/dolly/gpu/client.c 2db6506bcb0d0ba65a2c441a7d9fea9796ad01d8c999056df80a11c09cac9630

SLOP cc -std=c17 -O2 -c /usr/src/dolly/gpu/client.c -o /tmp/dolly-gpu.o
SLOP ar rcs /usr/lib/libdolly-gpu.a /tmp/dolly-gpu.o
SLOP rm /tmp/dolly-gpu.o

EXPORTS HEADER gpu /usr/include/dolly/gpu.h
EXPORTS HEADER gpu-abi /usr/include/dolly/gpu-abi.h
EXPORTS LIB dolly-gpu /usr/lib/libdolly-gpu.a
EXPORTS FOLDER gpu-source /usr/src/dolly/gpu

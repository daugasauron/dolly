DOLLY 4
MODULE gpu

REQUIRES HEADER libc
REQUIRES HEADER process
REQUIRES HEADER host
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL rm

SOURCE HOST /include/dolly/gpu.h /usr/include/dolly/gpu.h 4c77c750144fb65eba1de4694ae3b78522a2162810fd83f72dda1592f1578000
SOURCE HOST /include/dolly/gpu-abi.h /usr/include/dolly/gpu-abi.h 8457fa2772a8b59df57638c53396c90085d64ffe99e3032ea157ac3a04e8dc5f
SOURCE HOST /static/gpu/client.c /usr/src/dolly/gpu/client.c 75d4a827852bde7e441e75cd6aaf06f3bfe4da9ce41a36071cdfd4053f577cfb

SLOP cc -std=c17 -O2 -c /usr/src/dolly/gpu/client.c -o /tmp/dolly-gpu.o
SLOP ar rcs /usr/lib/libdolly-gpu.a /tmp/dolly-gpu.o
SLOP rm /tmp/dolly-gpu.o

EXPORTS HEADER gpu /usr/include/dolly/gpu.h
EXPORTS HEADER gpu-abi /usr/include/dolly/gpu-abi.h
EXPORTS LIB dolly-gpu /usr/lib/libdolly-gpu.a
EXPORTS FOLDER gpu-source /usr/src/dolly/gpu

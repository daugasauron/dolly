DOLLY 3
MODULE gpu

REQUIRES HEADER libc
REQUIRES HEADER process
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL rm

SOURCE HOST /include/dolly/gpu.h /usr/include/dolly/gpu.h 4c77c750144fb65eba1de4694ae3b78522a2162810fd83f72dda1592f1578000
SOURCE HOST /include/dolly/gpu-abi.h /usr/include/dolly/gpu-abi.h 532088cd4997f8e52a3ede8d9925956b701b3f142e2c76e8827f32f39e71c24e
SOURCE HOST /static/gpu/client.c /usr/src/dolly/gpu/client.c c79c86701a2cc627278cc353012b207ac3f7b50d319de50fc8bf9293e98a3d18

SLOP cc -std=c17 -O2 -c /usr/src/dolly/gpu/client.c -o /tmp/dolly-gpu.o
SLOP ar rcs /usr/lib/libdolly-gpu.a /tmp/dolly-gpu.o
SLOP rm /tmp/dolly-gpu.o

EXPORTS HEADER gpu /usr/include/dolly/gpu.h
EXPORTS HEADER gpu-abi /usr/include/dolly/gpu-abi.h
EXPORTS LIB dolly-gpu /usr/lib/libdolly-gpu.a
EXPORTS FOLDER gpu-source /usr/src/dolly/gpu

DOLLY 4
MODULE audio

REQUIRES HOST audio@0
REQUIRES HEADER libc
REQUIRES HEADER process
REQUIRES HEADER host
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL rm

SOURCE HOST /include/dolly/audio.h /usr/include/dolly/audio.h 9d291eeb25345a75bb21dbd4c422beb15f30700a5f96d5f665ca52a5d8948b65
SOURCE HOST /include/dolly/audio-abi.h /usr/include/dolly/audio-abi.h 24e538fa126aabe1a854125cb3aa732d6fbd30da55d5b4649596e9fd94a9cb65
SOURCE HOST /static/audio/client.c /usr/src/dolly/audio/client.c 1465c9d7d83a0f93a45bf641c7a29216a2b2c7aa31a5e5a9f7145c090387f8e5

SLOP cc -std=c17 -O2 -c /usr/src/dolly/audio/client.c -o /tmp/dolly-audio.o
SLOP ar rcs /usr/lib/libdolly-audio.a /tmp/dolly-audio.o
SLOP rm /tmp/dolly-audio.o

EXPORTS HEADER audio /usr/include/dolly/audio.h
EXPORTS HEADER audio-abi /usr/include/dolly/audio-abi.h
EXPORTS LIB dolly-audio /usr/lib/libdolly-audio.a
EXPORTS FOLDER audio-source /usr/src/dolly/audio

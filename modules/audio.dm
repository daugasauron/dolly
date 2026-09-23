DOLLY 3
MODULE audio

REQUIRES HEADER libc
REQUIRES HEADER process
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL rm

SOURCE HOST /include/dolly/audio.h /usr/include/dolly/audio.h 9d291eeb25345a75bb21dbd4c422beb15f30700a5f96d5f665ca52a5d8948b65
SOURCE HOST /include/dolly/audio-abi.h /usr/include/dolly/audio-abi.h b70df3f87184121e056c2473a32653970ad716c7add5bfab865e118267027e18
SOURCE HOST /static/audio/client.c /usr/src/dolly/audio/client.c 04b650aaa8ad99548961e36938a8966dd8e2752888fecba5e62c18c4a57d3cef

SLOP cc -std=c17 -O2 -c /usr/src/dolly/audio/client.c -o /tmp/dolly-audio.o
SLOP ar rcs /usr/lib/libdolly-audio.a /tmp/dolly-audio.o
SLOP rm /tmp/dolly-audio.o

EXPORTS HEADER audio /usr/include/dolly/audio.h
EXPORTS HEADER audio-abi /usr/include/dolly/audio-abi.h
EXPORTS LIB dolly-audio /usr/lib/libdolly-audio.a
EXPORTS FOLDER audio-source /usr/src/dolly/audio

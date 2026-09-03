DOLLY 2
MODULE bootstrap

# This is the first step. It has no requirements: its exact compiler commands
# and C headers are the externally supplied bootstrap seed. How those headers
# eventually map to the lower-level machine contract is deliberately open.
SOURCE HOST /include/dolly/toolchain.h /usr/include/dolly/toolchain.h e2391161d5f9385b3ba740ed10e4a1279260d5c70ecf2dc3db6e57eefaf5e218
SOURCE HOST /include/dolly/runtime.h   /usr/include/dolly/runtime.h   8060ea7c8ef27b687b815f020ffa115293d1264b7ca774e45f368ece75508150
SOURCE HOST /include/dolly/http.h      /usr/include/dolly/http.h      612a98dcb2369ebea525a29da0f2b63eee7af5601fd595508edaeabeffaf4745
SOURCE HOST /include/dolly/display.h   /usr/include/dolly/display.h   b47317d717b1e75e5b328fc4a61ad1c98e4f0d99ee6766f402fca2ac825e26bd
SOURCE HOST /include/dolly/download.h  /usr/include/dolly/download.h  8924a3e4c82183c2840f9734dcca8a2427b085c5e004d32c90496f926246cc89

EXPORTS HEADER libc      /usr/include
EXPORTS HEADER toolchain /usr/include/dolly/toolchain.h
EXPORTS HEADER runtime   /usr/include/dolly/runtime.h
EXPORTS HEADER http      /usr/include/dolly/http.h
EXPORTS HEADER display   /usr/include/dolly/display.h
EXPORTS HEADER download  /usr/include/dolly/download.h

EXPORTS LIB compiler-rt /usr/lib/libclang_rt.builtins.a

EXPORTS ENV CC    cc
EXPORTS ENV AR    ar
EXPORTS ENV SHELL /bin/slop
EXPORTS ENV PATH  /bin:/usr/bin

EXPORTS TOOL cc    14256062ee8a06c6f295971aa9397b24f946dbf7010e6398cc29b90432903909
EXPORTS TOOL c++   7967c381a9667a445f8a5f09c0ba6217dea183e4cb8819e0fb2b06d1e3e37196
EXPORTS TOOL ld    5157c842f75ddeb5f2379e8d6a4e4fd94b28293efe4f965c980485d2f493fc9a
EXPORTS TOOL ar    8554252d62a47c001a57f42b25dd68046429197d1f566c7dde3971d1c9f2ee40
EXPORTS TOOL slop  88080ed7a6bc4e14306fa26d21e34714a111f6090cf6d071b55bec57696f7ea6
EXPORTS TOOL mkdir a0fcab9250637b2f09373b7c92311bf02828bf3eb5fbb1741e3557e1d6312bbc
EXPORTS TOOL rm    303ae87d363a21459ad7764a3f7d8003fcddb6823b10acc0c5a43f1b16e81a84

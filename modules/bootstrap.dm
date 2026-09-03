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

EXPORTS TOOL cc    0e59b66b49793ad018e0c5df9c63faab970313a5a3a5218cd2b063420f2afd75
EXPORTS TOOL c++   3cae6c39d1887d08a6380a8008ae0e8b609854654912ec04a98f0ff8d1bfad5d
EXPORTS TOOL ld    fa3ef5d06ff231705f20bd6d8faee49b4102d9c24dcae90b7f04c13fc73bc841
EXPORTS TOOL ar    8422aa215869b9e2220b7cfca7067265a165516311c28caba1d6509ff77bcdb1
EXPORTS TOOL slop  88080ed7a6bc4e14306fa26d21e34714a111f6090cf6d071b55bec57696f7ea6
EXPORTS TOOL mkdir a0fcab9250637b2f09373b7c92311bf02828bf3eb5fbb1741e3557e1d6312bbc
EXPORTS TOOL rm    4e6703b148c6ab5be569df3348184b72af8097c22de1279df2ec28fb306b89d3

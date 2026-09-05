DOLLY 2
MODULE bootstrap

# This is the first step. It has no requirements: its exact compiler commands
# and C headers are the externally supplied bootstrap seed. How those headers
# eventually map to the lower-level machine contract is deliberately open.
SOURCE HOST /include/dolly/toolchain.h /usr/include/dolly/toolchain.h 9e72211e0380b9d900848741c0c1197b370cf93b2de64a8f4d199ea5aab6c9bb
SOURCE HOST /include/dolly/runtime.h   /usr/include/dolly/runtime.h   7487e47d1aebdec8dd6c2feac0c53985537851cb7d084aa25357cc818bdf5998
SOURCE HOST /include/dolly/process.h   /usr/include/dolly/process.h   4b2c27efe4fc57a2aca66f1e52287a6dc963f0582ca66ea3a0a28fe679735418
SOURCE HOST /include/dolly/http.h      /usr/include/dolly/http.h      e1a9ade8e99415d2d0e3af944013c526100451fe155478fb4a52fa04a7806cd7
SOURCE HOST /include/dolly/display.h   /usr/include/dolly/display.h   b47317d717b1e75e5b328fc4a61ad1c98e4f0d99ee6766f402fca2ac825e26bd
SOURCE HOST /include/dolly/download.h  /usr/include/dolly/download.h  8924a3e4c82183c2840f9734dcca8a2427b085c5e004d32c90496f926246cc89

EXPORTS HEADER libc      /usr/include
EXPORTS HEADER toolchain /usr/include/dolly/toolchain.h
EXPORTS HEADER runtime   /usr/include/dolly/runtime.h
EXPORTS HEADER process   /usr/include/dolly/process.h
EXPORTS HEADER http      /usr/include/dolly/http.h
EXPORTS HEADER display   /usr/include/dolly/display.h
EXPORTS HEADER download  /usr/include/dolly/download.h

EXPORTS LIB compiler-rt /usr/lib/libclang_rt.builtins.a

EXPORTS ENV CC    cc
EXPORTS ENV AR    ar
EXPORTS ENV SHELL /bin/slop
EXPORTS ENV PATH  /bin:/usr/bin

# These programs are linked against the seeded process adapter, so their
# complete input identity is the runtime build ID rather than this recipe
# alone. They are still validated as dolly-process-0 executables when loaded.
EXPORTS TOOL cc
EXPORTS TOOL c++
EXPORTS TOOL ld
EXPORTS TOOL ar
EXPORTS TOOL slop
EXPORTS TOOL mkdir
EXPORTS TOOL rm

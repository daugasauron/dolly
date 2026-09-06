DOLLY 3
MODULE bootstrap

# This is the first step. It has no requirements: its exact compiler commands
# and C headers are the externally supplied bootstrap seed. How those headers
# eventually map to the lower-level machine contract is deliberately open.
SOURCE HOST /include/dolly/toolchain.h /usr/include/dolly/toolchain.h 9e72211e0380b9d900848741c0c1197b370cf93b2de64a8f4d199ea5aab6c9bb
SOURCE HOST /include/dolly/runtime.h   /usr/include/dolly/runtime.h   cf6bacbfa773ae253d3abc5b7f3e006e4b017aaefab4d0ea412476f9d6d5b2a9
SOURCE HOST /include/dolly/process.h   /usr/include/dolly/process.h   e68eb32d2bf5c2182ff9bc5ef29db9b8581b6fb2841518abc2a52573602e5977
SOURCE HOST /include/dolly/http.h      /usr/include/dolly/http.h      7e003122545cd86a44daef371ed15ea9f323dc277e1a9ce9fa4dcd74fc0c6d64
SOURCE HOST /include/dolly/display.h   /usr/include/dolly/display.h   f6cb60e0b7d53286cb4af0b728bf2f460a2993a0f8c5f72c9d7a97386cd1cf48
SOURCE HOST /include/dolly/download.h  /usr/include/dolly/download.h  8924a3e4c82183c2840f9734dcca8a2427b085c5e004d32c90496f926246cc89

EXPORTS HEADER libc      /usr/include
EXPORTS HEADER toolchain /usr/include/dolly/toolchain.h
EXPORTS HEADER runtime   /usr/include/dolly/runtime.h
EXPORTS HEADER process   /usr/include/dolly/process.h
EXPORTS HEADER http      /usr/include/dolly/http.h
EXPORTS HEADER display   /usr/include/dolly/display.h
EXPORTS HEADER download  /usr/include/dolly/download.h

EXPORTS LIB compiler-rt /usr/lib/libclang_rt.builtins.a

# These are the complete externally seeded compiler dependencies, not ambient
# additions to every boot. Images retain them by re-exporting these objects.
EXPORTS FOLDER process-sdk       /usr/lib/dolly/process
EXPORTS FOLDER clang-headers     /usr/lib/clang/24/include
EXPORTS FILE   compiler          /usr/libexec/dolly/process-bin/compiler
EXPORTS FILE   kernel-plugin-abi /usr/lib/dolly/dolly-kernel-plugin-0.wasm

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
EXPORTS TOOL dollyfile
EXPORTS TOOL mkdir
EXPORTS TOOL rm

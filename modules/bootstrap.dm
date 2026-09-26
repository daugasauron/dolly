DOLLY 4
MODULE bootstrap

# This is the first step. It has no requirements: its exact compiler commands
# and C headers are the externally supplied bootstrap seed. How those headers
# eventually map to the lower-level machine contract is deliberately open.
SOURCE HOST /include/dolly/toolchain.h /usr/include/dolly/toolchain.h 6f9da3258e970e356c31034e1f109a04ac8bd5ab57dc82c19aebf293289fb415
SOURCE HOST /include/dolly/runtime.h   /usr/include/dolly/runtime.h   060f61049f36cec927ca4560a53f870c0af08052d5e7506981f5e61657873b71
SOURCE HOST /include/dolly/process.h   /usr/include/dolly/process.h   904cefd9556bdeacd8db75588d7cefc4506b50300545a107f5a84e07091d0732
SOURCE HOST /include/dolly/http.h      /usr/include/dolly/http.h      836dacaa6965e33be30d1ef38fe0d828c3889e8a44c752659a5747ebfe4637cf
SOURCE HOST /include/dolly/display.h   /usr/include/dolly/display.h   f6cb60e0b7d53286cb4af0b728bf2f460a2993a0f8c5f72c9d7a97386cd1cf48
SOURCE HOST /include/dolly/download.h  /usr/include/dolly/download.h  8924a3e4c82183c2840f9734dcca8a2427b085c5e004d32c90496f926246cc89

SOURCE HOST /include/dolly/host.h /usr/include/dolly/host.h 0b579ac94098b2997772f2ff2cfa3aafd8dd2812bb5ef6f658e341e33b10aa28
SOURCE HOST /include/dolly/host-abi.h /usr/include/dolly/host-abi.h 544f73c7e5249c1a27f6ea968ee8cffa81b113addaf4d428fa1ca268c382c108
SOURCE HOST /include/dolly/gpu.h /usr/include/dolly/gpu.h 4cadb0e39b3fd77d137353baf150bd68af08461fb33456eace4342d8e5d4dcf4
SOURCE HOST /include/dolly/gpu-abi.h /usr/include/dolly/gpu-abi.h 9f807cee8eeb31c8c3b5ea4fc278db9f97765a3e43b62b87f2083b55b64572e2
SOURCE HOST /include/dolly/upload.h /usr/include/dolly/upload.h 606a8b7813716940e5e287b2881230334d875db4c328c8b1677471d6f5cb5a42
SOURCE HOST /include/dolly/snapshot.h /usr/include/dolly/snapshot.h a8e74773a232b79b3655ecc6c744b3debd9db2eafc5757c088646fce650ba953

SOURCE HOST /include/dolly/threads.h /usr/include/dolly/threads.h d53ba27f4e9b371c3de9482dcc6b11cf86b4563f367ea776889642aa0e52632a
SOURCE HOST /include/dolly/threads-abi.h /usr/include/dolly/threads-abi.h e1d0ef0bcce01b335190016f009146136be9faad9ac59aca631bff35ed1b38e4

EXPORTS HEADER libc      /usr/include
EXPORTS HEADER toolchain /usr/include/dolly/toolchain.h
EXPORTS HEADER runtime   /usr/include/dolly/runtime.h
EXPORTS HEADER process   /usr/include/dolly/process.h
EXPORTS HEADER http      /usr/include/dolly/http.h
EXPORTS HEADER display   /usr/include/dolly/display.h
EXPORTS HEADER download  /usr/include/dolly/download.h

EXPORTS HEADER host /usr/include/dolly/host.h
EXPORTS HEADER host-abi /usr/include/dolly/host-abi.h
EXPORTS HEADER gpu /usr/include/dolly/gpu.h
EXPORTS HEADER gpu-abi /usr/include/dolly/gpu-abi.h
EXPORTS HEADER upload /usr/include/dolly/upload.h
EXPORTS HEADER snapshot /usr/include/dolly/snapshot.h
EXPORTS HEADER threads /usr/include/dolly/threads.h
EXPORTS HEADER threads-abi /usr/include/dolly/threads-abi.h

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
# complete input identity is the image build ID rather than this recipe
# alone. They are still validated as dolly-process-0 executables when loaded.
EXPORTS TOOL cc
EXPORTS TOOL c++
EXPORTS TOOL ld
EXPORTS TOOL ar
EXPORTS TOOL slop
EXPORTS TOOL dollyfile
EXPORTS TOOL mkdir
EXPORTS TOOL rm

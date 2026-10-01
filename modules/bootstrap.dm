DOLLY 5
MODULE bootstrap

# This is the first step. It has no requirements: its exact compiler commands
# and C headers are the externally supplied bootstrap seed. How those headers
# eventually map to the lower-level machine contract is deliberately open.
SOURCE https://daugasauron.com/include/dolly/toolchain.h 6f9da3258e970e356c31034e1f109a04ac8bd5ab57dc82c19aebf293289fb415 /usr/include/dolly/toolchain.h
SOURCE https://daugasauron.com/include/dolly/runtime.h   d89e494ac6096063e6f2852112b107e1f8c104a96c45286146584cab9bcab971 /usr/include/dolly/runtime.h
SOURCE https://daugasauron.com/include/dolly/process.h   ec6c6fb502b5aa018b963e0112686400b97cb18c4dd873fbcb6aed0b7e12e4ec /usr/include/dolly/process.h
SOURCE https://daugasauron.com/host/http/http.h      9788f40609302200f05b08538c65e940c2e3fb62cc7efe17329eaac1b5eba824 /usr/include/dolly/http.h
SOURCE https://daugasauron.com/host/http/http-abi.h 4fd5bce3b48734ace1c451a2f7eda7382ea96ffbe0713db085cd69b8b601ce83 /usr/include/dolly/http-abi.h
SOURCE https://daugasauron.com/host/display/display.h   e7906832c8b80672882692eaf3ec303c7b2159b6b60161e7e5f8fea0841b9af6 /usr/include/dolly/display.h
SOURCE https://daugasauron.com/host/display/display-abi.h b60bdff2f8c28bf1163d0b975318c34defa6638996e0604383e634fe5db7b97b /usr/include/dolly/display-abi.h
SOURCE https://daugasauron.com/host/download/download.h  666bca4fba5da7bf1e998c6486f56dce24cdbc82f1126f9be59067eb03b03bfa /usr/include/dolly/download.h
SOURCE https://daugasauron.com/host/download/download-abi.h 45cfbbc85fd2ea3846db581cc3129ef1ae1304a3f9ede06d5dae3b544bd6c0e0 /usr/include/dolly/download-abi.h

SOURCE https://daugasauron.com/include/dolly/host.h 9737f9b15bd65f5732e16bd942fe593132c7c886c3076dfda89a529a23fee08a /usr/include/dolly/host.h
SOURCE https://daugasauron.com/include/dolly/host-abi.h 3f2d26426bb088d61a0cc18b6c464697e98c83d8d34ffaf1d063768e619eb766 /usr/include/dolly/host-abi.h
SOURCE https://daugasauron.com/host/gpu/gpu.h 4c77c750144fb65eba1de4694ae3b78522a2162810fd83f72dda1592f1578000 /usr/include/dolly/gpu.h
SOURCE https://daugasauron.com/host/gpu/gpu-abi.h 01e97fc225cda01fb5e295819ceb230252d45fb211b64262d5a2c63e9e065be2 /usr/include/dolly/gpu-abi.h
SOURCE https://daugasauron.com/host/audio/audio.h 9d291eeb25345a75bb21dbd4c422beb15f30700a5f96d5f665ca52a5d8948b65 /usr/include/dolly/audio.h
SOURCE https://daugasauron.com/host/audio/audio-abi.h 4eb1f6e8f948ec1371fd5bb0bf4e904c438504e0cbccc4380cca9c98280eea30 /usr/include/dolly/audio-abi.h
SOURCE https://daugasauron.com/host/upload/upload.h 8d5b888175631a2f6dba010942f73e53c8514559de13ea336af804aa75f15eff /usr/include/dolly/upload.h
SOURCE https://daugasauron.com/host/upload/upload-abi.h 314558510cb81fd81f64a2a0dac7936fbcbb1aeecf4b99763f63bd9114ea982f /usr/include/dolly/upload-abi.h
SOURCE https://daugasauron.com/host/snapshot/snapshot.h a8e74773a232b79b3655ecc6c744b3debd9db2eafc5757c088646fce650ba953 /usr/include/dolly/snapshot.h

SOURCE https://daugasauron.com/host/threads/threads.h d53ba27f4e9b371c3de9482dcc6b11cf86b4563f367ea776889642aa0e52632a /usr/include/dolly/threads.h
SOURCE https://daugasauron.com/host/threads/threads-abi.h f65d87f501aa77cf5f371d8398681728226ad7357488eff53fc560180bf5c62b /usr/include/dolly/threads-abi.h

EXPORTS HEADER libc      /usr/include
EXPORTS HEADER toolchain /usr/include/dolly/toolchain.h
EXPORTS HEADER runtime   /usr/include/dolly/runtime.h
EXPORTS HEADER process   /usr/include/dolly/process.h
EXPORTS HEADER http      /usr/include/dolly/http.h
EXPORTS HEADER http-abi /usr/include/dolly/http-abi.h
EXPORTS HEADER display   /usr/include/dolly/display.h
EXPORTS HEADER display-abi /usr/include/dolly/display-abi.h
EXPORTS HEADER download  /usr/include/dolly/download.h
EXPORTS HEADER download-abi /usr/include/dolly/download-abi.h

EXPORTS HEADER host /usr/include/dolly/host.h
EXPORTS HEADER host-abi /usr/include/dolly/host-abi.h
EXPORTS HEADER gpu /usr/include/dolly/gpu.h
EXPORTS HEADER gpu-abi /usr/include/dolly/gpu-abi.h
EXPORTS HEADER audio /usr/include/dolly/audio.h
EXPORTS HEADER audio-abi /usr/include/dolly/audio-abi.h
EXPORTS HEADER upload /usr/include/dolly/upload.h
EXPORTS HEADER upload-abi /usr/include/dolly/upload-abi.h
EXPORTS HEADER snapshot /usr/include/dolly/snapshot.h
EXPORTS HEADER threads /usr/include/dolly/threads.h
EXPORTS HEADER threads-abi /usr/include/dolly/threads-abi.h

EXPORTS LIB compiler-rt /usr/lib/libclang_rt.builtins.a
EXPORTS LIB dolly-gpu /usr/lib/dolly/process/libdolly-gpu.a
EXPORTS LIB dolly-audio /usr/lib/dolly/process/libdolly-audio.a

# These are the complete externally seeded compiler dependencies, not ambient
# additions to every boot. Images retain them by re-exporting these objects.
EXPORTS FOLDER process-sdk       /usr/lib/dolly/process
EXPORTS FOLDER clang-headers     /usr/lib/clang/24/include
EXPORTS FILE   compiler          /usr/libexec/dolly/process-bin/compiler
EXPORTS FILE   kernel-plugin-abi /usr/lib/dolly/dolly-kernel-plugin-0.wasm

# cc, c++, ld and ar forward to the seed compiler. Only that compiler exists at
# this point, so COMPILEC builds them; every later recipe step uses SLOP.
FILE /tmp/process-tools/cc.c
    #include <dolly/toolchain.h>
    int main(int argc, char **argv) { return dolly_toolchain_proxy(argc, argv, DOLLY_TOOLCHAIN_C); }
FILE /tmp/process-tools/cxx.c
    #include <dolly/toolchain.h>
    int main(int argc, char **argv) { return dolly_toolchain_proxy(argc, argv, DOLLY_TOOLCHAIN_CXX); }
FILE /tmp/process-tools/ld.c
    #include <dolly/toolchain.h>
    int main(int argc, char **argv) { return dolly_toolchain_proxy(argc, argv, DOLLY_TOOLCHAIN_LD); }
FILE /tmp/process-tools/ar.c
    #include <dolly/toolchain.h>
    int main(int argc, char **argv) { return dolly_toolchain_proxy(argc, argv, DOLLY_TOOLCHAIN_AR); }
COMPILEC /tmp/process-tools/cc.c  /bin/cc
COMPILEC /tmp/process-tools/cxx.c /bin/c++
COMPILEC /tmp/process-tools/ld.c  /bin/ld
COMPILEC /tmp/process-tools/ar.c  /bin/ar

EXPORTS ENV CC    cc
EXPORTS ENV AR    ar
EXPORTS ENV PATH  /bin:/usr/bin

# These programs are linked against the seeded process adapter, so their
# complete input identity is the image build ID rather than this recipe
# alone. They are still validated as dolly-process-0 executables when loaded.
# /bin/dollyfile is the engine running this recipe; the bootstrap compiles it.
EXPORTS TOOL cc
EXPORTS TOOL c++
EXPORTS TOOL ld
EXPORTS TOOL ar
EXPORTS TOOL dollyfile

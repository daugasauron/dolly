DOLLY 3
MODULE default

# Execute these recipes in order; re-export the useful runtime and SDK below.
USE HOST /modules/bootstrap.dm      aee346d9fdc9ddfdffdcf74d0a58647f5b49110e8dc808b0907004b144bb5dd8
USE HOST /modules/core-tools.dm     42bc8954f5f995a05262752bac670967c3a5a13edcecca7e325dc814d28506b2
USE HOST /modules/download.dm       74b6c1c6a911150a593758806ee5939f52f42cdb93632f68406adcecb0ca03bf
USE HOST /modules/upload.dm         71da809b012f0228082a39240075387b23a44d8ba24a3a641b0f85a899606ea0
USE HOST /modules/tar.dm            cc9e50ec101244cbf57f926b82d537da9efe0d18d483a8b3f38dfde350960101
USE HOST /modules/make.dm           f97fe7ed3f4729a2196f860a317bb5081ba6ad2115b9fd0225dd8f05ea0e02a1
USE HOST /modules/cpp.dm            a7ede03621f9a6de44d4c2c9dbe64dce96c87b286aab6216a3390c64eb3eed52
USE HOST /modules/ninja.dm          84b060b2ab700c37083cd698a619630d1f25663156320a0acae3fe07053777f7
USE HOST /modules/zlib.dm           0d4994c6687385e288747ef53e621707c064cf8666239f7f6210480c72c57b35
USE HOST /modules/curl.dm           f92d767aa1a4be186afdace77df9d7bdb846f8a96267c8062bc21617eff9c919
USE HOST /modules/git.dm            70c6691e9f126fa1c9168bc5c44568063de4163a96b6dd5d9c51a90724a8e6fa
USE HOST /modules/awk.dm            b9ff535f661dd7e24b0136e3067d08b5880c16fae6abce38bd1677428ac72a65
USE HOST /modules/sbase.dm          1c803f9d9d210c7d1fc6b1b56b6efc4e3e4c2976bbeed07f0699ecbe8724099f
USE HOST /modules/sbase-tools-1.dm  d02a8f66c3c7f0b96ad161ac4cba46aa022ff2f52c7979891d074aa7889f8329
USE HOST /modules/sbase-tools-2.dm  f484a24bd78808fee3c0c88cce66a24bf31134cf022149cdebd0c83b89218c2f
USE HOST /modules/sbase-tools-3.dm  6a2bfd5547a3931fd1c0af510f6844a9088a361709fbd874ac9ac7011f32769a
USE HOST /modules/sbase-tools-4.dm  ec9a92a547ff20e1ac919fc5c1534bae4eb90374fd9ba45708fa38aa62207f4a
USE HOST /modules/sbase-tools-5.dm  91304d7f7074949b49700d622745315f49c9b31ed95aaf2625bf758f4f1370b9
USE HOST /modules/sbase-tools-6.dm  9ac0983ae4628041abdf24d510de4b8a84b3588e34df7615d22b47f31313e5e5
USE HOST /modules/sbase-tools-7.dm  e4b3c1010b9cfdbb21deb1f28429aab6a02f69483b182e73f7f88d9360568992
USE HOST /modules/sbase-tools-8.dm  c216ed15fb014a9d387152a1dfae39b33792b907daeab964a70a3c9839e1c29f
USE HOST /modules/sbase-tools-9.dm  eff5de6801c4d483b2853fa027f07beaed666239517255b3a9ed8d5dd4d249c8
USE HOST /modules/sbase-tools-10.dm 5eb35e784f68afbf40e5509a047a386f689d90d69dd3dccaf535f39b4d18c999
USE HOST /modules/sbase-tools-11.dm e8121cc66576e4641cb99bbfb5fe60c07749b725a0c3a7a3c6e6e677a42ccd9f
USE HOST /modules/sbase-tools-12.dm 6f1a4fc873a037e749f9456711be8d1424decb454f4379e954239a6134847266
USE HOST /modules/agent-tools.dm    c431eced287781cca823f7ac28a13f8eb81f59ae6a818339818847b7bd593bed

# Retain the runtime and SDK at these paths when the module finishes.
EXPORTS HEADER libc       /usr/include
EXPORTS HEADER toolchain  /usr/include/dolly/toolchain.h
EXPORTS HEADER runtime    /usr/include/dolly/runtime.h
EXPORTS HEADER process    /usr/include/dolly/process.h
EXPORTS HEADER http       /usr/include/dolly/http.h
EXPORTS HEADER display    /usr/include/dolly/display.h
EXPORTS HEADER download   /usr/include/dolly/download.h
EXPORTS HEADER cpp        /usr/include/c++/v1
EXPORTS HEADER zlib       /usr/include/zlib.h
EXPORTS HEADER zconf      /usr/include/zconf.h
EXPORTS HEADER curl       /usr/include/curl

EXPORTS LIB compiler-rt /usr/lib/libclang_rt.builtins.a
EXPORTS LIB c++         /usr/lib/dolly/process/libc++-ww-wasmexcept.a
EXPORTS LIB c++abi      /usr/lib/dolly/process/libc++abi-ww-wasmexcept.a
EXPORTS LIB z           /usr/lib/libz.a
EXPORTS LIB curl        /usr/lib/libcurl.a

EXPORTS ENV CC
EXPORTS ENV CXX
EXPORTS ENV AR
EXPORTS ENV SHELL
EXPORTS ENV PATH

EXPORTS TOOL slop
EXPORTS TOOL dollyfile
EXPORTS TOOL foreground
EXPORTS TOOL help
EXPORTS TOOL pwd
EXPORTS TOOL cd
EXPORTS TOOL cat
EXPORTS TOOL echo
EXPORTS TOOL mkdir
EXPORTS TOOL touch
EXPORTS TOOL rm
EXPORTS TOOL clear
EXPORTS TOOL ls
EXPORTS TOOL stat
EXPORTS TOOL file
EXPORTS TOOL test
EXPORTS TOOL [
EXPORTS TOOL mv
EXPORTS TOOL cp
EXPORTS TOOL download
EXPORTS TOOL upload
EXPORTS TOOL tar
EXPORTS TOOL make
EXPORTS TOOL ninja
EXPORTS TOOL curl
EXPORTS TOOL git
EXPORTS TOOL awk
EXPORTS TOOL printf
EXPORTS TOOL grep
EXPORTS TOOL sed
EXPORTS TOOL head
EXPORTS TOOL wc
EXPORTS TOOL cut
EXPORTS TOOL od
EXPORTS TOOL true
EXPORTS TOOL false
EXPORTS TOOL sort
EXPORTS TOOL uniq
EXPORTS TOOL basename
EXPORTS TOOL dirname
EXPORTS TOOL tr
EXPORTS TOOL cmp
EXPORTS TOOL date
EXPORTS TOOL mktemp
EXPORTS TOOL sha256sum
EXPORTS TOOL md5sum
EXPORTS TOOL sleep
EXPORTS TOOL ln
EXPORTS TOOL readlink
EXPORTS TOOL rmdir
EXPORTS TOOL seq
EXPORTS TOOL paste
EXPORTS TOOL comm
EXPORTS TOOL expr
EXPORTS TOOL nl
EXPORTS TOOL join
EXPORTS TOOL split
EXPORTS TOOL strings
EXPORTS TOOL cksum
EXPORTS TOOL fold
EXPORTS TOOL expand
EXPORTS TOOL unexpand
EXPORTS TOOL tsort
EXPORTS TOOL pathchk
EXPORTS TOOL cc
EXPORTS TOOL c++
EXPORTS TOOL ld
EXPORTS TOOL ar
EXPORTS TOOL install
EXPORTS TOOL which
EXPORTS TOOL command
EXPORTS TOOL xargs
EXPORTS TOOL find
EXPORTS TOOL tail
EXPORTS TOOL tee
EXPORTS TOOL env
EXPORTS TOOL printenv
EXPORTS TOOL rev
EXPORTS TOOL timeout
EXPORTS TOOL time
EXPORTS TOOL uname
EXPORTS TOOL hostname
EXPORTS TOOL realpath
EXPORTS TOOL diff
EXPORTS TOOL patch
EXPORTS TOOL du
EXPORTS TOOL dd
EXPORTS TOOL tty
EXPORTS TOOL gzip

EXPORTS FOLDER process-sdk       /usr/lib/dolly/process
EXPORTS FOLDER clang-headers     /usr/lib/clang/24/include
EXPORTS FILE   compiler          /usr/libexec/dolly/process-bin/compiler
EXPORTS FILE   kernel-plugin-abi /usr/lib/dolly/dolly-kernel-plugin-0.wasm

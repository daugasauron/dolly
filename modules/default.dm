DOLLY 2
MODULE default

# Direct children form this module's private sequential scope. Each child's
# requirements resolve only against exports from earlier children in this list.
USE HOST /modules/bootstrap.dm  be6ba4f8a513c5c617697692d4f50e22000740cb3d0ce21bc5212a105c651db4
USE HOST /modules/core-tools.dm 60b30f8d7bf1afaa7be4660235ffaef2c193490a032d0482f170aaf845f39be0
USE HOST /modules/download.dm   b1ed73b5a7ead559f95796024b3d04c1e39cdfbb92d8beae12a1956fc88f1758
USE HOST /modules/tar.dm        360a6449122d932cea12f270ce54a67f2b9022629613f16186b9f4971d49cc3f
USE HOST /modules/make.dm       cd76b282f98810858ec6026602996277b699540f6b55fb8fbb5c4992c1f8762e
USE HOST /modules/zig.dm        31986fc8328d84cdd4fb78e89ae5b8f100a5314825db85cb41c7c8ab04a21e62
USE HOST /modules/ghostty.dm    62344f9b489dd8dbf028ebdc2f2a1b95ed98cda0476980b903bf8d731863bc4b
USE HOST /modules/cpp.dm        2f6dbbcaca09550036d6529d22634fe41dfc0cbd524c46521fa5cc47c3df8296
USE HOST /modules/ninja.dm      77dae6ac93e748551c515115f4e500dc22de5345239d3204756b2ee66f3cdf5a
USE HOST /modules/zlib.dm       091743c99ef011e20bfbe8ed0417f5c01eef5d04b90151f8cdaf561434b3e815
USE HOST /modules/curl.dm       8af181a0e4c84ca3178f607634b5df9ca96027f0f085af4c37d20d1c9e0af140
USE HOST /modules/git.dm        fb3a7901fb1ae3725e0900100f11aadcadef3c30c334ac2146ab4e68a80c0fb5
USE HOST /modules/awk.dm        7b5674be32b3968c82b9af65f31c6d90a0207dee7bc6cb4eaaba30b963c5c09f
USE HOST /modules/sbase.dm      d9f65e1c8f4977061ae6d28e650bdbf40cb09a39daed339c351c6101939dc189

# This is both a runtime and an SDK. Re-exports inherit the exact child object;
# an object not listed here is build-private and is absent from the image.
EXPORTS HEADER libc
EXPORTS HEADER toolchain
EXPORTS HEADER runtime
EXPORTS HEADER http
EXPORTS HEADER display
EXPORTS HEADER download
EXPORTS HEADER cpp
EXPORTS HEADER zlib
EXPORTS HEADER zconf
EXPORTS HEADER curl
EXPORTS HEADER ghostty-vt

EXPORTS LIB compiler-rt
EXPORTS LIB c++
EXPORTS LIB c++abi
EXPORTS LIB z
EXPORTS LIB curl
EXPORTS LIB ghostty-vt
EXPORTS LIB display

EXPORTS ENV CC
EXPORTS ENV CXX
EXPORTS ENV AR
EXPORTS ENV SHELL
EXPORTS ENV PATH
EXPORTS ENV ZIG_LIB_DIR
EXPORTS ENV DISPLAY

EXPORTS TOOL slop
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
EXPORTS TOOL tar
EXPORTS TOOL make
EXPORTS TOOL ninja
EXPORTS TOOL curl
EXPORTS TOOL git
EXPORTS TOOL zig
EXPORTS TOOL awk
EXPORTS TOOL printf
EXPORTS TOOL grep
EXPORTS TOOL sed
EXPORTS TOOL head
EXPORTS TOOL wc
EXPORTS TOOL cc
EXPORTS TOOL c++
EXPORTS TOOL ld
EXPORTS TOOL ar

EXPORTS FOLDER zig-lib

DOLLY 5
MODULE default

# Shared C/C++ build and system utilities, without a display or Rust tools.
USE https://daugasauron.com/modules/download.dm       7ea1997de26f55dcbcdebf135c5a6807c6de82b361710c28b029ddc4d9f3f0dd
USE https://daugasauron.com/modules/upload.dm         843468ba13d9c32a73e19a9d61256b1579f8eaf20e1576439021f07fd3869b4a
USE https://daugasauron.com/modules/ninja.dm          b1ea3b61812b11799f6b75120304ba7c3e8458207930427867809da6bdced174
USE https://daugasauron.com/modules/zlib.dm           c9cb89bda622f88b41fb06e8fbff251610fd8390109ad1f6096dbe98c77d17f7
USE https://daugasauron.com/modules/gzip.dm 3e7742b68f84731a5995929e0199a14bf52d9e8ac39321950b6729bec158bbde
USE https://daugasauron.com/modules/curl.dm           dd0ccb25f10c1f93da6ddce8551dbe63bfa9ff97ce1447b500977c3a21fd454f
USE https://daugasauron.com/modules/git.dm            9759cf314839e76932540612eaccb6a7424ede8b32477e4ec9d2946e97d1a7bf
USE https://daugasauron.com/modules/awk.dm            f19d896eb674f78365275b90e47dd7f6db4a8d0c6f9f4e5959b1eb3c63e59aed
USE https://daugasauron.com/modules/agent-tools.dm    b18504c1666da30a64aabb7f6b28151a2f6acbdc8f1838b10a98a6cc7ad07995

# Retain the runtime and SDK at these paths when the module finishes.
EXPORTS HEADER zlib       /usr/include/zlib.h
EXPORTS HEADER zconf      /usr/include/zconf.h
EXPORTS HEADER curl       /usr/include/curl

EXPORTS LIB z           /usr/lib/libz.a
EXPORTS LIB curl        /usr/lib/libcurl.a

EXPORTS TOOL download
EXPORTS TOOL upload
EXPORTS TOOL ninja
EXPORTS TOOL curl
EXPORTS TOOL git
EXPORTS TOOL awk
EXPORTS TOOL install
EXPORTS TOOL tail
EXPORTS TOOL du
EXPORTS TOOL rev
EXPORTS TOOL command
EXPORTS TOOL xargs
EXPORTS TOOL find
EXPORTS TOOL env
EXPORTS TOOL timeout
EXPORTS TOOL time
EXPORTS TOOL hostname
EXPORTS TOOL realpath
EXPORTS TOOL diff
EXPORTS TOOL patch
EXPORTS TOOL tty
EXPORTS TOOL gzip


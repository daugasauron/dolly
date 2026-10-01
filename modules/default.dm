DOLLY 5
MODULE default

# Shared C/C++ build and system utilities, without a display or Rust tools.
USE https://daugasauron.com/modules/download.dm       7ea1997de26f55dcbcdebf135c5a6807c6de82b361710c28b029ddc4d9f3f0dd
USE https://daugasauron.com/modules/upload.dm         5b6f04da74455d7c6518987b0589e89ec99b9155001b9becf8d27d14ff2c32e5
USE https://daugasauron.com/modules/ninja.dm          71e8b03b542fbaf6f707eb478c38552055ee0e62c68aad3543af5557d6cdadb1
USE https://daugasauron.com/modules/zlib.dm           c9cb89bda622f88b41fb06e8fbff251610fd8390109ad1f6096dbe98c77d17f7
USE https://daugasauron.com/modules/gzip.dm 02ed015588675047dc8824c7f69628b53992b22b8d349a616e5e7c9afdf66efb
USE https://daugasauron.com/modules/curl.dm           9f20518ce7fe1b8a309dbbb2befae0792e52faabb0c877f3c69e0faef71bd520
USE https://daugasauron.com/modules/git.dm            9759cf314839e76932540612eaccb6a7424ede8b32477e4ec9d2946e97d1a7bf
USE https://daugasauron.com/modules/awk.dm            f19d896eb674f78365275b90e47dd7f6db4a8d0c6f9f4e5959b1eb3c63e59aed
USE https://daugasauron.com/modules/agent-tools.dm    6168af8ec61e765555a047b1d3ba7a37b9f16241e5ec333c928c5e50b192fab7

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


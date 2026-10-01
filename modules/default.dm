DOLLY 5
MODULE default

# Shared C/C++ build and system utilities, without a display or Rust tools.
USE https://daugasauron.com/modules/download.dm       7ea1997de26f55dcbcdebf135c5a6807c6de82b361710c28b029ddc4d9f3f0dd
USE https://daugasauron.com/modules/upload.dm         7c135b1f7b7f525b10e045c92572eebf3d09c279bc39a1a8a0a25ae607393b70
USE https://daugasauron.com/modules/ninja.dm          232fc0c1d90d1f51f4c626ae54ee271f690b31ea39bfcd3c29b5c3726b316dd9
USE https://daugasauron.com/modules/zlib.dm           5f7d365bd2c9a033ade4b1a319936b9ddaefb0fac0dfc19caf7cd3c3d31d08c1
USE https://daugasauron.com/modules/gzip.dm d868ef6b11705c0ada34cb55712c8355274417208117cbee1443631622de2917
USE https://daugasauron.com/modules/curl.dm           b615bf88786a559389a68e807bdc0484040523d49891ea5da1a045db9fd43891
USE https://daugasauron.com/modules/git.dm            bdfa72a3cef31873f71686b4481d6616e2306533c4934ffb849123c2eb5c90a6
USE https://daugasauron.com/modules/awk.dm            662bc35207505b49c3233259b1ef18dabfefff6dd3234e4d1bd1d3af079d3ab5
USE https://daugasauron.com/modules/agent-tools.dm    fb597e83df581adcc26ed774d8bdc90411e0e60b544b9531895a2323cdf96ba6

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


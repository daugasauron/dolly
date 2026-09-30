DOLLY 4
MODULE default

# Shared C/C++ build and system utilities, without a display or Rust tools.
USE HOST /modules/download.dm       ba1ad3771193d58464d0ffe6a463f08102db9d72112d76230c771ac3f84c84b1
USE HOST /modules/upload.dm         17c1f142a2568513d94f331962ace1e27fe4c03a06c342f615a3e5060a561fd8
USE HOST /modules/ninja.dm          00e13c414b1e63bd373c1b8d0b54c6e079c138a808d428a0e5d9ab287040354c
USE HOST /modules/zlib.dm           1fc01e0f9f165d635e2dde3feff11ad43a10489bdb557dba8313a1b6c5cfb80c
USE HOST /modules/gzip.dm f159cc4ed4c045f89a3ce1477c513e9ee00b4a949dc7903ac0ef059fbdb5227a
USE HOST /modules/curl.dm           919b250dbdd359b6c2190e5de14399784e5c92ae143312a8b5977c3f0fd66a3e
USE HOST /modules/git.dm            549e11481b59c19e77aadcad3d9be2d1629387ac445f9d9477f3b0d1353d1976
USE HOST /modules/awk.dm            45d33d625d8bfe1aae4fd850b7a45f38eca692e998e05c98577c3ac82c1068a3
USE HOST /modules/agent-tools.dm    e5a1794d1d143526bc1931e9ccbcf345b54399d8b4d1d63e50bb0ae6cae0877d

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


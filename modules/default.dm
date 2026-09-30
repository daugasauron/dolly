DOLLY 4
MODULE default

# Shared C/C++ build and system utilities, without a display or Rust tools.
USE HOST /modules/download.dm       ba1ad3771193d58464d0ffe6a463f08102db9d72112d76230c771ac3f84c84b1
USE HOST /modules/upload.dm         17c1f142a2568513d94f331962ace1e27fe4c03a06c342f615a3e5060a561fd8
USE HOST /modules/ninja.dm          00e13c414b1e63bd373c1b8d0b54c6e079c138a808d428a0e5d9ab287040354c
USE HOST /modules/zlib.dm           348b3b868f0dccd5a70d5f8b5d2e02b6b3c683284c32ebff821b40306a8853e3
USE HOST /modules/gzip.dm f159cc4ed4c045f89a3ce1477c513e9ee00b4a949dc7903ac0ef059fbdb5227a
USE HOST /modules/curl.dm           f10de286ae1175027ea4ba290382fdc595c85b4946902677d56846169bb230c4
USE HOST /modules/git.dm            549e11481b59c19e77aadcad3d9be2d1629387ac445f9d9477f3b0d1353d1976
USE HOST /modules/awk.dm            45d33d625d8bfe1aae4fd850b7a45f38eca692e998e05c98577c3ac82c1068a3
USE HOST /modules/sbase.dm          c0bb65bbab9228cf4e60c134c85c7cf5b5407b1f192c6ef4065b29ccdc035b3b
USE HOST /modules/sbase-tools-1.dm  eaa8bbdfd69200cfebfd00fc94b0a8549cfe26eeff50be596d026feffb9130ec
USE HOST /modules/sbase-tools-2.dm  713269ca6ea544b2c24270a965608290c18db417a0cafc49f0cf3f5c0002460a
USE HOST /modules/sbase-tools-3.dm  5aeeb80f411228c88a9ebfdc534a2d1870c0b29f42c52fdcd9adf2f2cf00adee
USE HOST /modules/sbase-tools-4.dm  a4260fba7adb1186260c02be1377435016406d046822f2bfaff96c91b2d52d98
USE HOST /modules/sbase-tools-5.dm  ad1fb0e9af6100423e9548811b956598b0809b4be6390bc6a21befdae452d8e5
USE HOST /modules/sbase-tools-6.dm  94839b4a27147efba9d2c7a10ad4c16b4335727885794c58ac41917b1e6416ea
USE HOST /modules/sbase-tools-7.dm  d1a26b2997b330f38dd09647c94149b069608b1a2cd471eee2dacbccb0d7178a
USE HOST /modules/sbase-tools-8.dm  608bbd0009a88444ee59c524d536482082b5fc2cd84c3329adb7aab0d8317098
USE HOST /modules/sbase-tools-9.dm  4190002d0dc0e04a114534d20067604b6812b8214936abc8873e806aab48ee97
USE HOST /modules/sbase-tools-10.dm 4e2f79cb416c2d08491551abf6040332df624f6a46a2ee539f083a2f554d7b6e
USE HOST /modules/sbase-tools-11.dm 76a51baf5723016d658caabcef0ffc605a7413d7582de3204290ce5334428db5
USE HOST /modules/sbase-tools-12.dm 44faf330d7551d7f370baada766c68a3334cfafc0ed3adc80d5dc07dc4bf4659
USE HOST /modules/agent-tools.dm    340f372ea23a0c9c252fb9c6aec150c1a52a97642f34618d7a8ff238594e2c3e

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


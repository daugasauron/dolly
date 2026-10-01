DOLLY 5
MODULE sbase

# Unchanged upstream sbase commands, built by sbase's own Makefile.
REQUIRES HEADER libc
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   mv
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE https://daugasauron.com/static/default/sbase.tar a01a6a52283b100e302da15ab69cad0d228f1dd054fbbd5ce0ead6920e372e9e /tmp/sbase.tar
SLOP tar \
  -xf /tmp/sbase.tar \
  -C /

FILE /tmp/sbase/dolly.mk
    TOOLS = basename cksum cmp comm cut date dd dirname expand expr false fold \
            grep head join ln md5sum mktemp nl od paste pathchk printenv printf \
            readlink rmdir sed seq sha256sum sleep sort split strings tee tr true \
            tsort uname unexpand uniq wc which
    .RECIPEPREFIX := >
    dolly-bin: $(TOOLS)
    >mv $(TOOLS) /bin
    .RECIPEPREFIX :=
    include Makefile
SLOP make \
  -C /tmp/sbase \
  -f dolly.mk \
  CFLAGS=-O2 \
  ARFLAGS=rc \
  RANLIB=:

EXPORTS TOOL basename
EXPORTS TOOL cksum
EXPORTS TOOL cmp
EXPORTS TOOL comm
EXPORTS TOOL cut
EXPORTS TOOL date
EXPORTS TOOL dd
EXPORTS TOOL dirname
EXPORTS TOOL expand
EXPORTS TOOL expr
EXPORTS TOOL false
EXPORTS TOOL fold
EXPORTS TOOL grep
EXPORTS TOOL head
EXPORTS TOOL join
EXPORTS TOOL ln
EXPORTS TOOL md5sum
EXPORTS TOOL mktemp
EXPORTS TOOL nl
EXPORTS TOOL od
EXPORTS TOOL paste
EXPORTS TOOL pathchk
EXPORTS TOOL printenv
EXPORTS TOOL printf
EXPORTS TOOL readlink
EXPORTS TOOL rmdir
EXPORTS TOOL sed
EXPORTS TOOL seq
EXPORTS TOOL sha256sum
EXPORTS TOOL sleep
EXPORTS TOOL sort
EXPORTS TOOL split
EXPORTS TOOL strings
EXPORTS TOOL tee
EXPORTS TOOL tr
EXPORTS TOOL true
EXPORTS TOOL tsort
EXPORTS TOOL uname
EXPORTS TOOL unexpand
EXPORTS TOOL uniq
EXPORTS TOOL wc
EXPORTS TOOL which

FILE /usr/share/licenses/sbase/LICENSE

SLOP rm \
  -rf \
  /tmp/sbase \
  /tmp/sbase.tar

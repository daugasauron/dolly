DOLLY 4
MODULE sbase

# Unchanged upstream sbase commands, built by sbase's own Makefile.
REQUIRES HEADER libc
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/sbase.tar /tmp/sbase.tar a01a6a52283b100e302da15ab69cad0d228f1dd054fbbd5ce0ead6920e372e9e
SLOP tar \
  -xf /tmp/sbase.tar \
  -C /

FILE /tmp/sbase/dolly.mk
    TOOLS = basename cat cksum cmp comm cp cut date dd dirname du echo expand expr \
            false fold grep head join ln ls md5sum mktemp mv nl od paste pathchk \
            printenv printf pwd readlink rmdir sed seq sha256sum sleep sort \
            split strings tail tee test touch tr true tsort uname unexpand uniq wc \
            which xinstall
    .RECIPEPREFIX := >
    dolly-bin: $(TOOLS)
    >./mv $(TOOLS) /bin
    >mv /bin/xinstall /bin/install
    >ln -s test /bin/[
    .RECIPEPREFIX :=
    include Makefile
SLOP make \
  -C /tmp/sbase \
  -f dolly.mk \
  CFLAGS=-O2 \
  ARFLAGS=rc \
  RANLIB=:

EXPORTS TOOL basename
EXPORTS TOOL cat
EXPORTS TOOL cksum
EXPORTS TOOL cmp
EXPORTS TOOL comm
EXPORTS TOOL cp
EXPORTS TOOL cut
EXPORTS TOOL date
EXPORTS TOOL dd
EXPORTS TOOL dirname
EXPORTS TOOL du
EXPORTS TOOL echo
EXPORTS TOOL expand
EXPORTS TOOL expr
EXPORTS TOOL false
EXPORTS TOOL fold
EXPORTS TOOL grep
EXPORTS TOOL head
EXPORTS TOOL join
EXPORTS TOOL ln
EXPORTS TOOL ls
EXPORTS TOOL md5sum
EXPORTS TOOL mktemp
EXPORTS TOOL mv
EXPORTS TOOL nl
EXPORTS TOOL od
EXPORTS TOOL paste
EXPORTS TOOL pathchk
EXPORTS TOOL printenv
EXPORTS TOOL printf
EXPORTS TOOL pwd
EXPORTS TOOL readlink
EXPORTS TOOL rmdir
EXPORTS TOOL sed
EXPORTS TOOL seq
EXPORTS TOOL sha256sum
EXPORTS TOOL sleep
EXPORTS TOOL sort
EXPORTS TOOL split
EXPORTS TOOL strings
EXPORTS TOOL tail
EXPORTS TOOL tee
EXPORTS TOOL test
EXPORTS TOOL touch
EXPORTS TOOL tr
EXPORTS TOOL true
EXPORTS TOOL tsort
EXPORTS TOOL uname
EXPORTS TOOL unexpand
EXPORTS TOOL uniq
EXPORTS TOOL wc
EXPORTS TOOL which
EXPORTS TOOL install
EXPORTS TOOL [

FILE /usr/share/licenses/sbase/LICENSE

SLOP rm \
  -rf \
  /tmp/sbase \
  /tmp/sbase.tar

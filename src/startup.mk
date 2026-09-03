CC := cc
CXX := c++
AR := ar

.PHONY: sbase awk curl zlib git libcxx ninja quickjs pi typescript zig ghostty extras

EMSCRIPTEN_SYSTEM := /usr/src/emscripten/system/lib
LIBCXX_SOURCE_ROOT := $(EMSCRIPTEN_SYSTEM)/libcxx/src
LIBCXX_OBJECTS := \
	/tmp/libcxx/string-dolly.o /tmp/libcxx/hash-dolly.o \
	/tmp/libcxx/new-dolly.o /tmp/libcxx/misc-dolly.o

libcxx: /usr/lib/libc++.a /usr/lib/libc++abi.a

/tmp/libcxx/string-dolly.o: /usr/src/dolly/runtimes/libcxx-string-dolly.c
	mkdir -p $(@D)
	$(CC) -O2 -fPIC -fvisibility=hidden -fno-sanitize-coverage -c $< -o $@

/tmp/libcxx/hash-dolly.o: /usr/src/dolly/runtimes/libcxx-hash-dolly.c
	mkdir -p $(@D)
	$(CC) -O2 -fPIC -fvisibility=hidden -fno-sanitize-coverage -c $< -o $@

/tmp/libcxx/new-dolly.o: /usr/src/dolly/runtimes/libcxx-new-dolly.c
	mkdir -p $(@D)
	$(CC) -O2 -fPIC -fvisibility=hidden -fno-sanitize-coverage -c $< -o $@

/tmp/libcxx/misc-dolly.o: /usr/src/dolly/runtimes/libcxx-misc-dolly.c
	mkdir -p $(@D)
	$(CC) -O2 -fPIC -fvisibility=hidden -fno-sanitize-coverage -c $< -o $@

/usr/lib/libc++.a: $(LIBCXX_OBJECTS)
	$(AR) rcs $@ $^

/usr/lib/libc++abi.a:
	$(AR) rcs $@

SAMURAI_SOURCE_ROOT := /usr/src/samurai
SAMURAI_NAMES := build deps env graph htab log parse samu scan tool tree util os-posix
SAMURAI_SOURCES := $(addprefix $(SAMURAI_SOURCE_ROOT)/,$(addsuffix .c,$(SAMURAI_NAMES)))
SAMURAI_UNIT := /usr/src/dolly/runtimes/samurai-unit-dolly.c
SAMURAI_OBJECTS := $(addprefix /tmp/samurai/part-,$(addsuffix .o,1 2 3 4 5 6 7 8 9 10 11 12 13))
SAMURAI_CFLAGS := -O1 -std=c99 -D_POSIX_C_SOURCE=200809L -DDOLLY \
	-I $(SAMURAI_SOURCE_ROOT)

ninja: /usr/bin/ninja

/tmp/samurai/part-12.o: $(SAMURAI_UNIT) $(SAMURAI_SOURCES)
	mkdir -p $(@D)
	$(CC) $(SAMURAI_CFLAGS) -O0 -fdolly-runtime-interrupt-handler -DDOLLY_SAMURAI_PART=12 -c $(SAMURAI_UNIT) -o $@

/tmp/samurai/part-%.o: $(SAMURAI_UNIT) $(SAMURAI_SOURCES)
	mkdir -p $(@D)
	$(CC) $(SAMURAI_CFLAGS) -DDOLLY_SAMURAI_PART=$* -c $(SAMURAI_UNIT) -o $@

/usr/bin/ninja: $(SAMURAI_OBJECTS)
	$(CC) $(SAMURAI_OBJECTS) -o $@

SBASE_CPPFLAGS := -I /usr/src/sbase -D_DEFAULT_SOURCE -D_XOPEN_SOURCE=700

sbase: /bin/grep /bin/sed /bin/head /bin/wc /bin/cut /bin/od /bin/printf /bin/true /bin/false /bin/sort /bin/uniq /bin/basename /bin/dirname /bin/tr /bin/cmp /bin/date /bin/mktemp /bin/sha256sum /bin/md5sum /bin/sleep /bin/ln /bin/readlink /bin/rmdir /bin/seq /bin/paste /bin/comm /bin/expr /bin/nl /bin/join /bin/split /bin/strings /bin/cksum /bin/fold /bin/expand /bin/unexpand /bin/tsort /bin/pathchk

/bin/grep: /usr/src/sbase/grep.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strcasestr.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/sed: /usr/src/sbase/sed.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strlcat.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/isdigitrune.c /usr/src/sbase/libutf/isspacerune.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/head: /usr/src/sbase/head.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strtonum.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/wc: /usr/src/sbase/wc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/isspacerune.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/cut: /usr/src/sbase/cut.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/memmem.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/unescape.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/od: /usr/src/sbase/od.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/parseoffset.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/true: /usr/src/sbase/true.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/false: /usr/src/sbase/false.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/printf: /usr/src/sbase/printf.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutil/estrtod.c /usr/src/sbase/libutil/unescape.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/utftorunestr.c /usr/src/sbase/libutf/fputrune.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/sort: /usr/src/sbase/sort.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/getlines.c /usr/src/sbase/libutil/linecmp.c /usr/src/sbase/libutil/memmem.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/unescape.c /usr/src/sbase/libutf/isalnumrune.c /usr/src/sbase/libutf/isalpharune.c /usr/src/sbase/libutf/isblankrune.c /usr/src/sbase/libutf/iscntrlrune.c /usr/src/sbase/libutf/isdigitrune.c /usr/src/sbase/libutf/isprintrune.c /usr/src/sbase/libutf/lowerrune.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/runetype.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/uniq: /usr/src/sbase/uniq.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strtonum.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/basename: /usr/src/sbase/basename.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/dirname: /usr/src/sbase/dirname.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

SBASE_TR_UTF := /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/fputrune.c /usr/src/sbase/libutf/isalnumrune.c /usr/src/sbase/libutf/isalpharune.c /usr/src/sbase/libutf/isblankrune.c /usr/src/sbase/libutf/iscntrlrune.c /usr/src/sbase/libutf/isdigitrune.c /usr/src/sbase/libutf/isgraphrune.c /usr/src/sbase/libutf/isprintrune.c /usr/src/sbase/libutf/ispunctrune.c /usr/src/sbase/libutf/isspacerune.c /usr/src/sbase/libutf/istitlerune.c /usr/src/sbase/libutf/isxdigitrune.c /usr/src/sbase/libutf/lowerrune.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/upperrune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/utftorunestr.c

/bin/tr: /usr/src/sbase/tr.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/unescape.c $(SBASE_TR_UTF)
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/cmp: /usr/src/sbase/cmp.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/date: /usr/src/sbase/date.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strtonum.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/mktemp: /usr/src/sbase/mktemp.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strlcat.c /usr/src/sbase/libutil/strlcpy.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/sha256sum: /usr/src/sbase/sha256sum.c /usr/src/sbase/libutil/crypt.c /usr/src/sbase/libutil/sha256.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/md5sum: /usr/src/sbase/md5sum.c /usr/src/sbase/libutil/crypt.c /usr/src/sbase/libutil/md5.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/sleep: /usr/src/sbase/sleep.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/strtonum.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/ln: /usr/src/sbase/ln.c /usr/src/sbase/libutil/eprintf.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/readlink: /usr/src/sbase/readlink.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/rmdir: /usr/src/sbase/rmdir.c /usr/src/sbase/libutil/eprintf.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/seq: /usr/src/sbase/seq.c /usr/src/sbase/libutil/estrtod.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/paste: /usr/src/sbase/paste.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/unescape.c $(SBASE_TR_UTF)
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/comm: /usr/src/sbase/comm.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/linecmp.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/expr: /usr/src/sbase/expr.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strlcat.c /usr/src/sbase/libutil/strlcpy.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/nl: /usr/src/sbase/nl.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strlcat.c /usr/src/sbase/libutil/strlcpy.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutil/unescape.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/join: /usr/src/sbase/join.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/memmem.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutil/unescape.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/split: /usr/src/sbase/split.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/parseoffset.c /usr/src/sbase/libutil/strlcpy.c /usr/src/sbase/libutil/strtonum.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/strings: /usr/src/sbase/strings.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/fputrune.c /usr/src/sbase/libutf/iscntrlrune.c /usr/src/sbase/libutf/isprintrune.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/runetype.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/cksum: /usr/src/sbase/cksum.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/fold: /usr/src/sbase/fold.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutf/isblankrune.c /usr/src/sbase/libutf/rune.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/expand: /usr/src/sbase/expand.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strsep.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/fputrune.c /usr/src/sbase/libutf/rune.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/unexpand: /usr/src/sbase/unexpand.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strsep.c /usr/src/sbase/libutil/strtonum.c /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/fputrune.c /usr/src/sbase/libutf/rune.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/tsort: /usr/src/sbase/tsort.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/pathchk: /usr/src/sbase/pathchk.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

AWK_CPPFLAGS := -std=gnu99 -I /usr/src/awk -D_DEFAULT_SOURCE -DNDEBUG
AWK_SOURCES := /usr/src/awk/awkgram.tab.c /usr/src/awk/b.c /usr/src/awk/main.c /usr/src/awk/parse.c /usr/src/awk/proctab.c /usr/src/awk/tran.c /usr/src/awk/lib.c /usr/src/awk/run.c /usr/src/awk/lex.c

awk: /bin/awk

/usr/libexec/dolly/awk-maketab: /usr/src/awk/maketab.c
	$(CC) -std=gnu99 -I /usr/src/awk -DNDEBUG $< -o $@

/usr/src/awk/proctab.c: /usr/libexec/dolly/awk-maketab /usr/src/awk/awkgram.tab.h
	/usr/libexec/dolly/awk-maketab /usr/src/awk/awkgram.tab.h > $@

/bin/awk: $(AWK_SOURCES)
	$(CC) $(AWK_CPPFLAGS) $^ -o $@

curl: /usr/lib/libcurl.a /usr/bin/curl
	rm -f /tmp/libcurl-fetch.o

/tmp/libcurl-fetch.o: /usr/src/dolly/libcurl-fetch.c
	$(CC) -std=c17 -D_DEFAULT_SOURCE -c $< -o $@

/usr/lib/libcurl.a: /tmp/libcurl-fetch.o
	$(AR) rcs $@ $^

/usr/bin/curl: /usr/src/dolly/commands/curl.c /usr/lib/libcurl.a
	$(CC) /usr/src/dolly/commands/curl.c -lcurl -o $@

ZLIB_NAMES := adler32 crc32 deflate gzclose gzlib gzread gzwrite infback inffast inflate inftrees trees uncompr zutil
ZLIB_OBJECTS := $(addprefix /tmp/zlib/,$(addsuffix .o,$(ZLIB_NAMES)))

zlib: /usr/lib/libz.a
	rm -rf /tmp/zlib

/tmp/zlib:
	mkdir -p $@

/tmp/zlib/%.o: /usr/src/zlib/%.c | /tmp/zlib
	$(CC) -std=c17 -I /usr/src/zlib -DZ_HAVE_UNISTD_H -c $< -o $@

/usr/lib/libz.a: $(ZLIB_OBJECTS)
	$(AR) rcs $@ $^

/bin/gzip: /usr/src/dolly/commands/gzip.c /usr/lib/libz.a
	$(CC) -std=c17 -I /usr/include $< -lz -o $@

GIT_SOURCES = $(file </usr/src/git/dolly-sources.txt)
GIT_OBJECTS = $(addprefix /tmp/git/,$(GIT_SOURCES:.c=.o))
GIT_CPPFLAGS := -std=gnu99 -D_DEFAULT_SOURCE -DDOLLY -Uatexit -DNO_GETTEXT -DNO_ICONV -DNO_EXPAT -DNO_PTHREADS -DNO_UNIX_SOCKETS -DNO_OPENSSL -DNO_PERL -DNO_PYTHON -DNO_IPV6 -DNO_MMAP -DNO_POLL -DNO_REGEX -DGAWK -DNO_MBSUPPORT -DNO_MEMMEM -DNO_PREAD -DNO_SETENV -DNO_STRCASESTR -DNO_STRLCPY -DNO_STRTOUMAX -DSHA1_BLK -DSHA256_BLK -DHAVE_ALLOCA_H -DHAVE_STRINGS_H -DHAVE_CLOCK_GETTIME -DHAVE_GETRANDOM '-DGIT_VERSION_H="version-def.h"' '-DBINDIR="/usr/bin"' '-DGIT_EXEC_PATH="/usr/libexec/dolly"' '-DDEFAULT_GIT_TEMPLATE_DIR="/usr/share/git-core/templates"' '-DFALLBACK_RUNTIME_PREFIX="/usr"' '-DGIT_HOST_CPU="wasm64"' '-DGIT_LOCALE_PATH="/usr/share/locale"' '-DSHELL_PATH="/bin/slop"' '-DPAGER_ENV="LESS=FRX LV=-c"' '-DETC_GITCONFIG="/etc/gitconfig"' '-DETC_GITATTRIBUTES="/etc/gitattributes"' '-DGIT_HTML_PATH="/usr/share/doc/git/html"' '-DGIT_MAN_PATH="/usr/share/man"' '-DGIT_INFO_PATH="/usr/share/info"' -include dolly/runtime.h -I /usr/src/git/compat/regex -I /usr/src/git/compat/poll -I /usr/src/git -I /usr/src/zlib

git: /usr/bin/git /usr/libexec/dolly/git-remote-http /usr/libexec/dolly/git-remote-https
	rm -rf /tmp/git

/tmp/git/%.o: /usr/src/git/%.c
	mkdir -p $(dir $@)
	$(CC) $(GIT_CPPFLAGS) -c $< -o $@

/usr/lib/libgit.a: $(GIT_OBJECTS)
	$(AR) rcs $@ $^

/usr/bin/git: /usr/src/git/common-main.c /usr/src/git/git.c /usr/lib/libgit.a
	$(CC) $(GIT_CPPFLAGS) /usr/src/git/common-main.c /usr/src/git/git.c -lgit -lz -o $@

/usr/libexec/dolly/git-remote-http: /usr/src/git/common-main.c /usr/src/git/remote-curl.c /usr/src/git/http.c /usr/src/git/http-walker.c /usr/lib/libgit.a
	$(CC) $(GIT_CPPFLAGS) /usr/src/git/common-main.c /usr/src/git/remote-curl.c /usr/src/git/http.c /usr/src/git/http-walker.c -lgit -lcurl -lz -o $@

/usr/libexec/dolly/git-remote-https: /usr/libexec/dolly/git-remote-http
	$(CC) $(GIT_CPPFLAGS) /usr/src/git/common-main.c /usr/src/git/remote-curl.c /usr/src/git/http.c /usr/src/git/http-walker.c -lgit -lcurl -lz -o $@

QUICKJS_NAMES := dtoa libregexp libunicode quickjs
QUICKJS_OBJECTS := /tmp/quickjs/quickjs-main.o $(addprefix /tmp/quickjs/,$(addsuffix .o,$(QUICKJS_NAMES)))
QUICKJS_CPPFLAGS := -std=gnu11 -I /usr/src/quickjs -I /usr/src/dolly/runtimes -DEMSCRIPTEN=1 -D_GNU_SOURCE -DQUICKJS_NG_BUILD -DNDEBUG -funsigned-char -fdolly-runtime-interrupt-handler

quickjs: /usr/bin/qjs /usr/bin/janis

/tmp/quickjs:
	mkdir -p $@

/tmp/quickjs/quickjs-main.o: /usr/src/dolly/runtimes/quickjs-main.c /usr/src/dolly/runtimes/quickjs-runner.h | /tmp/quickjs
	$(CC) $(QUICKJS_CPPFLAGS) -c $< -o $@

/tmp/quickjs/%.o: /usr/src/quickjs/%.c | /tmp/quickjs
	$(CC) $(QUICKJS_CPPFLAGS) -c $< -o $@

/usr/lib/libdolly-js.a: $(QUICKJS_OBJECTS)
	$(AR) rcs $@ $^

/usr/bin/qjs: /usr/src/dolly/commands/qjs.c /usr/lib/libdolly-js.a
	$(CC) $(QUICKJS_CPPFLAGS) $< -ldolly-js -o $@

/usr/bin/janis: /usr/src/dolly/commands/janis.c /usr/lib/libdolly-js.a
	$(CC) $(QUICKJS_CPPFLAGS) $< -ldolly-js -o $@

pi: /usr/bin/pi

/usr/bin/pi: /usr/src/dolly/commands/pi.c /usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js /usr/lib/libdolly-js.a
	$(CC) $(QUICKJS_CPPFLAGS) $< -ldolly-js -o $@

typescript: /usr/bin/tsc

/usr/bin/tsc: /usr/src/dolly/commands/tsc.c /usr/lib/typescript/tsc-dolly.mjs /usr/lib/typescript/package/lib/_tsc.js /usr/lib/libdolly-js.a
	$(CC) $(QUICKJS_CPPFLAGS) $< -ldolly-js -o $@

zig: /usr/bin/zig /usr/libexec/dolly/zig-check

/tmp/zig:
	mkdir -p $@

/usr/libexec/dolly/zig-object-check: /usr/src/dolly/zig/object-check.c
	$(CC) -std=c99 $< -o $@

/tmp/zig/answer.o: /usr/bin/zig /usr/src/dolly/zig/answer.zig /usr/libexec/dolly/zig-object-check | /tmp/zig
	zig build-obj -OReleaseSmall -target wasm64-emscripten \
		-mcpu=generic+atomics -fPIC -fsingle-threaded -fcompiler-rt -lc \
		--name dolly-zig-answer -femit-bin=$@ \
		-Mroot=/usr/src/dolly/zig/answer.zig
	/usr/libexec/dolly/zig-object-check $@

/usr/libexec/dolly/zig-check: /tmp/zig/answer.o /usr/src/dolly/zig/check.c
	$(CC) -std=c99 /usr/src/dolly/zig/check.c /tmp/zig/answer.o -o $@

GHOSTTY_ZIG_FLAGS := build-obj -OReleaseSmall \
	-target wasm64-emscripten -mcpu=generic+atomics -fPIC \
	-fsingle-threaded -fcompiler-rt -lc --name ghostty-vt \
	--dep build_options --dep terminal_options --dep unicode_tables \
	--dep symbols_tables --dep uucode \
	-Mroot=/usr/src/ghostty/src/lib_vt.zig \
	-Mbuild_options=/usr/src/ghostty/generated/build-options.zig \
	-Mterminal_options=/usr/src/ghostty/generated/terminal-options.zig \
	-Municode_tables=/usr/src/ghostty/generated/unicode-props.zig \
	-Msymbols_tables=/usr/src/ghostty/generated/unicode-symbols.zig \
	-ODebug --dep types.zig --dep config.zig --dep tables \
	-Muucode=/usr/src/uucode/src/root.zig \
	-ODebug -Mtypes.zig=/usr/src/uucode/src/types.zig \
	-ODebug --dep types.zig --dep storage.zig \
	-Mconfig.zig=/usr/src/uucode/src/config.zig \
	-ODebug --dep config.zig --dep storage.zig --dep build_config \
	-Mtables=/usr/src/ghostty/generated/uucode-tables.zig \
	-ODebug --dep config.zig -Mstorage.zig=/usr/src/uucode/src/storage.zig \
	--dep config.zig --dep storage.zig \
	-Mbuild_config=/usr/src/ghostty/src/build/uucode_config.zig

ghostty: /usr/lib/libghostty-vt.a /usr/bin/ghostty-vt /usr/libexec/dolly/display.wasm

/tmp/ghostty:
	mkdir -p $@

ifeq ($(wildcard /tmp/ghostty/ghostty-vt.o),)
/tmp/ghostty/ghostty-vt.o: /usr/bin/zig /usr/src/ghostty/src/lib_vt.zig /usr/src/ghostty/generated/uucode-tables.zig | /tmp/ghostty
	zig $(GHOSTTY_ZIG_FLAGS) -femit-bin=$@
endif

/usr/lib/libghostty-vt.a: /tmp/ghostty/ghostty-vt.o
	$(AR) rcs $@ $^

/usr/bin/ghostty-vt: /usr/src/dolly/ghostty/check.c /usr/lib/libghostty-vt.a
	$(CC) -std=c17 -I /usr/include $< -lghostty-vt -o $@

/usr/libexec/dolly/display.wasm: /usr/src/dolly/ghostty/display.c /usr/lib/libghostty-vt.a /usr/include/stb_truetype.h /usr/include/dolly/display.h /usr/share/fonts/IosevkaTerm-SemiBold.ttf
	$(CC) -std=c17 -I /usr/include $< -lghostty-vt -o $@

extras: /usr/libexec/dolly/cpp-check /usr/bin/demo

/usr/libexec/dolly/cpp-check: /usr/src/dolly/cpp-check.cpp
	$(CXX) $< -o $@

/usr/bin/demo: /usr/src/dolly/demo.c
	$(CC) $< -o $@

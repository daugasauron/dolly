CC := cc
CXX := c++
AR := ar

.PHONY: sbase awk curl zlib git quickjs pi zig ghostty extras

SBASE_CPPFLAGS := -I /usr/src/sbase -D_DEFAULT_SOURCE -D_XOPEN_SOURCE=700

sbase: /bin/grep /bin/sed /bin/head /bin/wc

/bin/grep: /usr/src/sbase/grep.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strcasestr.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/sed: /usr/src/sbase/sed.c /usr/src/sbase/libutil/ealloc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/eregcomp.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/reallocarray.c /usr/src/sbase/libutil/strlcat.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/utf.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/isdigitrune.c /usr/src/sbase/libutf/isspacerune.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/head: /usr/src/sbase/head.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutil/strtonum.c
	$(CC) $(SBASE_CPPFLAGS) $^ -o $@

/bin/wc: /usr/src/sbase/wc.c /usr/src/sbase/libutil/eprintf.c /usr/src/sbase/libutil/fshut.c /usr/src/sbase/libutf/fgetrune.c /usr/src/sbase/libutf/rune.c /usr/src/sbase/libutf/runetype.c /usr/src/sbase/libutf/isspacerune.c
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

GIT_SOURCES := $(shell cat /usr/src/git/dolly-sources.txt)
GIT_OBJECTS := $(addprefix /tmp/git/,$(GIT_SOURCES:.c=.o))
GIT_CPPFLAGS := -std=gnu99 -D_DEFAULT_SOURCE -DDOLLY -Uatexit -DNO_GETTEXT -DNO_ICONV -DNO_EXPAT -DNO_PTHREADS -DNO_UNIX_SOCKETS -DNO_OPENSSL -DNO_PERL -DNO_PYTHON -DNO_IPV6 -DNO_MMAP -DNO_POLL -DNO_REGEX -DGAWK -DNO_MBSUPPORT -DNO_MEMMEM -DNO_PREAD -DNO_SETENV -DNO_STRCASESTR -DNO_STRLCPY -DNO_STRTOUMAX -DSHA1_BLK -DSHA256_BLK -DHAVE_ALLOCA_H -DHAVE_STRINGS_H -DHAVE_CLOCK_GETTIME -DHAVE_GETRANDOM '-DGIT_VERSION_H="version-def.h"' '-DBINDIR="/usr/bin"' '-DGIT_EXEC_PATH="/usr/libexec/git-core"' '-DDEFAULT_GIT_TEMPLATE_DIR="/usr/share/git-core/templates"' '-DFALLBACK_RUNTIME_PREFIX="/usr"' '-DGIT_HOST_CPU="wasm64"' '-DGIT_LOCALE_PATH="/usr/share/locale"' '-DSHELL_PATH="/bin/sh"' '-DPAGER_ENV="LESS=FRX LV=-c"' '-DETC_GITCONFIG="/etc/gitconfig"' '-DETC_GITATTRIBUTES="/etc/gitattributes"' '-DGIT_HTML_PATH="/usr/share/doc/git/html"' '-DGIT_MAN_PATH="/usr/share/man"' '-DGIT_INFO_PATH="/usr/share/info"' -include dolly/runtime.h -I /usr/src/git/compat/regex -I /usr/src/git/compat/poll -I /usr/src/git -I /usr/src/zlib

git: /usr/bin/git /usr/libexec/git-core/git-remote-http /usr/libexec/git-core/git-remote-https
	rm -rf /tmp/git

/tmp/git/%.o: /usr/src/git/%.c
	mkdir -p $(dir $@)
	$(CC) $(GIT_CPPFLAGS) -c $< -o $@

/usr/lib/libgit.a: $(GIT_OBJECTS)
	$(AR) rcs $@ $^

/usr/bin/git: /usr/src/git/common-main.c /usr/src/git/git.c /usr/lib/libgit.a
	$(CC) $(GIT_CPPFLAGS) /usr/src/git/common-main.c /usr/src/git/git.c -lgit -lz -o $@

/usr/libexec/git-core/git-remote-http: /usr/src/git/common-main.c /usr/src/git/remote-curl.c /usr/src/git/http.c /usr/src/git/http-walker.c /usr/lib/libgit.a
	$(CC) $(GIT_CPPFLAGS) /usr/src/git/common-main.c /usr/src/git/remote-curl.c /usr/src/git/http.c /usr/src/git/http-walker.c -lgit -lcurl -lz -o $@

/usr/libexec/git-core/git-remote-https: /usr/libexec/git-core/git-remote-http
	$(CC) $(GIT_CPPFLAGS) /usr/src/git/common-main.c /usr/src/git/remote-curl.c /usr/src/git/http.c /usr/src/git/http-walker.c -lgit -lcurl -lz -o $@

QUICKJS_NAMES := dtoa libregexp libunicode quickjs
QUICKJS_OBJECTS := /tmp/quickjs/quickjs-main.o $(addprefix /tmp/quickjs/,$(addsuffix .o,$(QUICKJS_NAMES)))
QUICKJS_CPPFLAGS := -std=gnu11 -I /usr/src/quickjs -I /usr/src/dolly/runtimes -DEMSCRIPTEN=1 -D_GNU_SOURCE -DQUICKJS_NG_BUILD -DNDEBUG -funsigned-char

quickjs: /usr/bin/qjs

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

pi: /usr/bin/pi

/usr/bin/pi: /usr/src/dolly/commands/pi.c /usr/lib/pi/pi.js /usr/lib/libdolly-js.a
	$(CC) $(QUICKJS_CPPFLAGS) $< -ldolly-js -o $@

zig: /usr/bin/zig /usr/libexec/dolly/zig-check

/tmp/zig:
	mkdir -p $@

WAMR_ROOT := /usr/src/wamr/core
WAMR_EMS := ems_alloc ems_gc ems_hmu ems_kfc
WAMR_UTILS := bh_assert bh_bitmap bh_common bh_hashmap bh_leb128 bh_list bh_log bh_queue bh_vector runtime_timer
WAMR_COMMON := wasm_application wasm_blocking_op wasm_c_api wasm_exec_env wasm_loader_common wasm_memory wasm_native wasm_runtime_common wasm_shared_memory
WAMR_INTERP := wasm_interp_fast wasm_loader wasm_runtime
WAMR_SOURCES := \
	$(addprefix $(WAMR_ROOT)/shared/mem-alloc/ems/,$(addsuffix .c,$(WAMR_EMS))) \
	$(WAMR_ROOT)/shared/mem-alloc/mem_alloc.c \
	$(addprefix $(WAMR_ROOT)/shared/utils/,$(addsuffix .c,$(WAMR_UTILS))) \
	$(addprefix $(WAMR_ROOT)/iwasm/common/,$(addsuffix .c,$(WAMR_COMMON))) \
	$(WAMR_ROOT)/iwasm/common/arch/invokeNative_general.c \
	$(addprefix $(WAMR_ROOT)/iwasm/interpreter/,$(addsuffix .c,$(WAMR_INTERP)))
WAMR_CPPFLAGS := \
	-D_PLATFORM_WASI_TYPES_H -DBH_PLATFORM_DOLLY -DBUILD_TARGET_X86_64 \
	-DBH_MALLOC=wasm_runtime_malloc -DBH_FREE=wasm_runtime_free \
	-DWA_MALLOC=wasm_runtime_malloc -DWA_FREE=wasm_runtime_free \
	-DWASM_ENABLE_INTERP=1 -DWASM_ENABLE_FAST_INTERP=1 \
	-DWASM_ENABLE_BULK_MEMORY=1 -DWASM_ENABLE_BULK_MEMORY_OPT=1 \
	-DWASM_ENABLE_SHRUNK_MEMORY=1 -DWASM_DISABLE_HW_BOUND_CHECK=1 \
	-DWASM_DISABLE_STACK_HW_BOUND_CHECK=1 -DWASM_DISABLE_WRITE_GS_BASE=1 \
	-DWASM_DISABLE_WAKEUP_BLOCKING_OP=1 -DWASM_ENABLE_SHARED_MEMORY=0 \
	-DWASM_ENABLE_MULTI_MODULE=0 -DWASM_ENABLE_MINI_LOADER=0 \
	-DWASM_ENABLE_REF_TYPES=0 -DWASM_ENABLE_SIMD=0 \
	-DWASM_ENABLE_EXTENDED_CONST_EXPR=0 -DWASM_ENABLE_MEMORY64=0 \
	-I /usr/src/dolly/runtimes/wamr-platform \
	-I $(WAMR_ROOT)/shared/platform/include \
	-I $(WAMR_ROOT)/shared/utils -I $(WAMR_ROOT)/shared/mem-alloc \
	-I $(WAMR_ROOT)/iwasm/include -I $(WAMR_ROOT)/iwasm/common \
	-I $(WAMR_ROOT)/iwasm/interpreter -I /usr/src/zig/stage1

/usr/libexec/dolly/zig1: /usr/src/dolly/runtimes/zig1-wamr.c /usr/src/dolly/runtimes/wamr-platform/platform.c $(WAMR_SOURCES) /usr/src/zig/stage1/wasi.c /usr/src/zig/stage1/zig1.wasm
	$(CC) -std=gnu99 -Oz -fno-strict-aliasing -Wno-return-type \
		-Wno-unused-parameter -Wno-unused-function -Wno-macro-redefined \
		$(WAMR_CPPFLAGS) /usr/src/dolly/runtimes/zig1-wamr.c \
		/usr/src/dolly/runtimes/wamr-platform/platform.c $(WAMR_SOURCES) -o $@

/usr/bin/zig: /usr/src/dolly/commands/zig.c /usr/libexec/dolly/zig1
	$(CC) $< -o $@

/tmp/zig/answer.c: /usr/bin/zig /usr/src/dolly/zig/answer.zig | /tmp/zig
	zig build-obj -ofmt=c -OReleaseSmall --name dolly-zig-answer -femit-bin=$@ -target wasm64-freestanding -Mroot=/usr/src/dolly/zig/answer.zig

/usr/libexec/dolly/zig-check: /tmp/zig/answer.c /usr/src/dolly/zig/check.c
	$(CC) -std=c99 -I /usr/lib/zig $^ -o $@

GHOSTTY_ZIG_FLAGS := build-obj -ofmt=c -OReleaseSmall \
	-target wasm64-freestanding -mcpu generic -lc --name ghostty-vt \
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

GHOSTTY_CFLAGS := -std=c17 -Os -D__STDC_NO_ATOMICS__=1 -fno-strict-aliasing \
	-Wno-incompatible-pointer-types -I /usr/src/dolly/zig/include \
	-I /usr/lib/zig

ghostty: /usr/lib/libghostty-vt.a /usr/bin/ghostty-vt /usr/libexec/dolly/display.wasm

/tmp/ghostty:
	mkdir -p $@

ifeq ($(wildcard /tmp/ghostty/ghostty-vt.c),)
/tmp/ghostty/ghostty-vt.c: /usr/bin/zig /usr/src/ghostty/src/lib_vt.zig /usr/src/ghostty/generated/uucode-tables.zig | /tmp/ghostty
	zig $(GHOSTTY_ZIG_FLAGS) -femit-bin=$@
endif

/tmp/ghostty/ghostty-vt.o: /tmp/ghostty/ghostty-vt.c
	$(CC) $(GHOSTTY_CFLAGS) -c $< -o $@

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

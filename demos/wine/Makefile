# SPDX-License-Identifier: MIT
# Wine's own libraries and programs built as one static wasm64 program:
# tools first, then the headers widl generates, then each module (module.mk).
SRC := /usr/src/wine
PORT := /usr/src/dolly/wine
B := /tmp/wine
T := $(B)/tools
CC := cc
CFLAGS := -O2 -fno-strict-aliasing -pthread -w
TOOLCPP := -I$(PORT) -I$(SRC)/include -D__WINESRC__

X86 := /usr/share/wine/x86
all: /usr/bin/wine fonts $(X86)/hello_win.exe

# libwine_port and the parts of libwine the tools use.
PORT_SRCS := $(wildcard $(SRC)/libs/port/*.c)
PORT_OBJS := $(PORT_SRCS:$(SRC)/%.c=$(B)/obj/%.o)
WPP_OBJS := $(addprefix $(B)/obj/libs/wpp/,preproc.o wpp.o ppl.yy.o ppy.tab.o)
UNICODE_OBJS := $(addprefix $(B)/obj/libs/wine/,casemap.o collation.o sortkey.o string.o wctype.o)

$(B)/obj/libs/wine/%.o: MODFLAGS := -DWINE_UNICODE_API=""
$(B)/obj/tools/winebuild/%.o $(B)/obj/port/winebuild-dolly.o: MODFLAGS := -I$(SRC)/tools/winebuild
$(B)/obj/tools/wrc/%.o: MODFLAGS := -DINCLUDEDIR='"/usr/include/wine"'
$(B)/obj/tools/widl/%.o: MODFLAGS := -DDEFAULT_INCLUDE_DIR='"/usr/include/wine/windows/"'

$(B)/obj/%.o: $(SRC)/%.c
	@mkdir -p $(@D)
	$(CC) $(CFLAGS) $(TOOLCPP) -I$(<D) $(MODFLAGS) -c $< -o $@

$(B)/obj/port/%.o: $(PORT)/%.c
	@mkdir -p $(@D)
	$(CC) $(CFLAGS) $(TOOLCPP) $(MODFLAGS) -c $< -o $@

$(B)/libwine_port.a: $(PORT_OBJS)
	rm -f $@ && ar rcs $@ $^
$(B)/libwpp.a: $(WPP_OBJS)
	rm -f $@ && ar rcs $@ $^
$(B)/libwine_unicode.a: $(UNICODE_OBJS)
	rm -f $@ && ar rcs $@ $^

tool_objs = $(patsubst %.c,$(B)/obj/tools/$(1)/%.o,$(notdir $(wildcard $(SRC)/tools/$(1)/*.c)))
TOOL_LIBS := $(B)/libwpp.a $(B)/libwine_unicode.a $(B)/libwine_port.a

$(T)/wrc: $(call tool_objs,wrc) $(TOOL_LIBS)
$(T)/widl: $(call tool_objs,widl) $(TOOL_LIBS)
$(T)/wmc: $(call tool_objs,wmc) $(TOOL_LIBS)
$(T)/winebuild: $(call tool_objs,winebuild) $(B)/obj/port/winebuild-dolly.o $(TOOL_LIBS)
$(T)/wrc $(T)/widl $(T)/wmc $(T)/winebuild:
	@mkdir -p $(@D)
	$(CC) $^ -o $@ -lm

tools: $(T)/wrc $(T)/widl $(T)/wmc $(T)/winebuild

# Every header widl generates, once: the .idl files that include/Makefile.in lists, in about ten seconds.
include $(SRC)/include/Makefile.in
IDL_FRAGMENTS := $(shell cd $(SRC)/include && grep -l "pragma makedep install" *.idl wine/*.idl)
IDL_HEADERS := $(patsubst %.idl,$(B)/include/%.h,$(filter-out $(IDL_FRAGMENTS),$(filter %.idl,$(SOURCES))))
$(B)/include/%.h: $(SRC)/include/%.idl $(T)/widl
	@mkdir -p $(@D)
	$(T)/widl -o $@ -I$(SRC)/include -I$(B)/include -D__WINESRC__ $<
headers: $(IDL_HEADERS)

# Modules, each built by module.mk from its own Makefile.in: Wine's, and the demo's own under $(PORT).
DLLS := ntdll kernel32 advapi32 gdi32 user32 version usp10 imm32 comctl32 comdlg32 shell32 shlwapi uxtheme winspool.drv msvcrt
OWN_DLLS := winedolly.drv
PROGRAMS := notepad winefile winemine
OWN_PROGRAMS := desktop hello mspaint netsurf x86emu
MODULES := $(DLLS:%=dlls/%) $(OWN_DLLS:%=dlls/%) $(PROGRAMS:%=programs/%) $(OWN_PROGRAMS:%=programs/%) server
export MODULE_FILE_winspool := winspool.drv
MODULE_ARGS_dlls/ntdll := PORT_SRCS=signal_wasm64.c
MODULE_ARGS_dlls/kernel32 := PORT_SRCS=kernel32-program.c
MODULE_ARGS_dlls/gdi32 := PORT_SRCS=freetype-symbols.c FREETYPE_CFLAGS="-I/usr/include/freetype2 -I$(PORT)/port" \
                          freetype_EXTRADEFS='-DWINE_FONT_DIR=\"fonts\"'
MODULE_ARGS_dlls/user32 := PORT_SRCS=user32-desktop.c
MODULE_ARGS_dlls/shell32 := PORT_SRCS=ole32-taskmem.c
MODULE_ARGS_server := ENTRY_RENAMES=-Dmain=wineserver_main \
                      MODDEFS="-include $(PORT)/port/server-cwd.h" PORT_SRCS=server-cwd.c \
                      main_EXTRADEFS=-Dmain_loop=wine_dolly_server_ready
# Of winecrt0 only what a statically linked module still calls.
MODULE_ARGS_dlls/winecrt0 := C_SRCS="exception.c register.c"
MODULE_ARGS_dlls/uuid :=
$(foreach module,$(OWN_DLLS:%=dlls/%) $(OWN_PROGRAMS:%=programs/%),$(eval MODULE_ARGS_$(module) := MODSRC=$(PORT)))
MODULE_LIBS := $(MODULES:%=$(B)/obj/%/module.a)
STATIC_LIBS := $(B)/obj/dlls/winecrt0/module.a $(B)/obj/dlls/uuid/module.a

$(MODULE_LIBS) $(STATIC_LIBS): $(B)/obj/%/module.a: headers tools FORCE
	$(MAKE) -f $(PORT)/module.mk SRC=$(SRC) PORT=$(PORT) B=$(B) MODDIR=$* LINKED="$(basename $(DLLS) $(OWN_DLLS))" $(MODULE_ARGS_$*)

# libwine, with Dolly's loader in place of loader.c and port.c.
LIBWINE_OBJS := $(addprefix $(B)/obj/libs/wine/,casemap.o collation.o config.o debug.o ldt.o mmap.o sortkey.o string.o wctype.o) \
                $(B)/obj/port/port/libwine.o
$(B)/obj/libs/wine/config.o: MODFLAGS := -DWINE_UNICODE_API="" -DBINDIR='"/usr/bin"' -DDLLDIR='"/usr/lib/wine"' \
    -DLIB_TO_BINDIR='"../bin"' -DLIB_TO_DLLDIR='"wine"' -DBIN_TO_DLLDIR='"../lib/wine"' -DBIN_TO_DATADIR='"../share/wine"'
$(B)/libwine.a: $(LIBWINE_OBJS)
	rm -f $@ && ar rcs $@ $^

# Every module whole: nothing calls a module's registration or most of its exports by name.
# (cc keeps linker options apart from its inputs, so the archives go inside the option.)
comma := ,
space := $(subst ,, )
LINK_INPUTS := $(MODULE_LIBS) $(STATIC_LIBS) $(B)/libwine.a $(B)/libwine_port.a $(B)/obj/port/port/main.o
# Win32 reads a pointer below 64 KiB as an integer (an ordinal, an atom, a resource identifier), so no
# data may live there: wasm-ld would start the data at 1024. The data starts at 64 MiB instead, which
# leaves the addresses below it free for an x86 program that must be loaded where it was linked (x86emu). The modules' images and resources are 25 MB of data,
# more than the memory cc starts a program with.
link = $(CC) -pthread -Wl,--global-base=67108864 -Wl,--initial-memory=134217728 -o $(1) $(B)/obj/port/port/main.o $(2) \
       -Wl,--whole-archive,$(subst $(space),$(comma),$(strip $(MODULE_LIBS))),--no-whole-archive \
       $(STATIC_LIBS) $(B)/libwine.a $(B)/libwine_port.a -lcurl -lfreetype -lpng16 -lz -lm -ldolly-sockets

# What the linked modules call in modules left out of the program (delay-loaded DLLs mostly): the first
# link names them, and each gets a stub that raises Wine's "unimplemented function" exception.
$(B)/missing.c: $(LINK_INPUTS) $(B)/calls.o
	-$(call link,$(B)/wine.unresolved,$(B)/calls.o -Wl$(comma)--error-limit=0) 2> $(B)/link.log
	rm -f $(B)/wine.unresolved
	(echo missing:; sed -n 's/.*undefined symbol: //p' $(B)/link.log | sort -u) > $(B)/wine.missing
	(echo aliases:; cat $(MODULE_LIBS:module.a=spec.c) 2>/dev/null | sed -n 's/^.. alias: \(.*\) ..$$/\1/p') > $(B)/wine.aliases
	$(T)/winebuild --dll -F missing.dll -o $@ $(MODULE_LIBS) $(B)/wine.missing $(B)/wine.aliases
$(B)/missing.o: $(B)/missing.c
	$(CC) $(CFLAGS) -c $< -o $@

# One call for each type an exported function has, for the x86 emulator, which reaches them by name.
$(B)/calls.c: $(MODULE_LIBS)
	(echo types:; cat $(MODULE_LIBS:module.a=spec.c) 2>/dev/null | sed -n 's/^.*. type: \([a-z:]*\) ..$$/\1/p' | grep -v '?' | sort -u) > $(B)/wine.types
	$(T)/winebuild --dll -F calls.dll -o $@ $(B)/wine.types
$(B)/calls.o: $(B)/calls.c
	$(CC) $(CFLAGS) -c $< -o $@

# The names more than one module defines, as the linker reports them, added to those known: what
# shared-names.txt must hold for this set of modules (the build fails on a duplicate symbol until it does).
shared-names: $(LINK_INPUTS)
	-$(call link,$(B)/wine.unresolved,-Wl$(comma)--error-limit=0) 2> $(B)/link.log
	(cat $(PORT)/shared-names.txt; awk '/duplicate symbol: /{name=$$NF} />>> defined in .*\/obj\/.*\/module\.a/{sub(/^.*\/obj\//,""); sub(/\/module\.a.*/,""); print $$0, name}' $(B)/link.log) | sort -u > $(B)/shared-names.txt
	wc -l $(B)/shared-names.txt

/usr/bin/wine: $(LINK_INPUTS) $(B)/missing.o $(B)/calls.o
	$(call link,$@,$(B)/missing.o $(B)/calls.o)

# Wine's own TrueType fonts, where gdi32 looks for them.
FONTS := $(patsubst $(SRC)/fonts/%,/usr/share/wine/fonts/%,$(wildcard $(SRC)/fonts/*.ttf))
/usr/share/wine/fonts/%: $(SRC)/fonts/%
	@mkdir -p $(@D)
	cp $< $@

FORCE:
fonts: $(FONTS)

# The Start menu's x86-64 program: TinyCC's example, built by TinyCC's own x86-64 compiler under x86emu.
$(X86)/hello_win.exe: /usr/bin/wine
	cd $(X86)/tcc && WINEPREFIX=$(B)/prefix wine x86emu 'Z:\usr\share\wine\x86\tcc\tcc.exe' -o ../hello_win.exe examples/hello_win.c
.PHONY: all tools headers fonts shared-names FORCE

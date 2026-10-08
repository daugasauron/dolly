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

all: $(B)/wine

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
DLLS := ntdll kernel32
PROGRAMS :=
OWN_PROGRAMS := hello
MODULES := $(DLLS:%=dlls/%) $(PROGRAMS:%=programs/%) $(OWN_PROGRAMS:%=programs/%) server
export MODULE_FILE_winspool := winspool.drv
MODULE_ARGS_dlls/ntdll := PORT_SRCS=signal_wasm64.c
# Names the server shares with a DLL, now that both are one program.
SERVER_RENAMES := main init_directories close_handle server_start_time get_thread_context set_thread_context
MODULE_ARGS_server := RENAMES="$(foreach name,$(SERVER_RENAMES),-D$(name)=wineserver_$(name))" \
                      MODDEFS="-include $(PORT)/port/server-cwd.h" PORT_SRCS=server-cwd.c \
                      main_EXTRADEFS=-Dmain_loop=wine_dolly_server_ready
# Of winecrt0 only what a statically linked module still calls.
MODULE_ARGS_dlls/winecrt0 := C_SRCS="exception.c register.c stub.c"
$(foreach program,$(OWN_PROGRAMS),$(eval MODULE_ARGS_programs/$(program) := MODSRC=$(PORT)))
MODULE_LIBS := $(MODULES:%=$(B)/obj/%/module.a)
CRT0 := $(B)/obj/dlls/winecrt0/module.a

$(MODULE_LIBS) $(CRT0): $(B)/obj/%/module.a: headers tools FORCE
	$(MAKE) -f $(PORT)/module.mk SRC=$(SRC) PORT=$(PORT) B=$(B) MODDIR=$* LINKED="$(DLLS)" $(MODULE_ARGS_$*)

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
$(B)/wine: $(MODULE_LIBS) $(CRT0) $(B)/libwine.a $(B)/libwine_port.a $(B)/obj/port/port/main.o
	$(CC) -pthread -o $@ $(B)/obj/port/port/main.o -Wl,--whole-archive,$(subst $(space),$(comma),$(strip $(MODULE_LIBS))),--no-whole-archive \
	  $(CRT0) $(B)/libwine.a $(B)/libwine_port.a -lm -ldolly-sockets

FORCE:
.PHONY: all tools headers FORCE

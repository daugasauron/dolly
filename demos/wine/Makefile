# SPDX-License-Identifier: MIT
# Wine's own libraries and programs built as one static wasm64 program:
# tools first, then the headers widl generates, then each module (module.mk).
SRC := /usr/src/wine
PORT := /usr/src/dolly/wine
B := /tmp/wine
T := $(B)/tools
CC := cc
CFLAGS := -O2 -fno-strict-aliasing -w
TOOLCPP := -I$(PORT) -I$(SRC)/include -D__WINESRC__

all: tools

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

.PHONY: all tools

# SPDX-License-Identifier: MIT
# One Wine module (MODDIR, its directory under MODSRC, the Wine tree unless it
# is one of the demo's own) for the static link: its own Makefile.in names the
# sources. Result: $(O)/module.a.
MODSRC ?= $(SRC)
include $(MODSRC)/$(MODDIR)/Makefile.in

NAME := $(or $(MODULE),$(STATICLIB),$(notdir $(MODDIR)))
O := $(B)/obj/$(MODDIR)
S := $(MODSRC)/$(MODDIR)
T := $(B)/tools
# The module's name as a C prefix; winebuild-dolly.c derives the same one.
PREFIX := $(subst -,_,$(subst .,_,$(NAME:.dll=)))
IS_EXE := $(filter %.exe,$(NAME))
IS_MODULE := $(filter-out %.a,$(MODULE))

# Every module is linked into one program, so the entry points each defines get its name.
RENAMES ?= $(if $(IS_EXE),-Dmain=$(PREFIX)_main -Dwmain=$(PREFIX)_wmain -DWinMain=$(PREFIX)_WinMain -DwWinMain=$(PREFIX)_wWinMain,\
           $(if $(IS_MODULE),-DDllMain=$(PREFIX)_DllMain))
CPPFLAGS := -I$(PORT) -I$(S) -I$(O) -I$(B)/include -I$(SRC)/include $(EXTRAINCL) -D__WINESRC__ $(EXTRADEFS) -D_REENTRANT $(RENAMES)
CFLAGS := -O2 -fno-strict-aliasing -pthread -w

# A GUI program has WinMain; winecrt0's main calls it.
CRT0 := $(if $(filter -mwindows,$(APPMODE)),$(if $(filter -municode,$(APPMODE)),exe_wmain,exe_main))
SRCS := $(filter-out $(EXCLUDE),$(C_SRCS))
# widl output for the module's own .idl files: a header, and the RPC client code of those marked for it.
IDL_HEADERS := $(IDL_SRCS:%.idl=$(O)/%.h)
IDL_CLIENTS := $(patsubst %.idl,$(O)/%_c.o,$(if $(IDL_SRCS),$(shell cd $(S) && grep -l "pragma makedep client" $(IDL_SRCS))))
OBJS := $(SRCS:%.c=$(O)/%.o) $(IDL_CLIENTS) $(CRT0:%=$(O)/crt0_%.o) $(PORT_SRCS:%.c=$(O)/port_%.o)
RES := $(RC_SRCS:%.rc=$(O)/%.res) $(MC_SRCS:%.mc=$(O)/%.res)
SPEC := $(wildcard $(S)/$(NAME:.dll=).spec)
IMPORT_NAMES := $(filter $(LINKED),$(IMPORTS) $(DELAYIMPORTS))

$(O)/module.a: $(OBJS) $(if $(IS_MODULE),$(O)/spec.o)
	rm -f $@ && ar rcs $@ $^

$(O)/%.o: $(S)/%.c
	@mkdir -p $(@D)
	cc $(CFLAGS) $(CPPFLAGS) $(MODDEFS) $($*_EXTRADEFS) -c $< -o $@

WIDL = $(T)/widl -o $@ -I$(S) -I$(O) -I$(B)/include -I$(SRC)/include -D__WINESRC__ $(EXTRADEFS) $<
$(O)/%.h: $(S)/%.idl
	@mkdir -p $(@D)
	$(WIDL)
$(O)/%_c.c: $(S)/%.idl
	@mkdir -p $(@D)
	$(WIDL)
$(O)/%_c.o: $(O)/%_c.c
	cc $(CFLAGS) $(CPPFLAGS) -c $< -o $@
$(OBJS): | $(IDL_HEADERS)

$(O)/port_%.o: $(PORT)/port/%.c
	@mkdir -p $(@D)
	cc $(CFLAGS) $(CPPFLAGS) -c $< -o $@

$(O)/crt0_%.o: $(SRC)/dlls/winecrt0/%.c
	@mkdir -p $(@D)
	cc $(CFLAGS) $(CPPFLAGS) -c $< -o $@

$(O)/%.res: $(S)/%.rc
	@mkdir -p $(@D)
	$(T)/wrc -o $@ -m64 --nostdinc -I$(S) -I$(O) -I$(B)/include -I$(SRC)/include $(EXTRAINCL) -D__WINESRC__ $(EXTRADEFS) $<

$(O)/%.res: $(S)/%.mc
	@mkdir -p $(@D)
	$(T)/wmc -U -O res -o $@ $<

# The module description: exports with the types the objects give them, resources, entry point.
$(O)/spec.c: $(OBJS) $(RES) $(SPEC)
	echo "imports: $(foreach import,$(IMPORT_NAMES),$(or $(MODULE_FILE_$(import)),$(import).dll))" > $(O)/module.imports
	$(T)/winebuild $(if $(IS_EXE),--exe,--dll) $(SPEC:%=-E %) -F $(NAME) \
	  $(if $(IS_EXE),--subsystem $(if $(filter -mwindows,$(APPMODE)),windows,console)) -o $@ $(OBJS) $(RES) $(O)/module.imports

$(O)/spec.o: $(O)/spec.c
	cc $(CFLAGS) -I$(PORT)/port -c $< -o $@

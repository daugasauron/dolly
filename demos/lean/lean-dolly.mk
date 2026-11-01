# Lean's build inside Dolly, as upstream's CMake does it (src/CMakeLists.txt,
# src/runtime/CMakeLists.txt, src/stdlib.make.in, src/lean.mk.in) for a
# platform that links every program statically: lean and lake are linked with
# a table of the symbols -rdynamic would export (lean-symbols.c), in which the
# interpreter finds compiled code. STAGE=0 builds the first lean from stage0/:
# upstream's copy of the C++ and the C its previous compiler emitted. STAGE=1
# has it compile the LIBRARIES named into /usr/lib/lean, beside those built
# before: a snapshot holds at most 2 GiB, so the release is built in parts.
.RECIPEPREFIX := >
SOURCE ?= /tmp/lean
STAGE ?= 0
OUT ?= $(SOURCE)/build/stage$(STAGE)
TOOLS ?= $(SOURCE)/build/tools
CPP := $(SOURCE)/$(if $(filter 0,$(STAGE)),stage0/src,src)
VERSION = $(shell sed -n 's/^set.LEAN_VERSION_$(1) \([0-9]*\) .*/\1/p' $(CPP)/CMakeLists.txt)
VERSION_STRING := $(call VERSION,MAJOR).$(call VERSION,MINOR).$(call VERSION,PATCH)

# What CMake computes for a Unix that is neither Linux nor Darwin, in a
# Release build without GMP, mimalloc or mmap: Lean's bignums are its own,
# Dolly's allocator serves, and Dolly's mmap copies the file, which reading
# it does with less memory. Threads get Emscripten's stack instead of 1 GiB:
# a thread's stack is in the process's own memory. -fstack-clash-protection is
# not given: Dolly's compiler has no stack probes and refuses it.
CXXFLAGS := -std=c++20 -O3 -DNDEBUG -DLEAN_MULTI_THREAD -ffp-contract=off -D__CLANG__ \
  '-DLEAN_BUILD_TYPE="Release"' -DLEAN_EXPORTING -fvisibility=hidden -fvisibility-inlines-hidden \
  '-DLEAN_DEFAULT_THREAD_STACK_SIZE=(8*1024*1024)' -pthread -I$(CPP) -I$(OUT) -I$(OUT)/include
LEANC_FLAGS := -ffp-contract=off -fdata-sections -ffunction-sections -fvisibility=hidden
LEAN_LINK_FLAGS := -Wl,--gc-sections -lm -pthread -luv
STATIC_LINK_FLAGS := -lleancpp -lLean -lStd -lInit -lleanrt -lc++
CFLAGS := -I$(OUT)/include -O3 -DNDEBUG $(LEANC_FLAGS) -DLEAN_EXPORTING -pthread

RUNTIME := debug thread mpz utf8 object apply exception interrupt memory stackinfo compact \
  init_module io hash byteslice platform alloc allocprof sharecommon stack_overflow process \
  object_ref mpn mutex libuv uv/net_addr uv/event_loop uv/timer uv/tcp uv/udp uv/dns uv/system \
  uv/signal openssl
UTIL := name name_set escaped ascii lbool init_module list_fn timeit timer name_generator kvmap \
  map_foreach options option_declarations
KERNEL := level expr expr_eq_fn for_each_fn replace_fn abstract instantiate local_ctx declaration \
  environment type_checker init_module expr_cache quot inductive trace
LIBRARY := expr_lt bin_app constants module dynlib num util print init_module profiling time_task \
  formatter elab_environment init_attribute llvm ir_interpreter instantiate_mvars
CONSTRUCTIONS := cases_on init_module util
LEANCPP := $(addprefix util/,$(UTIL)) $(addprefix kernel/,$(KERNEL)) $(addprefix library/,$(LIBRARY)) \
  $(addprefix library/constructions/,$(CONSTRUCTIONS)) initialize/init
cpp = $(addprefix $(OUT)/cpp/,$(addsuffix .o,$(1)))

HEADERS := $(addprefix $(OUT)/include/lean/,lean.h lean_gmp.h lean_libuv.h config.h version.h) \
  $(OUT)/githash.h
LIB := $(if $(filter 0,$(STAGE)),$(OUT)/lib/lean,/usr/lib/lean)
.DEFAULT_GOAL := $(if $(filter 0,$(STAGE)),$(OUT)/bin/lean,libraries)

$(OUT)/include/lean/%.h: $(CPP)/include/lean/%.h
> mkdir -p $(@D)
> cp $< $@
$(OUT)/include/lean/config.h: $(CPP)/config.h.in
> mkdir -p $(@D)
> sed -e 's|@LEAN_MIMALLOC@||' -e 's|@LEAN_IS_STAGE0@|#define LEAN_IS_STAGE0 $(if $(filter 0,$(STAGE)),1,0)|' $< > $@
$(OUT)/include/lean/version.h: $(CPP)/version.h.in
> mkdir -p $(@D)
> sed -e 's|@LEAN_VERSION_MAJOR@|$(call VERSION,MAJOR)|' -e 's|@LEAN_VERSION_MINOR@|$(call VERSION,MINOR)|' \
>   -e 's|@LEAN_VERSION_PATCH@|$(call VERSION,PATCH)|' -e 's|@LEAN_VERSION_IS_RELEASE@|$(call VERSION,IS_RELEASE)|' \
>   -e 's|@LEAN_SPECIAL_VERSION_DESC@||' -e 's|@LEAN_VERSION_STRING@|$(VERSION_STRING)|' \
>   -e "s|@LEAN_PLATFORM_TARGET@|$$(cc -dumpmachine)|" \
>   -e 's|@LEAN_MANUAL_ROOT@|https://lean-lang.org/doc/reference/$(VERSION_STRING)/|' $< > $@
# A tree without .git has no hash, as CMake finds then.
$(OUT)/githash.h: $(CPP)/githash.h.in
> mkdir -p $(@D)
> sed -e 's|@GIT_SHA1@|$(GITHASH)|' $< > $@
$(OUT)/util/ffi.cpp: $(CPP)/util/ffi.cpp
> mkdir -p $(@D)
> sed -e 's|@LEANC_EXTRA_CC_FLAGS@|$(LEANC_FLAGS)|' -e 's|@LEANC_INTERNAL_FLAGS@||' \
>   -e 's|@LEANC_STATIC_LINKER_FLAGS@|$(STATIC_LINK_FLAGS) -lLake -lLeanExport|' \
>   -e 's|@LEANC_SHARED_LINKER_FLAGS@|-lc++ -lLake_shared|' -e 's|@LEAN_EXTRA_LINKER_FLAGS@|$(LEAN_LINK_FLAGS)|' \
>   -e 's|@LEANC_INTERNAL_LINKER_FLAGS@||' $< > $@

$(OUT)/cpp/util/ffi.o: $(OUT)/util/ffi.cpp $(HEADERS)
> c++ $(CXXFLAGS) -c $< -o $@
$(OUT)/cpp/%.o: $(CPP)/%.cpp $(HEADERS)
> mkdir -p $(@D)
> c++ $(CXXFLAGS) -c $< -o $@

$(LIB)/libleanrt.a: $(call cpp,$(addprefix runtime/,$(RUNTIME)))
$(LIB)/libleancpp.a: $(call cpp,$(LEANCPP) util/ffi)
$(LIB)/libleanrt.a $(LIB)/libleancpp.a:
> mkdir -p $(@D)
> rm -f $@
> ar rcs $@ $^

ifeq ($(STAGE),0)
# The C of stage0's libraries, compiled as lean.mk does with leanc.
LIBRARIES := Init Std Lean
STDLIB := $(SOURCE)/stage0/stdlib
objects = $(patsubst $(STDLIB)/%.c,$(OUT)/ir/%.o,$(wildcard $(STDLIB)/$(1).c) $(shell find $(STDLIB)/$(1) -name '*.c'))
$(OUT)/ir/%.o: $(STDLIB)/%.c $(HEADERS)
> mkdir -p $(@D)
> cc $(CFLAGS) -c $< -o $@
else
# lean.mk's rules, with stage 0's lean: each module's .olean, .ilean and C,
# which is compiled at once and then removed. Lake's sources are in src/lake,
# and Leanc.lean is configured, as CMake does.
libraries: $(LIBRARIES:%=$(LIB)/lib%.a)
programs: $(OUT)/bin/lean $(OUT)/bin/lake $(OUT)/bin/leanc
LEAN ?= $(SOURCE)/build/stage0/bin/lean
LEAN_OPTS := -DwarningAsError=true -Dinterpreter.prefer_native=false -Dpp.rawOnError=true
TEMP := $(OUT)/temp
root = $(if $(filter Lake LakeMain,$(1)),$(SOURCE)/src/lake,$(if $(filter Leanc,$(1)),$(OUT)/leanc,$(SOURCE)/src))
sources = $(if $(filter Leanc,$(1)),$(OUT)/leanc/Leanc.lean,$(wildcard $(call root,$(1))/$(1).lean) \
  $(shell find $(call root,$(1))/$(1) -name '*.lean' 2>/dev/null))
objects = $(patsubst $(call root,$(1))/%.lean,$(TEMP)/%.o,$(call sources,$(1)))
MODULES := $(foreach library,$(LIBRARIES) $(if $(filter Lake,$(LIBRARIES)),LakeMain),$(patsubst $(call root,$(library))/%.lean,%,$(call sources,$(library))))
$(OUT)/leanc/Leanc.lean: $(SOURCE)/src/Leanc.lean
> mkdir -p $(@D)
> sed -e 's|@LEANC_CC@|cc|' $< > $@
define module
$(TEMP)/$(1).depend: $(2)/$(1).lean
> mkdir -p $$(@D) $(addprefix $(LIB)/,$(LIBRARIES))
> cd $(2) && echo "$(LIB)/$(1).olean: $$$$(LEAN_PATH=$(LIB) $(LEAN) --deps $(1).lean | tr '\n' ' ')" > $$@
$(LIB)/$(1).olean: $(2)/$(1).lean $(TEMP)/$(1).depend $(LEAN) $(HEADERS)
> mkdir -p $$(@D) $(dir $(TEMP)/$(1))
> cd $(2) && LEAN_PATH=$(LIB) $(LEAN) $(LEAN_OPTS) -o $$@ -i $(LIB)/$(1).ilean --c=$(TEMP)/$(1).c $(1).lean
> cc $(CFLAGS) -c $(TEMP)/$(1).c -o $(TEMP)/$(1).o
> rm $(TEMP)/$(1).c
$(TEMP)/$(1).o: $(LIB)/$(1).olean ;
endef
$(foreach m,$(MODULES),$(eval $(call module,$(m),$(call root,$(firstword $(subst /, ,$(m)))))))
include $(MODULES:%=$(TEMP)/%.depend)
endif

$(foreach library,$(LIBRARIES),$(eval $(LIB)/lib$(library).a: $(call objects,$(library))))
$(LIBRARIES:%=$(LIB)/lib%.a): $(HEADERS)
> mkdir -p $(@D)
> rm -f $@
> $(file >$(OUT)/$(@F).objects,$(filter %.o,$^))
> ar rcs $@ @$(OUT)/$(@F).objects
> $(if $(filter 1,$(STAGE)),xargs rm < $(OUT)/$(@F).objects)
> rm $(OUT)/$(@F).objects

$(TOOLS)/lean-symbols: $(SOURCE)/dolly/lean-symbols.c
> mkdir -p $(@D)
> cc -O2 $< -o $@
LEAN_LIBRARIES := $(addprefix $(LIB)/lib,$(addsuffix .a,leancpp Lean Std Init leanrt))
LAKE_LIBRARIES := $(addprefix $(LIB)/lib,$(addsuffix .a,Lake LeanExport)) $(LEAN_LIBRARIES)
$(OUT)/symbols/lean.c: $(TOOLS)/lean-symbols $(LEAN_LIBRARIES)
# lake's table leaves libLeanExport.a out: LeanExport.o is a program's (its
# main, which WebAssembly names __main_argc_argv), and the table's references
# would link it beside LakeMain's. lake links the members it calls; the
# interpreter runs any other's IR.
$(OUT)/symbols/lake.c: $(TOOLS)/lean-symbols $(LIB)/libLake.a $(LEAN_LIBRARIES)
$(OUT)/symbols/lean.c $(OUT)/symbols/lake.c:
> mkdir -p $(@D)
> $(TOOLS)/lean-symbols $(filter %.a,$^) > $@
$(OUT)/symbols/%.o: $(OUT)/symbols/%.c
> cc -O1 -fno-builtin -c $< -o $@
# lean and lake recurse deeper than a browser's stack holds (Lean gives these
# threads 1 GiB), so stack-wrap makes them continue on fresh stacks (stack@0).
LINK = c++ -o $@$(2) $(filter %.o,$^) -L$(LIB) $(1) $(STATIC_LINK_FLAGS) $(LEAN_LINK_FLAGS)
WRAP = stack-wrap $@.unwrapped -o $@ && rm $@.unwrapped
$(OUT)/bin/lean: $(call cpp,shell/lean util/shell) $(OUT)/symbols/lean.o $(LEAN_LIBRARIES)
> mkdir -p $(@D)
> $(call LINK,,.unwrapped)
> $(WRAP)
$(OUT)/bin/lake: $(TEMP)/LakeMain.o $(OUT)/symbols/lake.o $(LAKE_LIBRARIES)
> mkdir -p $(@D)
> $(call LINK,-lLake -lLeanExport,.unwrapped)
> $(WRAP)
$(OUT)/bin/leanc: $(LIB)/libLeanc.a $(LEAN_LIBRARIES)
> mkdir -p $(@D)
> $(call LINK,-lLeanc)

# Upstream's install of the programs, at Dolly's prefix; the libraries are
# in place.
install: programs
> mkdir -p /usr/bin /usr/include /usr/share/licenses/lean
> cp $(OUT)/bin/lean $(OUT)/bin/lake $(OUT)/bin/leanc /usr/bin/
> cp -R $(OUT)/include/lean /usr/include/
> cp $(SOURCE)/LICENSE /usr/share/licenses/lean/LICENSE

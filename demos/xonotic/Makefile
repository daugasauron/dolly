# SPDX-License-Identifier: GPL-2.0-or-later
# The Xonotic dedicated server (DarkPlaces' OBJ_SV: null video, thread and
# sound units) and gmqcc, built inside Dolly.
CC := cc
CXX := c++
SOURCE := /usr/src/xonotic
PORT := /usr/src/dolly/xonotic
BUILD := /tmp/xonotic/build
ENGINE := $(SOURCE)/darkplaces

SERVER_UNITS := sys_linux vid_null thread_null snd_null \
  bih crypto cl_collision cl_demo cl_dyntexture cl_input cl_main cl_parse cl_particles cl_screen cl_video \
  clvm_cmds cmd collision common console csprogs curves cvar dpsoftrast dpvsimpledecode filematch fractalnoise \
  fs ft2 utf8lib gl_backend gl_draw gl_rmain gl_rsurf gl_textures hmac host host_cmd image image_png jpeg keys \
  lhnet libcurl mathlib matrixlib mdfour meshqueue mod_skeletal_animatevertices_sse \
  mod_skeletal_animatevertices_generic model_alias model_brush model_shared model_sprite netconn palette polygon \
  portals protocol prvm_cmds prvm_edict prvm_exec r_explosion r_lerpanim r_lightning r_modules r_shadow r_sky \
  r_sprites sbar sv_demo sv_main sv_move sv_phys sv_user svbsp svvm_cmds sys_shared vid_shared view wad world zone
SERVER_OBJECTS := $(patsubst %,$(BUILD)/engine/%.o,$(SERVER_UNITS))
# OBJ_SDL with the null thread, sound and CD units: the sdl2 package has no
# audio or threads. The software rasterizer draws until RENDERPATH_DOLLY exists.
# The client threads its software rasterizer (vid_soft_threads) through the
# engine's pthread unit over threads@0; the sdl2 package itself has no threads.
CLIENT_UNITS := sys_sdl vid_sdl menu mvm_cmds cd_shared cd_null thread_pthread $(filter-out sys_linux vid_null thread_null,$(SERVER_UNITS))
CLIENT_OBJECTS := $(patsubst %,$(BUILD)/client/%.o,$(CLIENT_UNITS))
# makefile.inc's CFLAGS_COMMON at -O1 (Dolly's cc takes no -fno-math-errno or
# -fno-trapping-math), zlib linked statically since there is no dlopen.
CFLAGS := -O1 -fno-strict-aliasing -D_FILE_OFFSET_BITS=64 -D__KERNEL_STRICT_NAMES -DLINK_TO_ZLIB -I$(SOURCE)
# SSE_PRESENT and SSE2_PRESENT make quakedef.h take the x86 SSE2 paths
# (Sys_HaveSSE2 answers yes without cpuid, vid_soft is registered); the two
# units with intrinsics compile as Wasm SIMD through simd-unit.c.
# No dlopen: libjpeg (built here from IJG's sources) and FreeType (the
# zero-ad-deps package) are linked, as upstream's Android build links them.
CLIENT_CFLAGS := $(CFLAGS) -pthread -DCONFIG_MENU -DCONFIG_CD -DSSE_PRESENT -DSSE2_PRESENT -I/usr/include/SDL2 \
  -DLINK_TO_LIBJPEG -I$(SOURCE)/jpeg -DDP_FREETYPE_STATIC -I/usr/include/freetype2
SIMD_UNITS := dpsoftrast mod_skeletal_animatevertices_sse
JPEG := $(SOURCE)/jpeg
JPEG_UNITS := jaricom jcapimin jcapistd jcarith jccoefct jccolor jcdctmgr jchuff jcinit jcmainct jcmarker jcmaster \
  jcomapi jcparam jcprepct jcsample jctrans jdapimin jdapistd jdarith jdatadst jdatasrc jdcoefct jdcolor jddctmgr \
  jdhuff jdinput jdmainct jdmarker jdmaster jdmerge jdpostct jdsample jdtrans jerror jfdctflt jfdctfst jfdctint \
  jidctflt jidctfst jidctint jquant1 jquant2 jutils jmemmgr jmemnobs
JPEG_OBJECTS := $(patsubst %,$(BUILD)/jpeg/%.o,$(JPEG_UNITS))

GMQCC_UNITS := ast code conout fold ftepp intrin ir lexer main opts parser stat utf8 util
GMQCC_OBJECTS := $(patsubst %,$(BUILD)/gmqcc/%.o,$(GMQCC_UNITS))

all: /usr/bin/xonotic-dedicated /usr/bin/xonotic-sdl /usr/bin/gmqcc

# builddate.c is compiled at link time, as upstream does, for the version banner.
/usr/bin/xonotic-dedicated: $(SERVER_OBJECTS) $(ENGINE)/builddate.c
	$(CC) $(CFLAGS) -DSVNREVISION=xonotic-v0.8.6 -DBUILDTYPE=release $(SERVER_OBJECTS) $(ENGINE)/builddate.c -o $@ -lz -lm \
	  -Wl,--initial-memory=67108864

/usr/bin/xonotic-sdl: $(CLIENT_OBJECTS) $(BUILD)/libjpeg.a $(ENGINE)/builddate.c
	$(CC) $(CLIENT_CFLAGS) -DSVNREVISION=xonotic-v0.8.6 -DBUILDTYPE=release $(CLIENT_OBJECTS) $(ENGINE)/builddate.c -o $@ \
	  $(BUILD)/libjpeg.a -lfreetype -lpng16 -lSDL2 -lz -lm -Wl,--initial-memory=134217728

# IJG's jconfig.txt is the generic configuration (makefile.ansi); jmemnobs.c is its memory manager.
$(JPEG)/jconfig.h: $(JPEG)/jconfig.txt
	cp $< $@

$(BUILD)/jpeg/%.o: $(JPEG)/%.c $(JPEG)/jconfig.h
	mkdir -p $(@D)
	$(CC) -O1 -I$(JPEG) -c $< -o $@

$(BUILD)/libjpeg.a: $(JPEG_OBJECTS)
	ar rcs $@ $^

$(BUILD)/client/jpeg.o: $(JPEG)/jconfig.h

$(BUILD)/engine/%.o: $(ENGINE)/%.c
	mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

$(patsubst %,$(BUILD)/client/%.o,$(SIMD_UNITS)): $(BUILD)/client/%.o: $(ENGINE)/%.c $(PORT)/simd-unit.c
	mkdir -p $(@D)
	$(CC) $(CLIENT_CFLAGS) -D__SSE__ -D__SSE2__ -DDOLLY_XONOTIC_TRANSLATION_UNIT='"$<"' -c $(PORT)/simd-unit.c -o $@

$(BUILD)/client/%.o: $(ENGINE)/%.c
	mkdir -p $(@D)
	$(CC) $(CLIENT_CFLAGS) -c $< -o $@

/usr/bin/gmqcc: $(GMQCC_OBJECTS)
	$(CXX) $(GMQCC_OBJECTS) -o $@

$(BUILD)/gmqcc/%.o: $(SOURCE)/gmqcc/%.cpp
	mkdir -p $(@D)
	$(CXX) -O1 -std=c++11 -c $< -o $@

# The game logic as qcsrc/Makefile and tools/qcc.sh build it: cc preprocesses
# each progs.inc, the line markers become gmqcc pragmas, gmqcc compiles the
# result. The watermark is the release tag, so the output equals the shipped .dat.
QCSRC := $(SOURCE)/qcsrc
QC := $(BUILD)/qc
QCCDEFS := -DGMQCC -DXONOTIC=1 -DWATERMARK='"xonotic-v0.8.6"' -DNDEBUG=1 \
  -DENABLE_EFFECTINFO=0 -DENABLE_DEBUGDRAW=0 -DENABLE_DEBUGTRACE=0
QCCFLAGS := -std=gmqcc -Ooverlap-locals -O3 -Werror -Wall -Wno-field-redeclared -flno -futf8 \
  -fno-bail-on-werror -frelaxed-switch -freturn-assignments
QC_PROGRAMS := $(QC)/progs.dat $(QC)/csprogs.dat $(QC)/menu.dat
$(QC)/progs.dat: QCMODE := server
$(QC)/progs.dat: QCDEFS := -DGAMEQC -DSVQC
$(QC)/csprogs.dat: QCMODE := client
$(QC)/csprogs.dat: QCDEFS := -DGAMEQC -DCSQC
$(QC)/menu.dat: QCMODE := menu
$(QC)/menu.dat: QCDEFS := -DMENUQC

qc: $(QC_PROGRAMS)

$(QC_PROGRAMS): /usr/bin/gmqcc
	mkdir -p $(QC)
	cd $(QCSRC) && $(CC) -xc -E -I. $(QCCDEFS) $(QCDEFS) -Wall -Wundef -Werror $(QCMODE)/progs.inc -o $(QC)/$(QCMODE).txt
	awk '{ if (match($$0, /^#(line)? [0-9]+ "[^"]*"/)) { split($$0, a, /[ "]+/); print ""; print "#pragma file(" a[3] ")"; print "#pragma line(" a[2] ")" } else print }' $(QC)/$(QCMODE).txt > $(QC)/$(QCMODE).qc
	cd $(QCSRC) && gmqcc $(QCCFLAGS) -o $@ $(QC)/$(QCMODE).qc

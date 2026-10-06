# SPDX-License-Identifier: GPL-2.0-or-later
# The Xonotic dedicated server (DarkPlaces' OBJ_SV: null video, thread and
# sound units) and gmqcc, built inside Dolly.
CC := cc
CXX := c++
SOURCE := /usr/src/xonotic
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
# makefile.inc's CFLAGS_COMMON at -O1 (Dolly's cc takes no -fno-math-errno or
# -fno-trapping-math), zlib linked statically since there is no dlopen.
CFLAGS := -O1 -fno-strict-aliasing -D_FILE_OFFSET_BITS=64 -D__KERNEL_STRICT_NAMES -DLINK_TO_ZLIB -I$(SOURCE)

GMQCC_UNITS := ast code conout fold ftepp intrin ir lexer main opts parser stat utf8 util
GMQCC_OBJECTS := $(patsubst %,$(BUILD)/gmqcc/%.o,$(GMQCC_UNITS))

all: /usr/bin/xonotic-dedicated /usr/bin/gmqcc

# builddate.c is compiled at link time, as upstream does, for the version banner.
/usr/bin/xonotic-dedicated: $(SERVER_OBJECTS) $(ENGINE)/builddate.c
	$(CC) $(CFLAGS) -DSVNREVISION=xonotic-v0.8.6 -DBUILDTYPE=release $(SERVER_OBJECTS) $(ENGINE)/builddate.c -o $@ -lz -lm \
	  -Wl,--initial-memory=67108864

$(BUILD)/engine/%.o: $(ENGINE)/%.c
	mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

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
QCCDEFS := -DGMQCC -DXONOTIC=1 -DWATERMARK=\"xonotic-v0.8.6\" -DNDEBUG=1 \
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

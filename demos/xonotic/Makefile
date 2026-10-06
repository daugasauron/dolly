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
SERVER_OBJECTS := $(patsubst %,$(BUILD)/engine/%.o,$(SERVER_UNITS)) $(BUILD)/port/sockets.o
# makefile.inc's CFLAGS_COMMON and OPTIM_RELEASE at -O1, zlib linked statically (no dlopen).
CFLAGS := -O1 -fno-strict-aliasing -fno-math-errno -fno-trapping-math \
  -D_FILE_OFFSET_BITS=64 -D__KERNEL_STRICT_NAMES -DLINK_TO_ZLIB -I$(SOURCE)

GMQCC_UNITS := ast code conout fold ftepp intrin ir lexer main opts parser stat utf8 util
GMQCC_OBJECTS := $(patsubst %,$(BUILD)/gmqcc/%.o,$(GMQCC_UNITS))

all: /usr/bin/xonotic-dedicated /usr/bin/gmqcc

# builddate.c is compiled at link time, as upstream does, for the version banner.
/usr/bin/xonotic-dedicated: $(SERVER_OBJECTS) $(ENGINE)/builddate.c
	$(CC) $(CFLAGS) -DSVNREVISION=xonotic-v0.8.6 -DBUILDTYPE=release $(SERVER_OBJECTS) $(ENGINE)/builddate.c -o $@ -lz -lm

$(BUILD)/engine/%.o: $(ENGINE)/%.c
	mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/port/%.o: $(PORT)/%.c
	mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

/usr/bin/gmqcc: $(GMQCC_OBJECTS)
	$(CXX) $(GMQCC_OBJECTS) -o $@

$(BUILD)/gmqcc/%.o: $(SOURCE)/gmqcc/%.cpp
	mkdir -p $(@D)
	$(CXX) -O1 -std=c++11 -fno-exceptions -fno-rtti -c $< -o $@

# SPDX-License-Identifier: GPL-2.0-or-later
# The Xonotic dedicated server (DarkPlaces' OBJ_SV: null video, thread and
# sound units), built inside Dolly; gmqcc, from its package, compiles the game logic.
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
# OBJ_SDL with the null thread and CD units (the sdl2 package starts no threads)
# and its sound units over SDL's audio. The engine's software render path draws
# through dpgpurast.c on gpu@0, or through the software rasterizer, renamed
# dpsoft_*, where gpu@0 gives no device.
CLIENT_UNITS := sys_sdl vid_sdl menu mvm_cmds cd_shared cd_null snd_main snd_mem snd_mix snd_ogg snd_wav snd_sdl \
  $(filter-out sys_linux vid_null snd_null,$(SERVER_UNITS))
CLIENT_OBJECTS := $(patsubst %,$(BUILD)/client/%.o,$(CLIENT_UNITS)) $(BUILD)/client/dpgpurast.o
DPSOFTRAST_CALLS := Init Shutdown Flush Finish Texture_New Texture_Free Texture_UpdatePartial Texture_UpdateFull \
  Texture_GetWidth Texture_GetHeight Texture_GetDepth Texture_GetPixelPointer Texture_Filter SetRenderTargets Viewport \
  ClearColor ClearDepth ColorMask DepthTest ScissorTest Scissor ClipPlane BlendFunc BlendSubtract DepthMask DepthFunc \
  DepthRange PolygonOffset CullFace Color4f GetPixelsBGRA CopyRectangleToTexture SetTexture SetVertexPointer \
  SetColorPointer SetColorPointer4ub SetTexCoordPointer SetShader Uniform4f Uniform4fv UniformMatrix4fv Uniform1i \
  DrawTriangles
# makefile.inc's CFLAGS_COMMON at -O1 (Dolly's cc takes no -fno-math-errno or
# -fno-trapping-math), zlib linked statically since there is no dlopen.
CFLAGS := -O1 -fno-strict-aliasing -D_FILE_OFFSET_BITS=64 -D__KERNEL_STRICT_NAMES -DLINK_TO_ZLIB -I$(SOURCE)
# SSE_PRESENT and SSE2_PRESENT make quakedef.h take the x86 SSE2 paths
# (Sys_HaveSSE2 answers yes without cpuid, vid_soft is registered); the two
# units with intrinsics compile as Wasm SIMD through simd-unit.c.
# No dlopen: libjpeg, FreeType and Vorbis, from their packages, are linked, as
# upstream's Android build links them.
CLIENT_CFLAGS := $(CFLAGS) -DCONFIG_MENU -DCONFIG_CD -DSSE_PRESENT -DSSE2_PRESENT -I/usr/include/SDL2 \
  -DLINK_TO_LIBJPEG -DDP_FREETYPE_STATIC -I/usr/include/freetype2 -DLINK_TO_LIBVORBIS
SIMD_UNITS := dpsoftrast mod_skeletal_animatevertices_sse

all: /usr/bin/xonotic-dedicated /usr/bin/xonotic-sdl

# builddate.c is compiled at link time, as upstream does, for the version banner.
/usr/bin/xonotic-dedicated: $(SERVER_OBJECTS) $(ENGINE)/builddate.c
	$(CC) $(CFLAGS) -DSVNREVISION=xonotic-v0.8.6 -DBUILDTYPE=release $(SERVER_OBJECTS) $(ENGINE)/builddate.c -o $@ -lz -lm \
	  -Wl,--initial-memory=67108864

/usr/bin/xonotic-sdl: $(CLIENT_OBJECTS) $(ENGINE)/builddate.c
	$(CC) $(CLIENT_CFLAGS) -DSVNREVISION=xonotic-v0.8.6 -DBUILDTYPE=release $(CLIENT_OBJECTS) $(ENGINE)/builddate.c -o $@ \
	  -ljpeg -lfreetype -lpng16 -lvorbisfile -lvorbis -logg -lSDL2 -lz -lm -Wl,--initial-memory=134217728

$(BUILD)/engine/%.o: $(ENGINE)/%.c
	mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

$(patsubst %,$(BUILD)/client/%.o,$(SIMD_UNITS)): $(BUILD)/client/%.o: $(ENGINE)/%.c $(PORT)/simd-unit.c
	mkdir -p $(@D)
	$(CC) $(CLIENT_CFLAGS) -D__SSE__ -D__SSE2__ -DDOLLY_XONOTIC_TRANSLATION_UNIT='"$<"' -c $(PORT)/simd-unit.c -o $@

$(BUILD)/client/dpsoftrast.o: CLIENT_CFLAGS += $(foreach call,$(DPSOFTRAST_CALLS),-DDPSOFTRAST_$(call)=dpsoft_$(call))

$(BUILD)/client/%.o: $(ENGINE)/%.c
	mkdir -p $(@D)
	$(CC) $(CLIENT_CFLAGS) -c $< -o $@

$(BUILD)/client/dpgpurast.o: $(PORT)/dpgpurast.c
	mkdir -p $(@D)
	$(CC) $(CLIENT_CFLAGS) -I$(ENGINE) -c $< -o $@

# The shader permutations the normal preset draws with (MODE:PERMUTATION, as
# dpgpurast.c logs each with developer 1), rewritten by dpshaders, translated
# by naga. Measured on stormkeep (the timedemo and a match), afterslime and
# glowplant: for the lit modes 7, 11 and 12, every combination of the bits
# they used there (diffuse 1, colormapping 8, glow 2048, specular 8192,
# alpha kill 4194304, reflectcube 8388608). And 0:8388621, the generic mode
# with the texture's alpha suppressed, which draws a copy of the frame (the
# loading screen's backdrop, bloom); for the postprocess mode 1, every
# combination of view tint 4, bloom 4096 and the HUD's postprocessing 16384
# (bloom asked for 4096, with the HUD's blur 20480).
LIGHTING_PERMUTATIONS := $(shell awk 'BEGIN { split("1 8 2048 8192 4194304 8388608", bit, " "); \
  for (set = 0; set < 64; set++) { p = 0; for (i = 0; i < 6; i++) if (int(set / 2 ^ i) % 2) p += bit[i + 1]; printf "%d ", p } }')
SHADER_PAIRS := 0:0 0:1 0:4 0:12 0:13 0:8388621 1:0 1:4 1:4096 1:4100 1:16384 1:16388 1:20480 1:20484 2:0 4:0 4:2048 4:4194304 13:0 \
  $(foreach mode,7 11 12,$(foreach permutation,$(LIGHTING_PERMUTATIONS),$(mode):$(permutation)))
SHADERS := /usr/share/xonotic/shaders
GLSL := $(BUILD)/glsl
SHADER_NAMES := $(subst :,-,$(SHADER_PAIRS))

shaders: $(foreach name,$(SHADER_NAMES),$(SHADERS)/$(name).vert.wgsl $(SHADERS)/$(name).frag.wgsl $(SHADERS)/$(name).uniforms)

$(BUILD)/dpshaders: $(PORT)/dpshaders.c
	mkdir -p $(@D)
	$(CC) -O1 -I$(ENGINE) $< -o $@

$(GLSL)/%.vert $(GLSL)/%.frag $(GLSL)/%.uniforms: $(BUILD)/dpshaders
	mkdir -p $(GLSL)
	$(BUILD)/dpshaders $(ENGINE) $(GLSL) $(subst -,:,$*)

$(SHADERS)/%.vert.wgsl: $(GLSL)/%.vert
	mkdir -p $(@D)
	naga --input-kind glsl --shader-stage vert --compact $< $@

$(SHADERS)/%.frag.wgsl: $(GLSL)/%.frag
	mkdir -p $(@D)
	naga --input-kind glsl --shader-stage frag --compact $< $@

$(SHADERS)/%.uniforms: $(GLSL)/%.uniforms
	mkdir -p $(@D)
	cp $< $@

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

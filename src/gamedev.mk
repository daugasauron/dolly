CC := cc
AR := ar
RAYLIB_SOURCE := /usr/src/raylib/src
RAYLIB_MODULES := rcore rshapes rtextures rtext rmodels
RAYLIB_OBJECTS := $(patsubst %,/usr/src/raylib/build/%.o,$(RAYLIB_MODULES))
BOX3D_SOURCE := /usr/src/box3d/src
BOX3D_SOURCES := $(filter-out $(BOX3D_SOURCE)/timer.c,$(wildcard $(BOX3D_SOURCE)/*.c))
BOX3D_OBJECTS := $(patsubst $(BOX3D_SOURCE)/%.c,/usr/src/box3d/build/%.o,$(BOX3D_SOURCES))
MATH_COMPAT_OBJECT := /usr/src/dolly/gamedev/build/math-compat.o

.PHONY: all

all: /usr/lib/libm.a /usr/lib/libraylib.a /usr/lib/libbox3d.a /usr/lib/libdolly-raylib.a /usr/bin/graphics-demo

/usr/src/raylib/build/%.o: $(RAYLIB_SOURCE)/%.c
	mkdir -p /usr/src/raylib/build
	$(CC) -std=gnu99 -O2 -D_GNU_SOURCE -DPLATFORM_MEMORY -DGRAPHICS_API_OPENGL_SOFTWARE -DSUPPORT_CUSTOM_FRAME_CONTROL=1 -DSW_FRAMEBUFFER_OUTPUT_BGRA=0 -fno-strict-aliasing -fno-builtin -I $(RAYLIB_SOURCE) -c $< -o $@

# rtext.c triggers the embedded LLVM backend's current high-optimization
# memory/trap limit. Text layout is not the software 3D render hot path, so
# keep this one upstream translation unit at the reliable bootstrap level.
/usr/src/raylib/build/rtext.o: $(RAYLIB_SOURCE)/rtext.c
	mkdir -p /usr/src/raylib/build
	$(CC) -std=gnu99 -O0 -D_GNU_SOURCE -DPLATFORM_MEMORY -DGRAPHICS_API_OPENGL_SOFTWARE -DSUPPORT_CUSTOM_FRAME_CONTROL=1 -DSW_FRAMEBUFFER_OUTPUT_BGRA=0 -fno-strict-aliasing -fno-builtin -I $(RAYLIB_SOURCE) -c $< -o $@

/usr/lib/libraylib.a: $(RAYLIB_OBJECTS)
	$(AR) rcs $@ $(RAYLIB_OBJECTS)
	cp $(RAYLIB_SOURCE)/raylib.h /usr/include/raylib.h
	cp $(RAYLIB_SOURCE)/raymath.h /usr/include/raymath.h
	cp $(RAYLIB_SOURCE)/rlgl.h /usr/include/rlgl.h

/usr/src/box3d/build/%.o: $(BOX3D_SOURCE)/%.c
	mkdir -p /usr/src/box3d/build
	$(CC) -std=gnu17 -O2 -fno-builtin -U__SIZEOF_INT128__ -DBOX3D_DISABLE_SIMD -I /usr/src/box3d/include -I $(BOX3D_SOURCE) -c $< -o $@

/usr/src/box3d/build/platform.o: /usr/src/dolly/gamedev/box3d-platform.c
	mkdir -p /usr/src/box3d/build
	$(CC) -std=gnu17 -O2 -fno-builtin -U__SIZEOF_INT128__ -DBOX3D_DISABLE_SIMD -I /usr/src/box3d/include -I $(BOX3D_SOURCE) -c $< -o $@

/usr/lib/libbox3d.a: $(BOX3D_OBJECTS) /usr/src/box3d/build/platform.o
	$(AR) rcs $@ $^
	mkdir -p /usr/include/box3d
	cp /usr/src/box3d/include/box3d/*.h /usr/include/box3d

$(MATH_COMPAT_OBJECT): /usr/src/dolly/gamedev/math-compat.c
	mkdir -p /usr/src/dolly/gamedev/build
	$(CC) -std=c17 -O2 -fno-builtin -fno-sanitize-coverage -c $< -o $@

/usr/lib/libm.a: $(MATH_COMPAT_OBJECT)
	$(AR) rcs $@ $^

/usr/lib/libdolly-raylib.a: /usr/src/dolly/gamedev/dolly-raylib.c /usr/src/dolly/gamedev/dolly-raylib.h /usr/lib/libraylib.a
	mkdir -p /usr/include/dolly /usr/src/dolly/gamedev/build
	cp /usr/src/dolly/gamedev/dolly-raylib.h /usr/include/dolly/raylib.h
	$(CC) -std=c17 -O2 -fno-builtin -I /usr/src/dolly/gamedev -c /usr/src/dolly/gamedev/dolly-raylib.c -o /usr/src/dolly/gamedev/build/dolly-raylib.o
	$(AR) rcs $@ /usr/src/dolly/gamedev/build/dolly-raylib.o

/usr/bin/graphics-demo: /usr/src/dolly/gamedev/graphics-demo.c /usr/lib/libdolly-raylib.a /usr/lib/libraylib.a /usr/lib/libbox3d.a /usr/lib/libm.a
	$(CC) -std=c17 -O2 -fno-builtin $< -o $@ -ldolly-raylib -lraylib -lbox3d -lm

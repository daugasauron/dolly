CC := cc
AR := ar
RAYLIB_SOURCE := /usr/src/raylib/src
RAYLIB_MODULES := rcore rshapes rtextures rtext rmodels
RAYLIB_OBJECTS := $(patsubst %,/usr/src/raylib/build/%.o,$(RAYLIB_MODULES))
BOX2D_SOURCE := /usr/src/box2d/src
BOX2D_SOURCES := $(wildcard $(BOX2D_SOURCE)/*.c)
BOX2D_OBJECTS := $(patsubst $(BOX2D_SOURCE)/%.c,/usr/src/box2d/build/%.o,$(BOX2D_SOURCES))

.PHONY: all

all: /usr/lib/libraylib.a /usr/lib/libbox2d.a /usr/lib/libdolly-raylib.a /usr/bin/graphics-demo

/usr/src/raylib/build/%.o: $(RAYLIB_SOURCE)/%.c
	mkdir -p /usr/src/raylib/build
	$(CC) -std=gnu99 -O2 -D_GNU_SOURCE -DPLATFORM_MEMORY -DGRAPHICS_API_OPENGL_SOFTWARE -fno-strict-aliasing -I $(RAYLIB_SOURCE) -c $< -o $@

/usr/lib/libraylib.a: $(RAYLIB_OBJECTS)
	$(AR) rcs $@ $(RAYLIB_OBJECTS)
	cp $(RAYLIB_SOURCE)/raylib.h /usr/include/raylib.h
	cp $(RAYLIB_SOURCE)/raymath.h /usr/include/raymath.h
	cp $(RAYLIB_SOURCE)/rlgl.h /usr/include/rlgl.h

/usr/src/box2d/build/%.o: $(BOX2D_SOURCE)/%.c
	mkdir -p /usr/src/box2d/build
	$(CC) -std=gnu17 -O2 -DBOX2D_DISABLE_SIMD -I /usr/src/box2d/include -I $(BOX2D_SOURCE) -c $< -o $@

/usr/lib/libbox2d.a: $(BOX2D_OBJECTS)
	$(AR) rcs $@ $(BOX2D_OBJECTS)
	mkdir -p /usr/include/box2d
	cp /usr/src/box2d/include/box2d/base.h /usr/include/box2d/base.h
	cp /usr/src/box2d/include/box2d/box2d.h /usr/include/box2d/box2d.h
	cp /usr/src/box2d/include/box2d/collision.h /usr/include/box2d/collision.h
	cp /usr/src/box2d/include/box2d/id.h /usr/include/box2d/id.h
	cp /usr/src/box2d/include/box2d/math_functions.h /usr/include/box2d/math_functions.h
	cp /usr/src/box2d/include/box2d/types.h /usr/include/box2d/types.h

/usr/lib/libdolly-raylib.a: /usr/src/dolly/gamedev/dolly-raylib.c /usr/src/dolly/gamedev/dolly-raylib.h /usr/lib/libraylib.a
	mkdir -p /usr/include/dolly /usr/src/dolly/gamedev/build
	cp /usr/src/dolly/gamedev/dolly-raylib.h /usr/include/dolly/raylib.h
	$(CC) -std=c17 -O2 -I /usr/src/dolly/gamedev -c /usr/src/dolly/gamedev/dolly-raylib.c -o /usr/src/dolly/gamedev/build/dolly-raylib.o
	$(AR) rcs $@ /usr/src/dolly/gamedev/build/dolly-raylib.o

/usr/bin/graphics-demo: /usr/src/dolly/gamedev/graphics-demo.c /usr/lib/libdolly-raylib.a /usr/lib/libraylib.a /usr/lib/libbox2d.a
	$(CC) -std=c17 -O2 $< -o $@ -ldolly-raylib -lraylib -lbox2d

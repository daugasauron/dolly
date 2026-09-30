# SPDX-License-Identifier: MIT
CC := cc
SOURCE := /usr/src/classicube
PORT := /usr/src/dolly/classicube
BUILD := /tmp/classicube/build
SOURCES := $(filter-out $(SOURCE)/src/Platform_Posix.c $(SOURCE)/src/Logger.c $(SOURCE)/src/Window_SDL2.c $(SOURCE)/src/Http_Worker.c,$(wildcard $(SOURCE)/src/*.c))
OBJECTS := $(patsubst $(SOURCE)/src/%.c,$(BUILD)/%.o,$(SOURCES)) \
           $(BUILD)/port/platform.o $(BUILD)/port/logger.o $(BUILD)/port/window.o $(BUILD)/port/input.o $(BUILD)/port/http.o
# Keep target macros: the bootstrap libc stat layout depends on __EMSCRIPTEN__.
CFLAGS := -O2 -D_BSD_SOURCE -D_POSIX_C_SOURCE=200809L -fno-strict-aliasing -I$(SOURCE)/src \
          -I/usr/include/SDL2 -include $(PORT)/config.h

/usr/bin/classicube: $(OBJECTS)
	$(CC) $(OBJECTS) -o $@ -lSDL2 -lm

$(BUILD)/port/%.o: $(PORT)/%.c
	mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD)/%.o: $(SOURCE)/src/%.c
	mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

SOURCE := /usr/src/box3d/src
BUILD := /tmp/blockwalker-box3d
SOURCES := $(filter-out $(SOURCE)/timer.c,$(wildcard $(SOURCE)/*.c))
OBJECTS := $(patsubst $(SOURCE)/%.c,$(BUILD)/%.o,$(SOURCES))
FLAGS := -std=gnu17 -O2 -fno-builtin -U__SIZEOF_INT128__ -D__SSE__ -D__SSE2__ -I /usr/src/box3d/include -I $(SOURCE)
WRAPPER := /usr/src/dolly/blockwalker/box3d-simd.c

.PHONY: all
all: /usr/lib/libblockwalker-box3d.a

$(BUILD)/%.o: $(SOURCE)/%.c
	mkdir -p $(BUILD)
	cc $(FLAGS) '-DDOLLY_BOX3D_TRANSLATION_UNIT="$<"' -c $(WRAPPER) -o $@

$(BUILD)/platform.o: /usr/src/dolly/gamedev/box3d-platform.c
	mkdir -p $(BUILD)
	cc $(FLAGS) '-DDOLLY_BOX3D_TRANSLATION_UNIT="$<"' -c $(WRAPPER) -o $@

/usr/lib/libblockwalker-box3d.a: $(OBJECTS) $(BUILD)/platform.o
	ar rcs $@ $^

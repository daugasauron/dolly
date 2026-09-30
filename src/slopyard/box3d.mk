SOURCE := /usr/src/box3d/src
BUILD := /tmp/slopyard-box3d
SOURCES := $(wildcard $(SOURCE)/*.c)
OBJECTS := $(patsubst $(SOURCE)/%.c,$(BUILD)/%.o,$(SOURCES))
FLAGS := -std=gnu17 -O2 -pthread -fno-builtin -U__SIZEOF_INT128__ -D__SSE__ -D__SSE2__ -I /usr/src/box3d/include -I $(SOURCE)
WRAPPER := /usr/src/dolly/slopyard/box3d-simd.c

.PHONY: all
all: /usr/lib/libslopyard-box3d.a

$(BUILD)/%.o: $(SOURCE)/%.c
	mkdir -p $(BUILD)
	cc $(FLAGS) '-DDOLLY_BOX3D_TRANSLATION_UNIT="$<"' -c $(WRAPPER) -o $@

/usr/lib/libslopyard-box3d.a: $(OBJECTS)
	rm -f $@
	ar rcs $@ $^

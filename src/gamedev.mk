CC := cc

.PHONY: all

all: /usr/bin/graphics-demo

/usr/bin/graphics-demo: /usr/src/dolly/gamedev/graphics-demo.c /usr/include/dolly/display.h
	$(CC) -std=c17 $< -o $@

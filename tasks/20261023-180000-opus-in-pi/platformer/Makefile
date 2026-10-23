CC      ?= cc
CFLAGS  ?= -O2 -Wall -Wextra
LDLIBS  = -lSDL2 -lm
OBJS    = main.o level.o player.o enemy.o render.o

platformer: $(OBJS)
	$(CC) $(CFLAGS) -o $@ $(OBJS) $(LDLIBS)

$(OBJS): game.h

check: platformer
	./platformer --check

clean:
	rm -f platformer $(OBJS)

.PHONY: check clean

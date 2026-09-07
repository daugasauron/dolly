.RECIPEPREFIX := >
SOURCE ?= source
PORT ?= dolly
OBJECT_DIR ?= objects
CC = cc
AR = ar
CFLAGS = -O0 -std=gnu11 -D_GNU_SOURCE -DDOLLY -I$(SOURCE)/include -I$(SOURCE)/src -I$(SOURCE)/src/unix
COMMON = fs-poll idna inet random strscpy strtok thread-common threadpool timer uv-common uv-data-getter-setters version
UNIX = async core dl fs getaddrinfo getnameinfo loop-watcher loop pipe poll signal stream tcp thread tty udp posix-poll posix-hrtime no-fsevents no-proctitle random-devurandom
OBJECTS = $(addprefix $(OBJECT_DIR)/,$(addsuffix .o,$(COMMON))) $(addprefix $(OBJECT_DIR)/unix-,$(addsuffix .o,$(UNIX))) $(OBJECT_DIR)/dolly-process.o $(OBJECT_DIR)/dolly-platform.o

all: libuv.a

$(OBJECT_DIR):
>mkdir -p $@

$(OBJECT_DIR)/%.o: $(SOURCE)/src/%.c | $(OBJECT_DIR)
>$(CC) $(CFLAGS) -c $< -o $@

$(OBJECT_DIR)/unix-%.o: $(SOURCE)/src/unix/%.c | $(OBJECT_DIR)
>$(CC) $(CFLAGS) -c $< -o $@

$(OBJECT_DIR)/dolly-%.o: $(PORT)/%.c | $(OBJECT_DIR)
>$(CC) $(CFLAGS) -c $< -o $@

libuv.a: $(OBJECTS)
>$(AR) rcs $@ $(OBJECTS)

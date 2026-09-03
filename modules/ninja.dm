DOLLY 2
MODULE ninja

# Samurai is a compact Ninja-compatible executor. Its upstream parser, graph,
# depfile handling, and build log stay as separate ordinary C translation
# units. The Dolly patch replaces only native process scheduling with the
# in-Wasm command lifecycle. `util.c` has two explicit loop checkpoints and is
# compiled without generic edge coverage, which otherwise causes a severe
# bootstrap-compiler blowup for that one file.
REQUIRES HEADER libc
REQUIRES HEADER runtime
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   tar

SOURCE HOST /static/default/samurai.tar                   /tmp/ninja/samurai.tar          c3bb0fcfad238dcf4e4fb9edc119563570772e09fe1cc85384868964ef2f939a
SOURCE HOST /static/default/runtimes/samurai-unit-dolly.c /tmp/ninja/samurai-unit-dolly.c 4412175ad18939c580d6a31ca89a1284d313026674d5ac4faa0841aab379a4f7

FILE /tmp/ninja/Makefile
    .RECIPEPREFIX := >
    SOURCE_ROOT := /tmp/ninja/source
    NAMES := build deps env graph htab log parse samu scan tool tree util os-posix
    SOURCES := $(addprefix $(SOURCE_ROOT)/,$(addsuffix .c,$(NAMES)))
    PARTS := 1 2 3 4 5 6 7 8 9 10 11 12 13
    UNIT := /tmp/ninja/samurai-unit-dolly.c
    OBJECTS := $(addprefix /tmp/ninja/part-,$(addsuffix .o,$(PARTS)))
    CFLAGS := -O1 -std=c99 -D_POSIX_C_SOURCE=200809L -DDOLLY -I $(SOURCE_ROOT)
    
    all: /usr/bin/ninja
    
    /tmp/ninja/part-12.o: $(UNIT) $(SOURCES)
    >cc \
    >  $(CFLAGS) \
    >  -O0 \
    >  -fdolly-runtime-interrupt-handler \
    >  -DDOLLY_SAMURAI_PART=12 \
    >  -c $(UNIT) \
    >  -o $@
    
    /tmp/ninja/part-%.o: $(UNIT) $(SOURCES)
    >cc \
    >  $(CFLAGS) \
    >  -DDOLLY_SAMURAI_PART=$* \
    >  -c $(UNIT) \
    >  -o $@
    
    /usr/bin/ninja: $(OBJECTS)
    >cc $(OBJECTS) -o $@

SLOP tar \
  -xf /tmp/ninja/samurai.tar \
  -C /
SLOP make \
  -f /tmp/ninja/Makefile

EXPORTS TOOL ninja

SLOP ninja \
  --version

FILE /usr/share/licenses/samurai/LICENSE

SLOP rm \
  -rf \
  /tmp/ninja

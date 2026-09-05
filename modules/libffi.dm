DOLLY 2
MODULE libffi

REQUIRES HEADER libc
REQUIRES TOOL   ar
REQUIRES TOOL   cc
REQUIRES TOOL   make
REQUIRES TOOL   rm
REQUIRES TOOL   slop
REQUIRES TOOL   tar

SOURCE HOST /static/python/libffi.tar /tmp/libffi.tar 0b9478e1c8726962026fc4fe97e647b60b00497f52e9709a8206daa5d7f5dc71
SLOP tar \
  -xf /tmp/libffi.tar \
  -C /

SOURCE HOST /static/python/runtimes/libffi-dolly.c /usr/src/libffi/src/dolly.c a253e2ff15cc13e771341792b3ac6b6c534af4b04e015f184e12593285877b12

FILE /tmp/libffi/Makefile
    .RECIPEPREFIX := >
    CC := cc
    AR := ar
    ROOT := /usr/src/libffi
    CFLAGS := -O1 -std=c17 -DDOLLY -DHAVE_CONFIG_H -I$(ROOT) -I$(ROOT)/include -I$(ROOT)/src
    NAMES := prep_cif types raw_api java_raw_api closures tramp dolly
    OBJECTS := $(addprefix /tmp/libffi/,$(addsuffix .o,$(NAMES)))
    all: /usr/lib/libffi.a
    /tmp/libffi/%.o: $(ROOT)/src/%.c
    >$(CC) $(CFLAGS) -c $< -o $@
    /usr/lib/libffi.a: $(OBJECTS)
    >$(AR) rcs $@ $^
SLOP make \
  -f /tmp/libffi/Makefile

FILE /tmp/libffi-check.c
    #include <ffi.h>
    #include <stdio.h>
    static int add(int left, int right) { return left + right; }
    static void add_closure(ffi_cif *cif, void *result, void **arguments,
                            void *context) {
      (void)cif;
      *(int *)result = *(int *)arguments[0] + *(int *)context;
    }
    int main(void) {
      ffi_cif cif;
      ffi_type *types[] = {&ffi_type_sint32, &ffi_type_sint32};
      int left = 19, right = 23, answer = 0;
      void *values[] = {&left, &right};
      if (ffi_prep_cif(&cif, FFI_DEFAULT_ABI, 2,
                       &ffi_type_sint32, types) != FFI_OK) return 10;
      ffi_call(&cif, FFI_FN(add), &answer, values);
      if (answer != 42) return 11;
      void *code = 0;
      ffi_closure *closure = ffi_closure_alloc(sizeof(*closure), &code);
      ffi_type *one_type[] = {&ffi_type_sint32};
      if (closure == 0 ||
          ffi_prep_cif(&cif, FFI_DEFAULT_ABI, 1,
                       &ffi_type_sint32, one_type) != FFI_OK ||
          ffi_prep_closure_loc(closure, &cif, add_closure, &right, code) != FFI_OK) {
        return 12;
      }
      int (*callback)(int) = code;
      answer = callback(19);
      ffi_closure_free(closure);
      if (answer != 42) return 13;
      return puts("LIBFFI-WASM64-OK") < 0 ? 14 : 0;
    }
SLOP cc \
  -O1 \
  -std=c17 \
  /tmp/libffi-check.c \
  -o /tmp/libffi-check \
  -lffi
SLOP slop \
  -c \
  /tmp/libffi-check

EXPORTS LIB    ffi       /usr/lib/libffi.a
EXPORTS HEADER ffi       /usr/include/ffi.h
EXPORTS HEADER ffitarget /usr/include/ffitarget.h
FILE /usr/share/licenses/libffi/LICENSE

SLOP rm \
  -rf \
  /tmp/libffi \
  /tmp/libffi-check \
  /tmp/libffi-check.c \
  /tmp/libffi.tar \
  /usr/src/libffi

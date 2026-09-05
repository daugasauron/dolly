/*
 * Dolly wasm64 target backend for upstream libffi.
 *
 * WebAssembly indirect calls require an exact static function type. The
 * process Worker owns the private function table and performs this final typed
 * dispatch through process-local operations on dolly-process-0. No JavaScript
 * library, browser object, or new Wasm import is exposed to the program.
 */

#include <dolly/process.h>

#include <ffi.h>
#include <ffi_common.h>

#include <stdint.h>
#include <stdlib.h>

#define DOLLY_FFI_MAX_ARGS 1000u
#define DOLLY_FFI_VARARGS_FLAG 1u

ffi_status FFI_HIDDEN ffi_prep_cif_machdep(ffi_cif *cif) {
  if (cif->abi != FFI_WASM64_EMSCRIPTEN) return FFI_BAD_ABI;
  if ((cif->flags & DOLLY_FFI_VARARGS_FLAG) == 0) {
    cif->nfixedargs = cif->nargs;
  }
  if (cif->nargs > DOLLY_FFI_MAX_ARGS ||
      cif->rtype->type == FFI_TYPE_COMPLEX) {
    return FFI_BAD_TYPEDEF;
  }
  for (unsigned index = 0; index < cif->nargs; ++index) {
    if (cif->arg_types[index]->type == FFI_TYPE_COMPLEX) {
      return FFI_BAD_TYPEDEF;
    }
  }
  return FFI_OK;
}

ffi_status FFI_HIDDEN ffi_prep_cif_machdep_var(
    ffi_cif *cif, unsigned nfixedargs, unsigned ntotalargs) {
  (void)ntotalargs;
  cif->flags |= DOLLY_FFI_VARARGS_FLAG;
  cif->nfixedargs = nfixedargs;
  return nfixedargs + 1u > DOLLY_FFI_MAX_ARGS
      ? FFI_BAD_TYPEDEF : FFI_OK;
}

void ffi_call(ffi_cif *cif, void (*function)(void),
              void *return_value, void **argument_values) {
  const dolly_process_ffi_call_request request = {
      .cif = (uintptr_t)cif,
      .function = (uintptr_t)function,
      .return_value = (uintptr_t)return_value,
      .argument_values = (uintptr_t)argument_values,
  };
  if (dolly_process_call(DOLLY_PROCESS_FFI_CALL,
                         &request, sizeof(request), NULL, 0) != 0) {
    abort();
  }
}

void *ffi_closure_alloc(size_t size, void **code) {
  if (code == NULL) return NULL;

  /* libffi promises an allocation of at least `size`; callers are allowed to
   * use a smaller allocation as an allocator-initialization probe.  Keep our
   * private ftramp bookkeeping available without weakening that contract. */
  const size_t allocation_size =
      size < sizeof(ffi_closure) ? sizeof(ffi_closure) : size;
  ffi_closure *closure = malloc(allocation_size);
  if (closure == NULL) return NULL;
  const dolly_process_ffi_closure_request request = {
      .closure = (uintptr_t)closure,
  };
  dolly_process_ffi_closure_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_FFI_CLOSURE_ALLOC,
      &request, sizeof(request), &response, sizeof(response));
  if (result != (int64_t)sizeof(response) || response.code == 0) {
    free(closure);
    return NULL;
  }
  closure->ftramp = (void *)(uintptr_t)response.code;
  *code = closure->ftramp;
  return closure;
}

void ffi_closure_free(void *pointer) {
  if (pointer == NULL) return;
  const dolly_process_ffi_closure_request request = {
      .closure = (uintptr_t)pointer,
  };
  (void)dolly_process_call(
      DOLLY_PROCESS_FFI_CLOSURE_FREE, &request, sizeof(request), NULL, 0);
  free(pointer);
}

ffi_status ffi_prep_closure_loc(
    ffi_closure *closure, ffi_cif *cif,
    void (*function)(ffi_cif *, void *, void **, void *),
    void *user_data, void *code) {
  if (closure == NULL || cif == NULL || function == NULL || code == NULL ||
      cif->abi != FFI_WASM64_EMSCRIPTEN) {
    return FFI_BAD_ABI;
  }
  const dolly_process_ffi_closure_prep_request request = {
      .closure = (uintptr_t)closure,
      .cif = (uintptr_t)cif,
      .function = (uintptr_t)function,
      .user_data = (uintptr_t)user_data,
      .code = (uintptr_t)code,
  };
  return dolly_process_call(
      DOLLY_PROCESS_FFI_CLOSURE_PREP,
      &request, sizeof(request), NULL, 0) == 0
      ? FFI_OK : FFI_BAD_TYPEDEF;
}

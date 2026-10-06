#include <dolly/dso.h>
#include <dolly/host.h>
#include <dolly/process.h>
#include <errno.h>

/* The FFI client: a program that links one of these calls records dso@0. */
DOLLY_HOST_REQUIRE(dso, 0, DOLLY_DSO_ABI_DIGEST);
_Static_assert(sizeof(dolly_ffi_call_request) == 32, "FFI call packet");
_Static_assert(sizeof(dolly_ffi_closure_prep_request) == 40, "FFI closure packet");

int dolly_ffi_call(const dolly_ffi_call_request *request) {
  return (int)dolly_process_call(DOLLY_FFI_CALL, request, sizeof(*request), 0, 0);
}

int dolly_ffi_closure_alloc(uint64_t closure, uint64_t *code) {
  const int64_t result = dolly_process_call(DOLLY_FFI_CLOSURE_ALLOC, &closure, 8, code, 8);
  return result < 0 ? (int)result : result == 8 ? 0 : -EIO;
}

int dolly_ffi_closure_free(uint64_t closure) {
  return (int)dolly_process_call(DOLLY_FFI_CLOSURE_FREE, &closure, 8, 0, 0);
}

int dolly_ffi_closure_prep(const dolly_ffi_closure_prep_request *request) {
  return (int)dolly_process_call(DOLLY_FFI_CLOSURE_PREP, request, sizeof(*request), 0, 0);
}

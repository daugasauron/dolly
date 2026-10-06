#pragma once
#include <stdint.h>
#include <dolly/dso-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Loadable modules and typed indirect calls, inside the calling process: they
 * add no kernel or browser capability. A program uses them when built to
 * (cc -rdynamic for a host of modules, linking dolly_ffi_* for FFI) and run in
 * an image that declares REQUIRES HOST dso@0 (grep HOST /etc/dolly/Dollyfile).
 * Not with -pthread. */

/* For DSO_OPEN, image_size bytes follow this header. A zero-sized image
 * selects the process executable itself. */
typedef struct {
  uint32_t flags;
  uint32_t reserved;
  uint64_t image_size;
} dolly_dso_open_request;

/* For DSO_SYMBOL, name_size UTF-8 bytes without a NUL follow this header. */
typedef struct {
  uint64_t handle;
  uint32_t name_size;
  uint32_t reserved;
} dolly_dso_symbol_request;

typedef struct {
  uint64_t handle;
} dolly_dso_close_request;

typedef struct {
  uint64_t value;
  int32_t error;
  uint32_t message_size;
  unsigned char message[DOLLY_DSO_ERROR_CAPACITY];
} dolly_dso_response;

/*
 * These packets contain offsets in the calling process's private memory and
 * function-table indices, not kernel or browser addresses. The layouts follow
 * libffi's wasm64 ABI; other FFI implementations may use the same operations.
 */
typedef struct {
  uint64_t cif;
  uint64_t function;
  uint64_t return_value;
  uint64_t argument_values;
} dolly_ffi_call_request;

typedef struct {
  uint64_t closure;
  uint64_t cif;
  uint64_t function;
  uint64_t user_data;
  uint64_t code;
} dolly_ffi_closure_prep_request;

/* dlopen, dlsym, dlerror and dlclose of <dlfcn.h>, which cc maps to these.
 * dolly_dlopen() accepts only a side module carrying the current
 * dolly.process.dso stamp. Its imports resolve from the executable and
 * already-loaded DSOs in the same private Worker; loading never delegates
 * filesystem access to the browser. In a program not linked -rdynamic they
 * fail with ENOSYS and a dlerror() that says so. */
void *dolly_dlopen(const char *path, int flags);
void *dolly_dlsym(void *handle, const char *name);
char *dolly_dlerror(void);
int dolly_dlclose(void *handle);

/* The FFI operations: zero or a negative errno. closure_alloc reserves the
 * table index that calls the closure, closure_prep binds it. */
int dolly_ffi_call(const dolly_ffi_call_request *request);
int dolly_ffi_closure_alloc(uint64_t closure, uint64_t *code);
int dolly_ffi_closure_free(uint64_t closure);
int dolly_ffi_closure_prep(const dolly_ffi_closure_prep_request *request);

#ifdef __cplusplus
}
#endif

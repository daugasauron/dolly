#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"

/*
 * Zig ships the exact WASI adapter expected by its stage-one bootstrap.
 * Bind those functions to WAMR while leaving every file operation in Dolly's
 * own libc and WasmFS.  The nested zig1.wasm instance has no browser imports.
 */
static uint8_t *zig_wasm_memory_base;
uint8_t **const wasm_memory = &zig_wasm_memory_base;

static uint16_t load_u16(const void *ptr) {
  uint16_t value;
  memcpy(&value, ptr, sizeof(value));
  return value;
}

static uint32_t load_u32(const void *ptr) {
  uint32_t value;
  memcpy(&value, ptr, sizeof(value));
  return value;
}

static uint64_t load_u64(const void *ptr) {
  uint64_t value;
  memcpy(&value, ptr, sizeof(value));
  return value;
}

uint16_t load16_align0(const uint8_t *ptr) { return load_u16(ptr); }
uint16_t load16_align1(const uint16_t *ptr) { return load_u16(ptr); }
uint32_t load32_align0(const uint8_t *ptr) { return load_u32(ptr); }
uint32_t load32_align1(const uint16_t *ptr) { return load_u32(ptr); }
uint32_t load32_align2(const uint32_t *ptr) { return load_u32(ptr); }
uint64_t load64_align0(const uint8_t *ptr) { return load_u64(ptr); }
uint64_t load64_align1(const uint16_t *ptr) { return load_u64(ptr); }
uint64_t load64_align2(const uint32_t *ptr) { return load_u64(ptr); }
uint64_t load64_align3(const uint64_t *ptr) { return load_u64(ptr); }

static void store_u16(void *ptr, uint16_t value) {
  memcpy(ptr, &value, sizeof(value));
}

static void store_u32(void *ptr, uint32_t value) {
  memcpy(ptr, &value, sizeof(value));
}

static void store_u64(void *ptr, uint64_t value) {
  memcpy(ptr, &value, sizeof(value));
}

void store16_align0(uint8_t *ptr, uint16_t value) { store_u16(ptr, value); }
void store16_align1(uint16_t *ptr, uint16_t value) { store_u16(ptr, value); }
void store32_align0(uint8_t *ptr, uint32_t value) { store_u32(ptr, value); }
void store32_align1(uint16_t *ptr, uint32_t value) { store_u32(ptr, value); }
void store32_align2(uint32_t *ptr, uint32_t value) { store_u32(ptr, value); }
void store64_align0(uint8_t *ptr, uint64_t value) { store_u64(ptr, value); }
void store64_align1(uint16_t *ptr, uint64_t value) { store_u64(ptr, value); }
void store64_align2(uint32_t *ptr, uint64_t value) { store_u64(ptr, value); }
void store64_align3(uint64_t *ptr, uint64_t value) { store_u64(ptr, value); }

static void zig_wasm_start_noop(void) {}

#ifdef main
#undef main
#endif
#define main zig_wasi_initialize
#define wasm__start zig_wasm_start_noop
#include "wasi.c"
#undef wasm__start
#undef main

static uint32_t zig_exit_code;
static bool zig_did_exit;

#define ARG32(index) ((uint32_t)args[(index)])
#define ARG64(index) ((uint64_t)args[(index)])
#define RETURN_WASI(expression) do { args[0] = (uint32_t)(expression); return; } while (0)

static void
zig_wasi_dispatch(wasm_exec_env_t exec_env, uint64_t *args)
{
  wasm_module_inst_t instance = wasm_runtime_get_module_inst(exec_env);
  zig_wasm_memory_base = wasm_runtime_addr_app_to_native(instance, 0);
  const char *name = wasm_runtime_get_function_attachment(exec_env);

  if (strcmp(name, "args_sizes_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_args_sizes_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "args_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_args_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "environ_sizes_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_environ_sizes_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "environ_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_environ_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "fd_prestat_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_prestat_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "fd_prestat_dir_name") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_prestat_dir_name(ARG32(0), ARG32(1), ARG32(2)));
  if (strcmp(name, "proc_exit") == 0) {
    zig_exit_code = ARG32(0);
    zig_did_exit = true;
    wasm_runtime_set_exception(instance, "zig bootstrap exited");
    return;
  }
  if (strcmp(name, "fd_read") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_read(ARG32(0), ARG32(1), ARG32(2), ARG32(3)));
  if (strcmp(name, "path_create_directory") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_create_directory(ARG32(0), ARG32(1), ARG32(2)));
  if (strcmp(name, "path_open") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_open(ARG32(0), ARG32(1), ARG32(2), ARG32(3), ARG32(4), ARG64(5), ARG64(6), ARG32(7), ARG32(8)));
  if (strcmp(name, "path_filestat_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_filestat_get(ARG32(0), ARG32(1), ARG32(2), ARG32(3), ARG32(4)));
  if (strcmp(name, "fd_fdstat_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_fdstat_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "fd_close") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_close(ARG32(0)));
  if (strcmp(name, "fd_readdir") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_readdir(ARG32(0), ARG32(1), ARG32(2), ARG64(3), ARG32(4)));
  if (strcmp(name, "path_unlink_file") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_unlink_file(ARG32(0), ARG32(1), ARG32(2)));
  if (strcmp(name, "path_remove_directory") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_remove_directory(ARG32(0), ARG32(1), ARG32(2)));
  if (strcmp(name, "path_rename") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_rename(ARG32(0), ARG32(1), ARG32(2), ARG32(3), ARG32(4), ARG32(5)));
  if (strcmp(name, "path_symlink") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_symlink(ARG32(0), ARG32(1), ARG32(2), ARG32(3), ARG32(4)));
  if (strcmp(name, "path_readlink") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_readlink(ARG32(0), ARG32(1), ARG32(2), ARG32(3), ARG32(4), ARG32(5)));
  if (strcmp(name, "path_link") == 0)
    RETURN_WASI(wasi_snapshot_preview1_path_link(ARG32(0), ARG32(1), ARG32(2), ARG32(3), ARG32(4), ARG32(5), ARG32(6)));
  if (strcmp(name, "fd_filestat_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_filestat_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "fd_pwrite") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_pwrite(ARG32(0), ARG32(1), ARG32(2), ARG64(3), ARG32(4)));
  if (strcmp(name, "fd_pread") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_pread(ARG32(0), ARG32(1), ARG32(2), ARG64(3), ARG32(4)));
  if (strcmp(name, "fd_seek") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_seek(ARG32(0), ARG64(1), ARG32(2), ARG32(3)));
  if (strcmp(name, "fd_sync") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_sync(ARG32(0)));
  if (strcmp(name, "fd_filestat_set_size") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_filestat_set_size(ARG32(0), ARG64(1)));
  if (strcmp(name, "fd_filestat_set_times") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_filestat_set_times(ARG32(0), ARG64(1), ARG64(2), ARG32(3)));
  if (strcmp(name, "clock_time_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_clock_time_get(ARG32(0), ARG64(1), ARG32(2)));
  if (strcmp(name, "clock_res_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_clock_res_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "poll_oneoff") == 0)
    RETURN_WASI(wasi_snapshot_preview1_poll_oneoff(ARG32(0), ARG32(1), ARG32(2), ARG32(3)));
  if (strcmp(name, "random_get") == 0)
    RETURN_WASI(wasi_snapshot_preview1_random_get(ARG32(0), ARG32(1)));
  if (strcmp(name, "fd_write") == 0)
    RETURN_WASI(wasi_snapshot_preview1_fd_write(ARG32(0), ARG32(1), ARG32(2), ARG32(3)));

  wasm_runtime_set_exception(instance, "unsupported Zig bootstrap WASI import");
}

#undef RETURN_WASI
#undef ARG64
#undef ARG32

#define ZIG_WASI_SYMBOL(name) { #name, (void *)zig_wasi_dispatch, NULL, (void *)#name }
static NativeSymbol zig_wasi_symbols[] = {
  ZIG_WASI_SYMBOL(args_sizes_get), ZIG_WASI_SYMBOL(args_get),
  ZIG_WASI_SYMBOL(environ_sizes_get), ZIG_WASI_SYMBOL(environ_get),
  ZIG_WASI_SYMBOL(fd_prestat_get), ZIG_WASI_SYMBOL(fd_prestat_dir_name),
  ZIG_WASI_SYMBOL(proc_exit), ZIG_WASI_SYMBOL(fd_read),
  ZIG_WASI_SYMBOL(path_create_directory), ZIG_WASI_SYMBOL(path_open),
  ZIG_WASI_SYMBOL(path_filestat_get), ZIG_WASI_SYMBOL(fd_fdstat_get),
  ZIG_WASI_SYMBOL(fd_close), ZIG_WASI_SYMBOL(fd_readdir),
  ZIG_WASI_SYMBOL(path_unlink_file), ZIG_WASI_SYMBOL(path_remove_directory),
  ZIG_WASI_SYMBOL(path_rename), ZIG_WASI_SYMBOL(path_symlink),
  ZIG_WASI_SYMBOL(path_readlink), ZIG_WASI_SYMBOL(path_link),
  ZIG_WASI_SYMBOL(fd_filestat_get), ZIG_WASI_SYMBOL(fd_pwrite),
  ZIG_WASI_SYMBOL(fd_pread), ZIG_WASI_SYMBOL(fd_seek),
  ZIG_WASI_SYMBOL(fd_sync), ZIG_WASI_SYMBOL(fd_filestat_set_size),
  ZIG_WASI_SYMBOL(fd_filestat_set_times), ZIG_WASI_SYMBOL(clock_time_get),
  ZIG_WASI_SYMBOL(clock_res_get), ZIG_WASI_SYMBOL(poll_oneoff),
  ZIG_WASI_SYMBOL(random_get), ZIG_WASI_SYMBOL(fd_write),
};
#undef ZIG_WASI_SYMBOL

static int
read_module(const char *path, uint8_t **bytes, uint32_t *size)
{
  FILE *stream = fopen(path, "rb");
  if (!stream || fseek(stream, 0, SEEK_END) != 0) return 0;
  long measured = ftell(stream);
  if (measured < 8 || measured > UINT32_MAX || fseek(stream, 0, SEEK_SET) != 0) {
    fclose(stream);
    return 0;
  }
  *bytes = malloc((size_t)measured);
  if (!*bytes || fread(*bytes, 1, (size_t)measured, stream) != (size_t)measured) {
    free(*bytes);
    *bytes = NULL;
    fclose(stream);
    return 0;
  }
  fclose(stream);
  *size = (uint32_t)measured;
  return 1;
}

/* WAMR's allocator ABI uses a 32-bit byte count even in our wasm64 host. */
static void *
wamr_malloc(unsigned int size)
{
  return malloc((size_t)size);
}

static void *
wamr_realloc(void *ptr, unsigned int size)
{
  return realloc(ptr, (size_t)size);
}

static void
wamr_free(void *ptr)
{
  free(ptr);
}

#ifndef DOLLY_ZIG1_WASM_PATH
#define DOLLY_ZIG1_WASM_PATH "/usr/src/zig/stage1/zig1.wasm"
#endif

int
dolly_main(int argc, char **argv)
{
  uint8_t *wasm = NULL;
  uint32_t wasm_size = 0;
  char error[256] = { 0 };
  wasm_module_t module = NULL;
  wasm_module_inst_t instance = NULL;
  wasm_exec_env_t exec_env = NULL;
  int status = 1;

  if (argc < 2) {
    fprintf(stderr, "usage: %s <zig-lib-path> <args...>\n", argv[0]);
    return 1;
  }
  if (!read_module(DOLLY_ZIG1_WASM_PATH, &wasm, &wasm_size)) {
    fprintf(stderr, "zig: cannot read %s\n", DOLLY_ZIG1_WASM_PATH);
    return 1;
  }

  RuntimeInitArgs init;
  memset(&init, 0, sizeof(init));
  init.mem_alloc_type = Alloc_With_Allocator;
  init.mem_alloc_option.allocator.malloc_func = wamr_malloc;
  init.mem_alloc_option.allocator.realloc_func = wamr_realloc;
  init.mem_alloc_option.allocator.free_func = wamr_free;
  init.running_mode = Mode_Interp;

  if (!wasm_runtime_full_init(&init)) {
    fprintf(stderr, "zig: cannot initialize WAMR\n");
    goto done;
  }
  if (!wasm_runtime_register_natives_raw(
          "wasi_snapshot_preview1", zig_wasi_symbols,
          (uint32_t)(sizeof(zig_wasi_symbols) / sizeof(zig_wasi_symbols[0])))) {
    fprintf(stderr, "zig: cannot bind bootstrap WASI\n");
    goto destroy_runtime;
  }

  module = wasm_runtime_load(wasm, wasm_size, error, sizeof(error));
  if (!module) {
    fprintf(stderr, "zig: cannot load bootstrap module: %s\n", error);
    goto destroy_runtime;
  }
  instance = wasm_runtime_instantiate(module, 16 * 1024 * 1024, 0, error, sizeof(error));
  if (!instance) {
    fprintf(stderr, "zig: cannot instantiate bootstrap module: %s\n", error);
    goto unload;
  }
  exec_env = wasm_runtime_create_exec_env(instance, 16 * 1024 * 1024);
  if (!exec_env) {
    fprintf(stderr, "zig: cannot create bootstrap execution stack\n");
    goto deinstantiate;
  }

  zig_wasi_initialize(argc, argv);
  zig_did_exit = false;
  zig_exit_code = 0;
  wasm_function_inst_t start = wasm_runtime_lookup_function(instance, "_start");
  if (!start) {
    fprintf(stderr, "zig: bootstrap module has no _start export\n");
  } else if (wasm_runtime_call_wasm(exec_env, start, 0, NULL)) {
    status = 0;
  } else if (zig_did_exit) {
    status = (int)zig_exit_code;
  } else {
    fprintf(stderr, "zig: bootstrap compiler trapped: %s\n",
            wasm_runtime_get_exception(instance));
  }

  wasm_runtime_destroy_exec_env(exec_env);
deinstantiate:
  wasm_runtime_deinstantiate(instance);
unload:
  wasm_runtime_unload(module);
destroy_runtime:
  wasm_runtime_destroy();
done:
  free(wasm);
  return status;
}

#define _GNU_SOURCE

/*
 * Process-local mmap emulation for Dolly's WebAssembly target.
 *
 * A mapping is ordinary private Wasm memory. File-backed mappings copy bytes
 * through Dolly's descriptor substrate and retain their own descriptor, so the
 * mapping remains valid after the caller closes the descriptor used to create
 * it. MAP_SHARED mappings copy changed bytes back on msync() and munmap(). No
 * browser mapping, JavaScript object, or additional machine import is needed.
 *
 * Wasm cannot revoke access to a subrange of linear memory. Version 0 therefore
 * supports whole-mapping munmap(), which is the only operation for which it can
 * provide honest lifetime semantics. Advice is accepted as a validated no-op.
 */

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
#include <wasi/api.h>

#define DOLLY_WASM_PAGE_SIZE 65536u
#define DOLLY_MMAP2_OFFSET_UNIT 4096u

typedef struct dolly_mapping {
  void *address;
  size_t length;
  uint64_t file_offset;
  int descriptor;
  int protection;
  int flags;
  struct dolly_mapping *next;
} dolly_mapping;

static dolly_mapping *mappings;

static dolly_mapping *find_mapping(const void *address, size_t length) {
  const uintptr_t start = (uintptr_t)address;
  if (length > UINTPTR_MAX - start) return NULL;
  const uintptr_t end = start + length;
  for (dolly_mapping *mapping = mappings; mapping != NULL;
       mapping = mapping->next) {
    const uintptr_t mapped_start = (uintptr_t)mapping->address;
    if (mapping->length <= UINTPTR_MAX - mapped_start &&
        start >= mapped_start && end <= mapped_start + mapping->length) {
      return mapping;
    }
  }
  return NULL;
}

static int read_mapping(int descriptor, void *address, size_t length,
                        uint64_t offset) {
  unsigned char *cursor = address;
  size_t remaining = length;
  while (remaining != 0) {
    __wasi_iovec_t vector = {.buf = cursor, .buf_len = remaining};
    __wasi_size_t completed = 0;
    const __wasi_errno_t error = __wasi_fd_pread(
        (__wasi_fd_t)descriptor, &vector, 1, offset, &completed);
    if (error != 0) return -(int)error;
    if (completed > remaining) return -EIO;
    cursor += completed;
    remaining -= completed;
    offset += completed;
    if (completed == 0) break;
  }
  memset(cursor, 0, remaining);
  return 0;
}

static int write_mapping(const dolly_mapping *mapping,
                         const void *address, size_t length) {
  if (mapping->descriptor < 0 ||
      (mapping->flags & MAP_TYPE) != MAP_SHARED ||
      (mapping->protection & PROT_WRITE) == 0 || length == 0) {
    return 0;
  }
  const uintptr_t delta = (uintptr_t)address - (uintptr_t)mapping->address;
  const unsigned char *cursor = address;
  size_t remaining = length;
  uint64_t offset = mapping->file_offset + delta;
  while (remaining != 0) {
    __wasi_ciovec_t vector = {.buf = cursor, .buf_len = remaining};
    __wasi_size_t completed = 0;
    const __wasi_errno_t error = __wasi_fd_pwrite(
        (__wasi_fd_t)mapping->descriptor, &vector, 1, offset, &completed);
    if (error != 0) return -(int)error;
    if (completed == 0 || completed > remaining) return -EIO;
    cursor += completed;
    remaining -= completed;
    offset += completed;
  }
  return 0;
}

intptr_t __syscall_mmap2(void *requested_address, size_t length,
                         int protection, int flags, int descriptor,
                         off_t page_offset) {
  if (requested_address != NULL || length == 0) return -EINVAL;
  if ((protection & ~(PROT_READ | PROT_WRITE | PROT_EXEC)) != 0) return -EINVAL;
  if ((protection & PROT_EXEC) != 0) return -EPERM;
  const int mapping_type = flags & MAP_TYPE;
  if (mapping_type != MAP_PRIVATE && mapping_type != MAP_SHARED) return -EINVAL;
  if ((flags & MAP_FIXED) != 0) return -ENOTSUP;
  if (page_offset < 0 ||
      (uint64_t)page_offset > UINT64_MAX / DOLLY_MMAP2_OFFSET_UNIT) {
    return -EINVAL;
  }

  dolly_mapping *mapping = malloc(sizeof(*mapping));
  if (mapping == NULL) return -ENOMEM;
  void *address = NULL;
  if (posix_memalign(&address, DOLLY_WASM_PAGE_SIZE, length) != 0) {
    free(mapping);
    return -ENOMEM;
  }
  memset(address, 0, length);

  int retained_descriptor = -1;
  const uint64_t file_offset =
      (uint64_t)page_offset * DOLLY_MMAP2_OFFSET_UNIT;
  if ((flags & MAP_ANONYMOUS) == 0) {
    const int descriptor_flags = fcntl(descriptor, F_GETFL);
    if (descriptor_flags < 0) {
      free(address);
      free(mapping);
      return -errno;
    }
    if ((descriptor_flags & O_ACCMODE) == O_WRONLY ||
        (mapping_type == MAP_SHARED && (protection & PROT_WRITE) != 0 &&
         (descriptor_flags & O_ACCMODE) != O_RDWR)) {
      free(address);
      free(mapping);
      return -EACCES;
    }
    retained_descriptor = dup(descriptor);
    if (retained_descriptor < 0) {
      const int error = errno;
      free(address);
      free(mapping);
      return -error;
    }
    const int result = read_mapping(
        retained_descriptor, address, length, file_offset);
    if (result != 0) {
      close(retained_descriptor);
      free(address);
      free(mapping);
      return result;
    }
  }

  *mapping = (dolly_mapping){
      .address = address,
      .length = length,
      .file_offset = file_offset,
      .descriptor = retained_descriptor,
      .protection = protection,
      .flags = flags,
      .next = mappings,
  };
  mappings = mapping;
  return (intptr_t)address;
}

int __syscall_msync(void *address, size_t length, int flags) {
  if (length == 0 ||
      (flags & ~(MS_ASYNC | MS_SYNC | MS_INVALIDATE)) != 0 ||
      ((flags & MS_ASYNC) != 0) == ((flags & MS_SYNC) != 0)) {
    return -EINVAL;
  }
  dolly_mapping *mapping = find_mapping(address, length);
  return mapping == NULL ? -ENOMEM : write_mapping(mapping, address, length);
}

int __syscall_munmap(void *address, size_t length) {
  dolly_mapping **link = &mappings;
  while (*link != NULL &&
         ((*link)->address != address || (*link)->length != length)) {
    link = &(*link)->next;
  }
  if (*link == NULL || length == 0) return -EINVAL;
  dolly_mapping *mapping = *link;
  const int result = write_mapping(mapping, address, length);
  if (result != 0) return result;
  *link = mapping->next;
  if (mapping->descriptor >= 0) close(mapping->descriptor);
  free(mapping->address);
  free(mapping);
  return 0;
}

int __syscall_madvise(void *address, size_t length, int advice) {
  if (length == 0 || find_mapping(address, length) == NULL) return -ENOMEM;
  switch (advice) {
    case MADV_NORMAL:
    case MADV_RANDOM:
    case MADV_SEQUENTIAL:
    case MADV_WILLNEED:
    case MADV_DONTNEED:
#ifdef MADV_FREE
    case MADV_FREE:
#endif
      return 0;
    default:
      return -EINVAL;
  }
}

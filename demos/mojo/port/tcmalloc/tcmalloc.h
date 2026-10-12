// TCMalloc's three entry points that AsyncRT calls, over the C library's
// allocator: TCMalloc has no WebAssembly port. Its NUMA partition is advice.
#include <malloc.h>
#include <stdlib.h>

inline void *TCMallocInternalMemalign(size_t alignment, size_t size) {
  return memalign(alignment, size);
}
inline void *TCMallocInternalMemalignNumaPartition(size_t alignment, size_t size, size_t) {
  return memalign(alignment, size);
}
inline void TCMallocInternalFree(void *pointer) { free(pointer); }

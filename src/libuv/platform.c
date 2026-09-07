#include "uv.h"

/* Host machine information is not part of Dolly's process contract. libuv
   specifies zero for unknown memory sizes and unsupported load averages. */
uint64_t uv_get_total_memory(void) { return 0; }
uint64_t uv_get_free_memory(void) { return 0; }
uint64_t uv_get_available_memory(void) { return 0; }
uint64_t uv_get_constrained_memory(void) { return 0; }
void uv_loadavg(double avg[3]) { avg[0] = avg[1] = avg[2] = 0; }
int uv_resident_set_memory(size_t* rss) { return UV_ENOSYS; }
int uv_uptime(double* uptime) { return UV_ENOSYS; }
int uv_exepath(char* buffer, size_t* size) { return UV_ENOSYS; }
int uv_cpu_info(uv_cpu_info_t** infos, int* count) {
  *infos = NULL;
  *count = 0;
  return UV_ENOSYS;
}
int uv_interface_addresses(uv_interface_address_t** addresses, int* count) {
  *addresses = NULL;
  *count = 0;
  return UV_ENOSYS;
}

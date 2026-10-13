#include <dolly/nena.h>
#include <dolly/host.h>

DOLLY_HOST_REQUIRE(nena, 0, DOLLY_NENA_ABI_DIGEST);
#include <dolly/process.h>
#include <errno.h>
#include <string.h>

_Static_assert(sizeof(dolly_nena_module) == DOLLY_NENA_REPLY_BYTES, "nena module record");

static int fail(int error) { errno = error; return -1; }
static void u32(void *data, size_t offset, uint32_t n) { memcpy((char *)data + offset, &n, 4); }
static void u64(void *data, size_t offset, uint64_t n) { memcpy((char *)data + offset, &n, 8); }

static int call(dolly_nena *nena, unsigned operation, size_t bytes, size_t reply_bytes) {
  if (!nena) return fail(EINVAL);
  if (operation != DOLLY_NENA_OPEN && !nena->scope) return fail(EBADF);
  /* Reserve the last sequence for CLOSE so an exhausted lease can be reopened. */
  if (nena->sequence >= UINT32_MAX - (operation != DOLLY_NENA_CLOSE)) return fail(EOVERFLOW);
  u32(nena->packet, 0, DOLLY_NENA_VERSION);
  u32(nena->packet, 4, operation);
  u64(nena->packet, 8, nena->scope);
  u64(nena->packet, 16, ++nena->sequence);
  u32(nena->packet, 24, bytes - 32);
  u32(nena->packet, 28, 0);
  int64_t result = dolly_process_call(DOLLY_NENA_PROCESS_OP, nena->packet, bytes, nena->reply, sizeof(nena->reply));
  if (result < 0 && result >= -4095) return fail((int)-result);
  return result == (int64_t)reply_bytes ? 0 : fail(EPROTO);
}

int dolly_nena_open(dolly_nena *nena) {
  if (!nena) return fail(EINVAL);
  if (nena->scope) return fail(EBUSY);
  memset(nena, 0, sizeof(*nena));
  if (call(nena, DOLLY_NENA_OPEN, 32, 8) < 0) return -1;
  uint64_t scope;
  memcpy(&scope, nena->reply, 8);
  if (!scope || scope > UINT32_MAX) return fail(EPROTO);
  nena->scope = scope;
  return 0;
}

int dolly_nena_close(dolly_nena *nena) {
  if (call(nena, DOLLY_NENA_CLOSE, 32, 0) < 0) return -1;
  nena->scope = 0;
  return 0;
}

/* The reply is a module record whose texts end inside their fields. */
static int module_reply(const dolly_nena *nena, dolly_nena_module *module) {
  memcpy(module, nena->reply, sizeof(*module));
  if (module->name[sizeof(module->name) - 1] || module->gives[sizeof(module->gives) - 1] ||
      module->reason[sizeof(module->reason) - 1]) return fail(EPROTO);
  return 0;
}

int dolly_nena_module_at(dolly_nena *nena, uint32_t index, dolly_nena_module *module) {
  if (!nena || !module) return fail(EINVAL);
  u32(nena->packet, 32, index);
  u32(nena->packet, 36, 0);
  return call(nena, DOLLY_NENA_MODULE, 40, sizeof(*module)) < 0 ? -1 : module_reply(nena, module);
}

static int switch_module(dolly_nena *nena, unsigned operation, const char *name, uint32_t version,
                         dolly_nena_module *module) {
  if (!nena || !name || !module || strlen(name) >= DOLLY_NENA_NAME_BYTES) return fail(EINVAL);
  memset(nena->packet + 32, 0, 40);
  memcpy(nena->packet + 32, name, strlen(name));
  u32(nena->packet, 64, version);
  if (call(nena, operation, 72, sizeof(*module)) < 0 || module_reply(nena, module) < 0) return -1;
  const int enabled = (module->state & DOLLY_NENA_ENABLED) != 0;
  return enabled == (operation == DOLLY_NENA_ENABLE) ? 0 : fail(ENOTSUP);
}

int dolly_nena_enable(dolly_nena *nena, const char *name, uint32_t version, dolly_nena_module *module) {
  return switch_module(nena, DOLLY_NENA_ENABLE, name, version, module);
}

int dolly_nena_disable(dolly_nena *nena, const char *name, uint32_t version, dolly_nena_module *module) {
  return switch_module(nena, DOLLY_NENA_DISABLE, name, version, module);
}

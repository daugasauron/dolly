#pragma once
#include <dolly/nena-abi.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
  uint64_t scope, sequence;
  unsigned char packet[DOLLY_NENA_PACKET_BYTES], reply[DOLLY_NENA_REPLY_BYTES];
} dolly_nena;
/* One host module of the page. state is a set of DOLLY_NENA_ENABLED (the
   session has it now), DOLLY_NENA_DECLARED (the page started with it: the
   image declares it) and DOLLY_NENA_FIXED (it cannot be switched). gives is
   one line of what the module gives a session; reason says why the module is
   fixed or why the last switch was refused, and is empty otherwise. */
typedef struct {
  char name[DOLLY_NENA_NAME_BYTES];
  uint32_t version, state;
  char gives[DOLLY_NENA_GIVES_BYTES], reason[DOLLY_NENA_REASON_BYTES];
} dolly_nena_module;
/* The host modules of the session, for an image that declares nena@0; in any
   other, and once a session has disabled nena itself, open fails with ENOSYS.
   Zero-initialize before first use; called serially. Functions return -1 and
   set errno on failure. module_at gives the index-th module, ENOENT past the
   last. enable and disable switch NAME@VERSION and return the module as it
   then is: 0 when it is in the state asked for, ENOTSUP with module->reason
   when the page refused, ENOENT when the page has no such module. Disabling
   takes the module from the session at once: programs that record it are
   refused and its calls to the page fail with ENOSYS, in a running process
   too. */
int dolly_nena_open(dolly_nena *nena);
int dolly_nena_close(dolly_nena *nena);
int dolly_nena_module_at(dolly_nena *nena, uint32_t index, dolly_nena_module *module);
int dolly_nena_enable(dolly_nena *nena, const char *name, uint32_t version, dolly_nena_module *module);
int dolly_nena_disable(dolly_nena *nena, const char *name, uint32_t version, dolly_nena_module *module);
#ifdef __cplusplus
}
#endif

#ifndef DOLLY_SESSION_SNAPSHOT_H
#define DOLLY_SESSION_SNAPSHOT_H

#include <stdint.h>

// The browser can request an opaque filesystem snapshot through shared
// memory. Dolly services the request only from a cooperative input boundary;
// no filesystem operation is delegated to the browser.
uintptr_t dolly_session_mailbox_address(void);
uint32_t dolly_session_mailbox_version(void);
uintptr_t dolly_session_name_address(void);
uint32_t dolly_session_name_capacity(void);
uintptr_t dolly_session_transfer_address(void);
uint32_t dolly_session_transfer_capacity(void);
uintptr_t dolly_session_restore_address(uintptr_t size);
int dolly_session_restore(uintptr_t size);
void dolly_session_service(void);

#endif

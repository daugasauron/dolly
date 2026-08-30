#ifndef DOLLY_SYSTEM_SNAPSHOT_H
#define DOLLY_SYSTEM_SNAPSHOT_H

#include <stddef.h>
#include <stdint.h>

// The build packages this as an opaque blob. Paths, validation, and all
// filesystem operations remain owned by the Wasm runtime.
uintptr_t dolly_snapshot_restore_address(uintptr_t size);
int dolly_snapshot_restore_staged(uintptr_t size);
int dolly_snapshot_capture(void);
uintptr_t dolly_snapshot_address(void);
uintptr_t dolly_snapshot_size(void);
uint32_t dolly_snapshot_format_version(void);

#endif

#ifndef DOLLY_SYSTEM_SNAPSHOT_H
#define DOLLY_SYSTEM_SNAPSHOT_H

#include <stddef.h>
#include <stdint.h>

// The build packages this as an opaque blob. Paths, validation, and all
// filesystem operations remain owned by the Wasm runtime.
uintptr_t dolly_snapshot_restore_address(uintptr_t size);
// Validate the whole image; restore all paths or one regular file for bootstrap.
// Consumes the staging allocation on success or failure; restage before retrying.
int dolly_snapshot_restore_staged(uintptr_t size, const char *only_path);
// Fresh boot only. Begin consumes the expected SHA-256 from the staging range.
// Parts may arrive in any order; every manifest path must appear exactly once.
// Failure leaves a partial filesystem that must never be started or reused.
int dolly_snapshot_stream_begin(uintptr_t size);
int dolly_snapshot_stream_write(uintptr_t size, uint32_t end_part);
int dolly_snapshot_stream_finish(void);
// A new capture invalidates the old range; failed capture leaves no range.
int dolly_snapshot_capture(void);
uintptr_t dolly_snapshot_address(void);
uintptr_t dolly_snapshot_size(void);
uint32_t dolly_snapshot_format_version(void);

// Boot-only: release captured bytes and discard unretained build inputs.
// The worker must copy the capture before finishing boot. Not a host export.
int dolly_snapshot_prune(void);

#endif
